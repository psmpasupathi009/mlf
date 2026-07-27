import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { User, UserRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  createRefreshTokenValue,
  hashToken,
  refreshTokenExpiresAt,
  signAccessToken,
  verifyAccessToken,
  type AccessTokenPayload,
} from "@/lib/auth/jwt";
import { getEffectivePermissionsForRoles } from "@/lib/rbac";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth/cookie-names";
import { userPhotoUrl } from "@/lib/auth/user-photo";

export { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth/cookie-names";

/**
 * Fields needed for auth/session + public profile.
 * Declared explicitly so the app doesn’t break if the IDE’s Prisma
 * client cache is stale (schema uses `roles[]`, not singular `role`).
 */
export type AuthUser = {
  id: string;
  unitId: string;
  mobile: string;
  roles: UserRole[];
  name: string | null;
  designation?: string | null;
  email?: string | null;
  address?: string | null;
  photoKey?: string | null;
  isActive: boolean;
};

/** Public contract — never expose Mongo ObjectId. */
export type PublicUser = {
  unitId: string;
  mobile: string;
  roles: UserRole[];
  name?: string;
  designation?: string;
  email?: string;
  address?: string;
  /** Authenticated photo URL when user has uploaded a profile pic */
  photoUrl?: string;
  permissions: string[];
};

export async function toPublicUser(user: AuthUser): Promise<PublicUser> {
  const permissions = user.isActive
    ? await getEffectivePermissionsForRoles(user.roles)
    : [];
  return {
    unitId: user.unitId,
    mobile: user.mobile,
    roles: user.roles,
    name: user.name ?? undefined,
    designation: user.designation ?? undefined,
    email: user.email ?? undefined,
    address: user.address ?? undefined,
    photoUrl: userPhotoUrl(user.unitId, Boolean(user.photoKey)),
    permissions,
  };
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export async function issueAuthTokens(user: AuthUser): Promise<{
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}> {
  const accessToken = await signAccessToken({
    userId: user.id,
    mobile: user.mobile,
    roles: user.roles,
  });

  const refreshToken = createRefreshTokenValue();
  // Drop expired rows so login/refresh doesn't accumulate dead tokens.
  await prisma.refreshToken.deleteMany({
    where: { userId: user.id, expiresAt: { lte: new Date() } },
  });
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshTokenExpiresAt(),
    },
  });

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
      failedPinAttempts: 0,
      pinLockedUntil: null,
    },
  });

  return {
    accessToken,
    refreshToken,
    user: await toPublicUser(updated as unknown as AuthUser),
  };
}

export function attachAuthCookies(
  response: NextResponse,
  tokens: { accessToken: string; refreshToken: string }
): NextResponse {
  response.cookies.set(ACCESS_COOKIE, tokens.accessToken, cookieOptions(15 * 60));
  response.cookies.set(
    REFRESH_COOKIE,
    tokens.refreshToken,
    cookieOptions(7 * 24 * 60 * 60)
  );
  return response;
}

export function clearAuthCookies(response: NextResponse): NextResponse {
  response.cookies.set(ACCESS_COOKIE, "", { ...cookieOptions(0), maxAge: 0 });
  response.cookies.set(REFRESH_COOKIE, "", { ...cookieOptions(0), maxAge: 0 });
  return response;
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  await prisma.refreshToken.deleteMany({
    where: { tokenHash: hashToken(refreshToken) },
  });
}

export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { userId } });
}

export type RotateRefreshResult =
  | {
      ok: true;
      accessToken: string;
      refreshToken: string;
      user: PublicUser;
    }
  | {
      ok: false;
      /**
       * `raced` = concurrent rotate in flight on another isolate — do not clear
       * cookies; client should retry briefly.
       * `invalid` = token unknown/expired — clear cookies.
       */
      reason: "invalid" | "raced" | "inactive";
    };

/** Short-lived replay so concurrent refreshes share one rotation (same process). */
type RotationGrace = {
  accessToken: string;
  refreshToken: string;
  userId: string;
  expiresAt: number;
};

const ROTATION_GRACE_MS = 60_000;
const rotationGrace = new Map<string, RotationGrace>();

function readRotationGrace(oldHash: string): RotationGrace | null {
  const hit = rotationGrace.get(oldHash);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    rotationGrace.delete(oldHash);
    return null;
  }
  return hit;
}

/** First publisher wins; later callers reuse the same opaque tokens. */
function publishRotationGrace(
  oldHash: string,
  tokens: Omit<RotationGrace, "expiresAt">
): RotationGrace {
  const existing = readRotationGrace(oldHash);
  if (existing) return existing;
  const entry: RotationGrace = {
    ...tokens,
    expiresAt: Date.now() + ROTATION_GRACE_MS,
  };
  rotationGrace.set(oldHash, entry);
  return entry;
}

async function replayGraceRotation(
  grace: RotationGrace
): Promise<RotateRefreshResult> {
  const user = await prisma.user.findUnique({ where: { id: grace.userId } });
  if (!user || !user.isActive) {
    return { ok: false, reason: "inactive" };
  }
  return {
    ok: true,
    accessToken: grace.accessToken,
    refreshToken: grace.refreshToken,
    user: await toPublicUser(user as unknown as AuthUser),
  };
}

/**
 * Rotate refresh token. Concurrent requests with the same token reuse one
 * minted pair via in-process grace (avoids 409-before-Set-Cookie races).
 */
export async function rotateRefreshToken(
  refreshToken: string
): Promise<RotateRefreshResult> {
  const tokenHash = hashToken(refreshToken);
  const now = new Date();

  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
  });

  if (!existing) {
    const grace = readRotationGrace(tokenHash);
    if (grace) return replayGraceRotation(grace);
    // Unknown or already rotated on another isolate — not safe to treat as OK.
    return { ok: false, reason: "invalid" };
  }

  if (existing.expiresAt.getTime() <= now.getTime()) {
    await prisma.refreshToken.deleteMany({ where: { id: existing.id } });
    return { ok: false, reason: "invalid" };
  }

  const user = await prisma.user.findUnique({ where: { id: existing.userId } });
  if (!user || !user.isActive) {
    return { ok: false, reason: "inactive" };
  }

  // Mint first, publish grace before consume so a loser never 409s empty-handed.
  const accessToken = await signAccessToken({
    userId: user.id,
    mobile: user.mobile,
    roles: user.roles,
  });
  const nextRefresh = createRefreshTokenValue();
  const grace = publishRotationGrace(tokenHash, {
    accessToken,
    refreshToken: nextRefresh,
    userId: user.id,
  });

  // We lost the in-process race — return the winner's pair (same cookies).
  if (grace.refreshToken !== nextRefresh) {
    return replayGraceRotation(grace);
  }

  // Best-effort consume + persist. Unique tokenHash: second create is a no-op.
  await prisma.refreshToken.deleteMany({
    where: { id: existing.id, tokenHash },
  });
  try {
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(grace.refreshToken),
        expiresAt: refreshTokenExpiresAt(),
      },
    });
  } catch {
    // Already inserted by a concurrent twin that shared this grace pair.
  }

  // Drop expired rows in the background — don't block the response.
  void prisma.refreshToken
    .deleteMany({
      where: { userId: user.id, expiresAt: { lte: now } },
    })
    .catch(() => undefined);

  return {
    ok: true,
    accessToken: grace.accessToken,
    refreshToken: grace.refreshToken,
    user: await toPublicUser(user as unknown as AuthUser),
  };
}

export function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
}

export async function getAccessPayloadFromRequest(
  request: Request
): Promise<AccessTokenPayload | null> {
  const bearer = getBearerToken(request);
  if (bearer) return verifyAccessToken(bearer);

  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(ACCESS_COOKIE)?.value;
  if (!cookieToken) return null;
  return verifyAccessToken(cookieToken);
}

export async function getCurrentUser(request: Request): Promise<User | null> {
  const payload = await getAccessPayloadFromRequest(request);
  if (!payload?.sub) return null;

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) return null;
  return user;
}

export function applyCorsHeaders(
  request: Request,
  response: NextResponse
): NextResponse {
  const origin = request.headers.get("origin");
  const allowed = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  if (origin && allowed.includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Refresh-Token"
    );
    response.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  }

  return response;
}

export function corsPreflight(request: Request): NextResponse | null {
  if (request.method !== "OPTIONS") return null;
  const response = new NextResponse(null, { status: 204 });
  return applyCorsHeaders(request, response);
}
