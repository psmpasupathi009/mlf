import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { normalizeMobile } from "@/lib/auth/mobile";
import {
  isPinLocked,
  PIN_LOCK_MINUTES,
  PIN_MAX_ATTEMPTS,
  verifyPin,
} from "@/lib/auth/pin";
import {
  applyCorsHeaders,
  attachAuthCookies,
  corsPreflight,
  issueAuthTokens,
  jsonError,
} from "@/lib/auth/session";
import { loginSchema } from "@/lib/validations/auth.schema";

export async function OPTIONS(request: Request) {
  return corsPreflight(request) ?? new NextResponse(null, { status: 204 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return applyCorsHeaders(
        request,
        jsonError("Invalid login details", "INVALID_INPUT", 400)
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

    const user = await prisma.user.findUnique({ where: { mobile } });

    if (!user || !user.isActive || !user.pinHash) {
      return applyCorsHeaders(
        request,
        jsonError("Invalid mobile or PIN", "INVALID_CREDENTIALS", 401)
      );
    }

    if (isPinLocked(user.pinLockedUntil)) {
      return applyCorsHeaders(
        request,
        jsonError(
          "Too many incorrect PIN attempts. Please try again later.",
          "PIN_LOCKED",
          423
        )
      );
    }

    const ok = await verifyPin(parsed.data.pin, user.pinHash);
    if (!ok) {
      const attempts = user.failedPinAttempts + 1;
      if (attempts >= PIN_MAX_ATTEMPTS) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedPinAttempts: 0,
            pinLockedUntil: new Date(
              Date.now() + PIN_LOCK_MINUTES * 60 * 1000
            ),
          },
        });
      } else {
        await prisma.user.update({
          where: { id: user.id },
          data: { failedPinAttempts: attempts },
        });
      }

      return applyCorsHeaders(
        request,
        jsonError("Invalid mobile or PIN", "INVALID_CREDENTIALS", 401)
      );
    }

    const tokens = await issueAuthTokens(user);
    const response = NextResponse.json({
      message: "Login successful",
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: tokens.user,
    });

    return applyCorsHeaders(request, attachAuthCookies(response, tokens));
  } catch (error) {
    console.error("login error", error);
    return applyCorsHeaders(
      request,
      jsonError("Login failed", "SERVER_ERROR", 500)
    );
  }
}
