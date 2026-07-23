import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  REFRESH_COOKIE_MIN_LENGTH,
} from "@/lib/auth/cookie-names";

async function hasValidAccess(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!token || !process.env.JWT_SECRET) return false;

  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(process.env.JWT_SECRET)
    );
    return payload.typ === "access" && Boolean(payload.sub);
  } catch {
    return false;
  }
}

function hasRefreshCookie(request: NextRequest): boolean {
  const value = request.cookies.get(REFRESH_COOKIE)?.value;
  return Boolean(value && value.length >= REFRESH_COOKIE_MIN_LENGTH);
}

function isPublicPath(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/legal");
}

/**
 * Login-first gate:
 * - Guests → /login (except public routes)
 * - Expired access + refresh cookie → allow into portal (SessionRefreshGate)
 * - Signed-in users on /login → /
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLogin = pathname === "/login";
  const authenticated = await hasValidAccess(request);
  const hasRefresh = hasRefreshCookie(request);
  const maybeAuthed = authenticated || hasRefresh;

  if (!maybeAuthed && !isPublicPath(pathname)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (authenticated && isLogin) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|images|api).*)"],
};
