import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  applyCorsHeaders,
  attachAuthCookies,
  clearAuthCookies,
  corsPreflight,
  jsonError,
  REFRESH_COOKIE,
  rotateRefreshToken,
} from "@/lib/auth/session";
import { refreshSchema } from "@/lib/validations/auth.schema";

export async function OPTIONS(request: Request) {
  return corsPreflight(request) ?? new NextResponse(null, { status: 204 });
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const cookieRefresh = cookieStore.get(REFRESH_COOKIE)?.value;

    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      // optional body
    }

    const parsed = refreshSchema.safeParse(body);
    if (!parsed.success) {
      return applyCorsHeaders(
        request,
        jsonError("Invalid request", "INVALID_INPUT", 400)
      );
    }

    const headerRefresh = request.headers.get("x-refresh-token");
    const refreshToken =
      parsed.data.refreshToken || cookieRefresh || headerRefresh || undefined;

    if (!refreshToken) {
      return applyCorsHeaders(
        request,
        jsonError("Refresh token required", "REFRESH_REQUIRED", 401)
      );
    }

    const tokens = await rotateRefreshToken(refreshToken);
    if (!tokens) {
      const response = jsonError(
        "Session expired. Please sign in again.",
        "REFRESH_INVALID",
        401
      );
      return applyCorsHeaders(request, clearAuthCookies(response));
    }

    const response = NextResponse.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: tokens.user,
    });

    return applyCorsHeaders(request, attachAuthCookies(response, tokens));
  } catch (error) {
    console.error("refresh error", error);
    return applyCorsHeaders(
      request,
      jsonError("Failed to refresh session", "SERVER_ERROR", 500)
    );
  }
}
