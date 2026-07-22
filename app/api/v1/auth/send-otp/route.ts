import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { isEnvAdminMobile, normalizeMobile } from "@/lib/auth/mobile";
import { rateLimit } from "@/lib/auth/rate-limit";
import {
  applyCorsHeaders,
  corsPreflight,
  jsonError,
} from "@/lib/auth/session";
import { sendOtpSms } from "@/lib/services/two-factor.service";
import { sendOtpSchema } from "@/lib/validations/auth.schema";

const OTP_TTL_MS = 10 * 60 * 1000;

export async function OPTIONS(request: Request) {
  return corsPreflight(request) ?? new NextResponse(null, { status: 204 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = sendOtpSchema.safeParse(body);
    if (!parsed.success) {
      return applyCorsHeaders(
        request,
        jsonError("Invalid request", "INVALID_INPUT", 400)
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

    const { purpose } = parsed.data;
    const limited = rateLimit(`otp:${mobile}`, 3, 15 * 60 * 1000);
    if (!limited.allowed) {
      return applyCorsHeaders(
        request,
        jsonError(
          `Too many OTP requests. Try again in ${limited.retryAfterSec}s`,
          "RATE_LIMITED",
          429,
          { retryAfterSec: limited.retryAfterSec }
        )
      );
    }

    const user = await prisma.user.findUnique({ where: { mobile } });

    if (purpose === "setup") {
      const allowed =
        (user && user.isActive && !user.pinHash) ||
        (!user && isEnvAdminMobile(mobile));
      if (!allowed) {
        return applyCorsHeaders(
          request,
          jsonError(
            "OTP setup is not available for this number",
            "OTP_NOT_ALLOWED",
            400
          )
        );
      }
    } else {
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

    const { sessionId } = await sendOtpSms(mobile);

    await prisma.otpSession.deleteMany({ where: { mobile, purpose } });
    await prisma.otpSession.create({
      data: {
        mobile,
        sessionId,
        purpose,
        verified: false,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });

    return applyCorsHeaders(
      request,
      NextResponse.json({
        message: "OTP sent successfully",
        expiresIn: 600,
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("send-otp error", message);
    return applyCorsHeaders(
      request,
      jsonError(
        process.env.NODE_ENV === "development"
          ? `Failed to send OTP: ${message}`
          : "Failed to send OTP. Please try again.",
        "OTP_SEND_FAILED",
        502
      )
    );
  }
}
