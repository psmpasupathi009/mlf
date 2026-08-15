import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { consumeOtpProof } from "@/lib/auth/otp-proof";
import { hashPin, isWeakPin } from "@/lib/auth/pin";
import {
  applyCorsHeaders,
  attachAuthCookies,
  corsPreflight,
  issueAuthTokens,
} from "@/lib/auth/session";
import { jsonFail, jsonOk } from "@/lib/api/response";
import { setupPinSchema } from "@/lib/validations/auth.schema";
import { rateLimit } from "@/lib/rate-limit";
import { clientRateKey } from "@/lib/rate-limit/client-key";

export async function OPTIONS(request: Request) {
  return corsPreflight(request) ?? new NextResponse(null, { status: 204 });
}

export async function POST(request: Request) {
  try {
    const limited = await rateLimit(
      clientRateKey(request, "setup-pin"),
      10,
      15 * 60 * 1000
    );
    if (!limited.allowed) {
      return applyCorsHeaders(
        request,
        jsonFail(
          "RATE_LIMITED",
          `Too many attempts. Try again in ${limited.retryAfterSec}s`,
          429,
          { retryAfterSec: limited.retryAfterSec }
        )
      );
    }

    const body = await request.json();
    const parsed = setupPinSchema.safeParse(body);
    if (!parsed.success) {
      return applyCorsHeaders(
        request,
        jsonFail(
          "VALIDATION",
          parsed.error.issues[0]?.message ?? "Invalid request",
          400
        )
      );
    }

    // Validate PIN before consuming the one-time OTP proof.
    if (isWeakPin(parsed.data.pin)) {
      return applyCorsHeaders(
        request,
        jsonFail(
          "VALIDATION",
          "Choose a stronger 6-digit PIN. Avoid sequences like 123456 or repeated digits.",
          400
        )
      );
    }

    const proof = await consumeOtpProof(parsed.data.otpProofToken, "setup");
    if (!proof) {
      return applyCorsHeaders(
        request,
        jsonFail(
          "UNAUTHORIZED",
          "OTP verification expired or already used. Please verify again.",
          401
        )
      );
    }

    const user = await prisma.user.findUnique({
      where: { mobile: proof.mobile },
    });
    if (!user || !user.isActive) {
      return applyCorsHeaders(
        request,
        jsonFail("NOT_FOUND", "Number not registered. Contact admin.", 404)
      );
    }

    if (user.pinHash) {
      return applyCorsHeaders(
        request,
        jsonFail(
          "CONFLICT",
          "PIN already set. Use login or forgot PIN.",
          400
        )
      );
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        pinHash: await hashPin(parsed.data.pin),
        sessionVersion: { increment: 1 },
      },
    });

    const tokens = await issueAuthTokens(updated);
    const response = jsonOk({
      message: "PIN set successfully",
      user: tokens.user,
      accessToken: tokens.accessToken,
    });

    return applyCorsHeaders(request, attachAuthCookies(response, tokens));
  } catch (error) {
    console.error("setup-pin error", error);
    return applyCorsHeaders(
      request,
      jsonFail("SERVER_ERROR", "Failed to set PIN", 500)
    );
  }
}
