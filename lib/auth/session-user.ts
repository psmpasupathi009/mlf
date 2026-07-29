import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { withDbRetry } from "@/lib/db/unreachable";
import { verifyAccessToken } from "@/lib/auth/jwt";
import {
  ACCESS_COOKIE,
  toPublicUser,
  type PublicUser,
} from "@/lib/auth/session";

/**
 * Resolve the signed-in portal user from the access cookie.
 * Throws on Mongo unreachable (after retries) — callers must NOT treat that
 * as "logged out" or they will clear cookies.
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
