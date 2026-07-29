import { NextResponse } from "next/server";
import {
  applyCorsHeaders,
  corsPreflight,
  getCurrentUser,
  toPublicUser,
} from "@/lib/auth/session";
import { jsonFail, jsonOk } from "@/lib/api/response";

export async function OPTIONS(request: Request) {
  return corsPreflight(request) ?? new NextResponse(null, { status: 204 });
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return applyCorsHeaders(
        request,
        jsonFail("UNAUTHORIZED", "Unauthorized", 401)
      );
    }

    return applyCorsHeaders(
      request,
      jsonOk({ user: await toPublicUser(user) })
    );
  } catch (error) {
    console.error("me error", error);
    return applyCorsHeaders(
      request,
      jsonFail("SERVER_ERROR", "Something went wrong", 500)
    );
  }
}
