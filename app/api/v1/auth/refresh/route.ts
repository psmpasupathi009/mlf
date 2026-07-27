import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  applyCorsHeaders,
  attachAuthCookies,
  clearAuthCookies,
  corsPreflight,
  REFRESH_COOKIE,
  rotateRefreshToken,
} from "@/lib/auth/session";
import { jsonFail, jsonOk } from "@/lib/api/response";
import { refreshSchema } from "@/lib/validations/auth.schema";
import { rateLimit } from "@/lib/rate-limit";
import { clientRateKey } from "@/lib/rate-limit/client-key";
import { isDbUnreachableError } from "@/lib/db/prisma";

export async function OPTIONS(request: Request) {
  return corsPreflight(request) ?? new NextResponse(null, { status: 204 });
}

export async function POST(request: Request) {
  try {
    const limited = await rateLimit(
      clientRateKey(request, "refresh"),
      60,
      15 * 60 * 1000
    );
    if (!limited.allowed) {
      return applyCorsHeaders(
        request,
        jsonFail(
          "RATE_LIMITED",
          `Too many refresh attempts. Try again in ${limited.retryAfterSec}s`,
          429,
          { retryAfterSec: limited.retryAfterSec }
        )
      );
    }

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
        jsonFail("VALIDATION", "Invalid request", 400)
      );
    }

    const headerRefresh = request.headers.get("x-refresh-token");
    const refreshToken =
      parsed.data.refreshToken || cookieRefresh || headerRefresh || undefined;

    if (!refreshToken) {
      return applyCorsHeaders(
        request,
        jsonFail("UNAUTHORIZED", "Refresh token required", 401)
      );
    }

    const result = await rotateRefreshToken(refreshToken);

    if (!result.ok) {
      if (result.reason === "raced") {
        // Another tab already rotated — browser likely has the new cookies.
        // Do NOT clear; client should hard-reload.
        return applyCorsHeaders(
          request,
          jsonFail(
            "STALE_REFRESH",
            "Session was renewed elsewhere. Reloading…",
            409
          )
        );
      }

      const response = jsonFail(
        "UNAUTHORIZED",
        "Session expired. Please sign in again.",
        401
      );
      return applyCorsHeaders(request, clearAuthCookies(response));
    }

    const response = jsonOk({
      user: result.user,
    });

    return applyCorsHeaders(
      request,
      attachAuthCookies(response, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      })
    );
  } catch (error) {
    console.error("refresh error", error);
    return applyCorsHeaders(
      request,
      jsonFail(
        "SERVER_ERROR",
        isDbUnreachableError(error)
          ? "Database unreachable. Check MongoDB Atlas Network Access (allow 0.0.0.0/0 for Vercel)."
          : "Failed to refresh session",
        500
      )
    );
  }
}
