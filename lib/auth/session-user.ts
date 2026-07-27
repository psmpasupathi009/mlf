import { cache } from "react";
import { cookies } from "next/headers";
import { prisma, withDbRetry } from "@/lib/db/prisma";
import { verifyAccessToken } from "@/lib/auth/jwt";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  toPublicUser,
  type PublicUser,
} from "@/lib/auth/session";
import { REFRESH_COOKIE_MIN_LENGTH } from "@/lib/auth/cookie-names";

/**
 * Resolve the signed-in portal user from the access cookie.
 * Throws on Mongo unreachable (after retries) — callers must NOT treat that
 * as "logged out" or they will clear cookies / loop SessionRefreshGate.
 */
export const getSessionUser = cache(async (): Promise<PublicUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(ACCESS_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifyAccessToken(token);
  if (!payload?.sub) return null;

  return withDbRetry(async () => {
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        unitId: true,
        mobile: true,
        roles: true,
        name: true,
        designation: true,
        email: true,
        address: true,
        photoKey: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) return null;

    // Permissions also hit Mongo — keep inside the retry boundary.
    return toPublicUser(user);
  });
});

/** True when a plausible refresh cookie exists (access may be expired). */
export async function hasRefreshCookie(): Promise<boolean> {
  const cookieStore = await cookies();
  const value = cookieStore.get(REFRESH_COOKIE)?.value;
  return Boolean(value && value.length >= REFRESH_COOKIE_MIN_LENGTH);
}
