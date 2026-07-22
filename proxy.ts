import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const ACCESS_COOKIE = "mlf_access";

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

/**
 * Login-first gate:
 * - Guests → /login
 * - Signed-in users on /login → /
 * Portal home (/) requires a valid session cookie.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLogin = pathname === "/login";
  const authenticated = await hasValidAccess(request);

  if (!authenticated && !isLogin) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (authenticated && isLogin) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images|api).*)"],
};
