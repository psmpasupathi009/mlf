import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  getAdminRoleForMobile,
  isEnvAdminMobile,
  normalizeMobile,
} from "@/lib/auth/mobile";
import {
  applyCorsHeaders,
  corsPreflight,
  jsonError,
} from "@/lib/auth/session";
import { checkMobileSchema } from "@/lib/validations/auth.schema";

export async function OPTIONS(request: Request) {
  return corsPreflight(request) ?? new NextResponse(null, { status: 204 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = checkMobileSchema.safeParse(body);
    if (!parsed.success) {
      return applyCorsHeaders(
        request,
        jsonError("Invalid mobile number", "INVALID_MOBILE", 400)
      );
    }

    const mobile = normalizeMobile(parsed.data.mobile);
    if (!mobile) {
      return applyCorsHeaders(
        request,
        jsonError(
          "Enter a valid 10-digit Indian mobile number",
          "INVALID_MOBILE",
          400
        )
      );
    }

    const user = await prisma.user.findUnique({
      where: { mobile },
      select: { isActive: true, pinHash: true },
    });

    if (user) {
      if (!user.isActive) {
        return applyCorsHeaders(
          request,
          NextResponse.json({
            status: "not_found",
            message: "Number not registered. Contact admin.",
          })
        );
      }

      return applyCorsHeaders(
        request,
        NextResponse.json({
          status: user.pinHash ? "pin" : "otp_required",
        })
      );
    }

    if (isEnvAdminMobile(mobile) && getAdminRoleForMobile(mobile)) {
      return applyCorsHeaders(
        request,
        NextResponse.json({ status: "otp_required" })
      );
    }

    return applyCorsHeaders(
      request,
      NextResponse.json({
        status: "not_found",
        message: "Number not registered. Contact admin.",
      })
    );
  } catch (error) {
    console.error("check-mobile error", error);
    return applyCorsHeaders(
      request,
      jsonError("Something went wrong", "SERVER_ERROR", 500)
    );
  }
}
