import { NextResponse } from "next/server";
import {
  applyCorsHeaders,
  corsPreflight,
  getCurrentUser,
  jsonError,
  toPublicUser,
} from "@/lib/auth/session";

export async function OPTIONS(request: Request) {
  return corsPreflight(request) ?? new NextResponse(null, { status: 204 });
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return applyCorsHeaders(
        request,
        jsonError("Unauthorized", "UNAUTHORIZED", 401)
      );
    }

    return applyCorsHeaders(
      request,
      NextResponse.json({ user: toPublicUser(user) })
    );
  } catch (error) {
    console.error("me error", error);
    return applyCorsHeaders(
      request,
      jsonError("Something went wrong", "SERVER_ERROR", 500)
    );
  }
}
