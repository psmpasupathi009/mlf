import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { User, UserRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  accessSessionMatches,
  signAccessToken,
  verifyAccessToken,
  type AccessTokenPayload,
} from "@/lib/auth/jwt";
import { getEffectivePermissionsForRoles } from "@/lib/rbac";
import {
  ACCESS_COOKIE,
  ACCESS_COOKIE_MAX_AGE_SEC,
  LEGACY_REFRESH_COOKIE,
} from "@/lib/auth/cookie-names";
import { userPhotoUrl } from "@/lib/auth/user-photo";

export { ACCESS_COOKIE } from "@/lib/auth/cookie-names";

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
  clientUnitId?: string | null;
  isActive: boolean;
  sessionVersion?: number | null;
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
  /** Linked Client.unitId when this is a client portal login. */
  clientUnitId?: string;
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
    clientUnitId: user.clientUnitId ?? undefined,
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
  user: PublicUser;
}> {
  const accessToken = await signAccessToken({
    unitId: user.unitId,
    mobile: user.mobile,
    roles: user.roles,
    clientUnitId: user.clientUnitId,
    sessionVersion: user.sessionVersion,
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
    user: await toPublicUser(updated as unknown as AuthUser),
  };
}

export function attachAuthCookies(
  response: NextResponse,
  tokens: { accessToken: string }
): NextResponse {
  response.cookies.set(
    ACCESS_COOKIE,
    tokens.accessToken,
    cookieOptions(ACCESS_COOKIE_MAX_AGE_SEC)
  );
  // Drop any leftover refresh cookie from older clients.
  response.cookies.set(LEGACY_REFRESH_COOKIE, "", {
    ...cookieOptions(0),
    maxAge: 0,
  });
  return response;
}

export function clearAuthCookies(response: NextResponse): NextResponse {
  response.cookies.set(ACCESS_COOKIE, "", { ...cookieOptions(0), maxAge: 0 });
  response.cookies.set(LEGACY_REFRESH_COOKIE, "", {
    ...cookieOptions(0),
    maxAge: 0,
  });
  return response;
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

/** True for legacy JWT subjects that still carry a Mongo ObjectId. */
function isLegacyObjectIdSub(sub: string): boolean {
  return /^[a-f\d]{24}$/i.test(sub);
}

/**
 * Resolve user from JWT `sub` (unitId). Falls back to Mongo ObjectId for
 * cookies issued before the unitId migration.
 */
export async function findUserByAccessSub(sub: string) {
  const byUnit = await prisma.user.findUnique({ where: { unitId: sub } });
  if (byUnit) return byUnit;
  if (!isLegacyObjectIdSub(sub)) return null;
  return prisma.user.findUnique({ where: { id: sub } });
}

export async function getCurrentUser(request: Request): Promise<User | null> {
  const payload = await getAccessPayloadFromRequest(request);
  if (!payload?.sub) return null;

  const user = await findUserByAccessSub(payload.sub);
  if (!user || !user.isActive) return null;
  if (!accessSessionMatches(payload, user.sessionVersion)) return null;
  return user;
}

const CORS_ALLOW_HEADERS = "Content-Type, Authorization";
const CORS_ALLOW_METHODS = "GET,POST,PUT,PATCH,DELETE,OPTIONS";

export function applyCorsHeaders(
  request: Request,
  response: NextResponse
): NextResponse {
  const origin = request.headers.get("origin");
  const allowed = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  const requestHeaders = (
    request.headers.get("access-control-request-headers") ?? ""
  ).toLowerCase();
  const bearerClient =
    Boolean(getBearerToken(request)) || requestHeaders.includes("authorization");

  if (origin && allowed.includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Access-Control-Allow-Headers", CORS_ALLOW_HEADERS);
    response.headers.set("Access-Control-Allow-Methods", CORS_ALLOW_METHODS);
  } else if (origin && bearerClient) {
    // Native / mobile clients send Bearer; they are not limited to web origins.
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Headers", CORS_ALLOW_HEADERS);
    response.headers.set("Access-Control-Allow-Methods", CORS_ALLOW_METHODS);
  }

  return response;
}

export function corsPreflight(request: Request): NextResponse | null {
  if (request.method !== "OPTIONS") return null;
  const response = new NextResponse(null, { status: 204 });
  return applyCorsHeaders(request, response);
}
