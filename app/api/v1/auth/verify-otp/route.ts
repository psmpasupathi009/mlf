import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { signOtpProofToken } from "@/lib/auth/jwt";
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
import {
  createUserWithUniqueMobile,
  findUserByMobile,
  MobileConflictError,
} from "@/lib/auth/users.service";
import { verifyOtpSms } from "@/lib/services/two-factor.service";
import { verifyOtpSchema } from "@/lib/validations/auth.schema";

export async function OPTIONS(request: Request) {
  return corsPreflight(request) ?? new NextResponse(null, { status: 204 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = verifyOtpSchema.safeParse(body);
    if (!parsed.success) {
      return applyCorsHeaders(
        request,
        jsonError("Invalid OTP request", "INVALID_INPUT", 400)
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

    const { otp, purpose } = parsed.data;

    const session = await prisma.otpSession.findFirst({
      where: {
        mobile,
        purpose,
        verified: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!session) {
      return applyCorsHeaders(
        request,
        jsonError(
          "OTP expired or not found. Request a new one.",
          "OTP_EXPIRED",
          400
        )
      );
    }

    const ok = await verifyOtpSms(session.sessionId, otp);
    if (!ok) {
      return applyCorsHeaders(
        request,
        jsonError("Incorrect OTP", "OTP_INVALID", 400)
      );
    }

    await prisma.otpSession.update({
      where: { id: session.id },
      data: { verified: true },
    });

    if (purpose === "setup") {
      let user = await findUserByMobile(mobile);
      if (!user && isEnvAdminMobile(mobile)) {
        const role = getAdminRoleForMobile(mobile);
        if (!role) {
          return applyCorsHeaders(
            request,
            jsonError("Unauthorized mobile", "UNAUTHORIZED", 403)
          );
        }
        try {
          user = await createUserWithUniqueMobile({ mobile, role });
        } catch (error) {
          if (error instanceof MobileConflictError) {
            return applyCorsHeaders(
              request,
              jsonError(
                "This mobile number is already registered",
                "MOBILE_EXISTS",
                409
              )
            );
          }
          throw error;
        }
      }

      if (!user || !user.isActive) {
        return applyCorsHeaders(
          request,
          jsonError("Number not registered. Contact admin.", "NOT_FOUND", 404)
        );
      }
    } else {
      const user = await findUserByMobile(mobile);
      if (!user || !user.isActive || !user.pinHash) {
        return applyCorsHeaders(
          request,
          jsonError(
            "Unable to reset PIN for this number",
            "RESET_NOT_ALLOWED",
            400
          )
        );
      }
    }

    const otpProofToken = await signOtpProofToken({ mobile, purpose });

    return applyCorsHeaders(
      request,
      NextResponse.json({
        verified: true,
        otpProofToken,
        requiresPinSetup: purpose === "setup",
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("verify-otp error", message);
    return applyCorsHeaders(
      request,
      jsonError(
        process.env.NODE_ENV === "development"
          ? `Failed to verify OTP: ${message}`
          : "Failed to verify OTP",
        "OTP_VERIFY_FAILED",
        502
      )
    );
  }
}
