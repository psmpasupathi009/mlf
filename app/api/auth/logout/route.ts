import { NextResponse } from "next/server";
import {
  applyCorsHeaders,
  clearAuthCookies,
  corsPreflight,
} from "@/lib/auth/session";
import { jsonFail, jsonOk } from "@/lib/api/response";

export async function OPTIONS(request: Request) {
  return corsPreflight(request) ?? new NextResponse(null, { status: 204 });
}

export async function POST(request: Request) {
  try {
    const response = jsonOk({ message: "Logged out" });
    return applyCorsHeaders(request, clearAuthCookies(response));
  } catch (error) {
    console.error("logout error", error);
    return applyCorsHeaders(
      request,
      jsonFail("SERVER_ERROR", "Logout failed", 500)
    );
  }
}
