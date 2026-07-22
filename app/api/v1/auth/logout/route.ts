import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  applyCorsHeaders,
  clearAuthCookies,
  corsPreflight,
  getCurrentUser,
  jsonError,
  REFRESH_COOKIE,
  revokeRefreshToken,
} from "@/lib/auth/session";

export async function OPTIONS(request: Request) {
  return corsPreflight(request) ?? new NextResponse(null, { status: 204 });
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const cookieRefresh = cookieStore.get(REFRESH_COOKIE)?.value;

    let bodyRefresh: string | undefined;
    try {
      const body = await request.json();
      if (typeof body?.refreshToken === "string") {
        bodyRefresh = body.refreshToken;
      }
    } catch {
      // no body is fine
    }

    const refreshToken = bodyRefresh || cookieRefresh;
    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    } else {
      const user = await getCurrentUser(request);
      if (user) {
        await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
      }
    }

    const response = NextResponse.json({ message: "Logged out" });
    return applyCorsHeaders(request, clearAuthCookies(response));
  } catch (error) {
    console.error("logout error", error);
    return applyCorsHeaders(
      request,
      jsonError("Logout failed", "SERVER_ERROR", 500)
    );
  }
}
