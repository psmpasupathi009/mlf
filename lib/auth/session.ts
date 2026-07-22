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

export const ACCESS_COOKIE = "mlf_access";
export const REFRESH_COOKIE = "mlf_refresh";

export type PublicUser = {
  id: string;
  mobile: string;
  role: UserRole;
  name?: string;
};

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    mobile: user.mobile,
    role: user.role,
    name: user.name ?? undefined,
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

export async function issueAuthTokens(user: User): Promise<{
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}> {
  const accessToken = await signAccessToken({
    userId: user.id,
    mobile: user.mobile,
    role: user.role,
  });

  const refreshToken = createRefreshTokenValue();
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
    user: toPublicUser(updated),
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

export async function rotateRefreshToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
} | null> {
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
  });

  if (!existing || existing.expiresAt.getTime() <= Date.now()) {
    if (existing) {
      await prisma.refreshToken.delete({ where: { id: existing.id } });
    }
    return null;
  }

  const user = await prisma.user.findUnique({ where: { id: existing.userId } });
  await prisma.refreshToken.delete({ where: { id: existing.id } });

  if (!user || !user.isActive) return null;
  return issueAuthTokens(user);
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

export function jsonError(
  error: string,
  code: string,
  status: number,
  extra?: Record<string, unknown>
): NextResponse {
  return NextResponse.json({ error, code, ...extra }, { status });
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
