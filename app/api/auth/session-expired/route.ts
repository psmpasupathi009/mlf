import { NextResponse } from "next/server";
import {
  applyCorsHeaders,
  clearAuthCookies,
  corsPreflight,
} from "@/lib/auth/session";

export async function OPTIONS(request: Request) {
  return corsPreflight(request) ?? new NextResponse(null, { status: 204 });
}

/**
 * Clears auth cookies and sends the browser to /login.
 * Used when portal layout sees a valid access JWT for an inactive/missing user
 * (would otherwise bounce /login ↔ / forever via proxy).
 */
export async function GET(request: Request) {
  const login = new URL("/login", request.url);
  const response = NextResponse.redirect(login);
  return clearAuthCookies(response);
}

export async function POST(request: Request) {
  const response = applyCorsHeaders(
    request,
    NextResponse.json({ ok: true, data: { cleared: true } })
  );
  return clearAuthCookies(response);
}
