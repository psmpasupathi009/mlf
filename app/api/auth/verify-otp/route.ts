import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { signOtpProofToken } from "@/lib/auth/jwt";
import {
  isEnvAdminMobile,
  normalizeMobile,
} from "@/lib/auth/mobile";
import {
  applyCorsHeaders,
  corsPreflight,
} from "@/lib/auth/session";
import { ensureEnvAdminUser, findUserByLoginMobile } from "@/lib/auth/bootstrap-admin";
import { jsonFail, jsonOk } from "@/lib/api/response";
import { rateLimit } from "@/lib/rate-limit";
import { clientRateKey } from "@/lib/rate-limit/client-key";
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
        jsonFail("VALIDATION", "Invalid OTP request", 400)
      );
    }

    const mobile = normalizeMobile(parsed.data.mobile);
    if (!mobile) {
      return applyCorsHeaders(
        request,
        jsonFail(
          "VALIDATION",
          "Enter a valid 10-digit Indian mobile number",
          400
        )
      );
    }

    const limited = await rateLimit(clientRateKey(request, "verify-otp", mobile), 10, 15 * 60 * 1000);
    if (!limited.allowed) {
      return applyCorsHeaders(
        request,
        jsonFail(
          "RATE_LIMITED",
          `Too many OTP checks. Try again in ${limited.retryAfterSec}s`,
          429,
          { retryAfterSec: limited.retryAfterSec }
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
        jsonFail(
          "VALIDATION",
          "OTP expired or not found. Request a new one.",
          400
        )
      );
    }

    const ok = await verifyOtpSms(session.sessionId, otp);
    if (!ok) {
      return applyCorsHeaders(
        request,
        jsonFail("VALIDATION", "Incorrect OTP", 400)
      );
    }

    await prisma.otpSession.update({
      where: { id: session.id },
      data: { verified: true },
    });

    if (purpose === "setup") {
      let user = await findUserByLoginMobile(mobile);
      if (!user && isEnvAdminMobile(mobile)) {
        user = await ensureEnvAdminUser(mobile);
      }

      if (!user || !user.isActive) {
        return applyCorsHeaders(
          request,
          jsonFail(
            "NOT_FOUND",
            "Number not registered. Contact admin.",
            404
          )
        );
      }
    } else {
      const user = await findUserByLoginMobile(mobile);
      if (!user || !user.isActive || !user.pinHash) {
        return applyCorsHeaders(
          request,
          jsonFail(
            "FORBIDDEN",
            "Unable to reset PIN for this number",
            400
          )
        );
      }
    }

    const otpProofToken = await signOtpProofToken({ mobile, purpose });

    return applyCorsHeaders(
      request,
      jsonOk({
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
      jsonFail(
        "SERVER_ERROR",
        process.env.NODE_ENV === "development"
          ? `Failed to verify OTP: ${message}`
          : "Failed to verify OTP",
        502
      )
    );
  }
}
