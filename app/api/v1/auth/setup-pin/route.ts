import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { verifyOtpProofToken } from "@/lib/auth/jwt";
import { hashPin, isWeakPin } from "@/lib/auth/pin";
import {
  applyCorsHeaders,
  attachAuthCookies,
  corsPreflight,
  issueAuthTokens,
  jsonError,
} from "@/lib/auth/session";
import { setupPinSchema } from "@/lib/validations/auth.schema";

export async function OPTIONS(request: Request) {
  return corsPreflight(request) ?? new NextResponse(null, { status: 204 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = setupPinSchema.safeParse(body);
    if (!parsed.success) {
      return applyCorsHeaders(
        request,
        jsonError(
          parsed.error.issues[0]?.message ?? "Invalid request",
          "INVALID_INPUT",
          400
        )
      );
    }

    const proof = await verifyOtpProofToken(parsed.data.otpProofToken);
    if (!proof || proof.purpose !== "setup") {
      return applyCorsHeaders(
        request,
        jsonError(
          "OTP verification expired. Please verify again.",
          "PROOF_EXPIRED",
          401
        )
      );
    }

    if (isWeakPin(parsed.data.pin)) {
      return applyCorsHeaders(
        request,
        jsonError(
          "Choose a stronger 6-digit PIN. Avoid sequences like 123456 or repeated digits.",
          "WEAK_PIN",
          400
        )
      );
    }

    const user = await prisma.user.findUnique({
      where: { mobile: proof.mobile },
    });
    if (!user || !user.isActive) {
      return applyCorsHeaders(
        request,
        jsonError("Number not registered. Contact admin.", "NOT_FOUND", 404)
      );
    }

    if (user.pinHash) {
      return applyCorsHeaders(
        request,
        jsonError("PIN already set. Use login or forgot PIN.", "PIN_EXISTS", 400)
      );
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { pinHash: await hashPin(parsed.data.pin) },
    });

    const tokens = await issueAuthTokens(updated);
    const response = NextResponse.json({
      message: "PIN set successfully",
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: tokens.user,
    });

    return applyCorsHeaders(request, attachAuthCookies(response, tokens));
  } catch (error) {
    console.error("setup-pin error", error);
    return applyCorsHeaders(
      request,
      jsonError("Failed to set PIN", "SERVER_ERROR", 500)
    );
  }
}
