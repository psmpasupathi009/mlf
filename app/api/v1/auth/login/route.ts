import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { normalizeMobile } from "@/lib/auth/mobile";
import {
  isPinLocked,
  pinLockRetryAfterSec,
  PIN_LOCK_MINUTES,
  PIN_MAX_ATTEMPTS,
  verifyPin,
} from "@/lib/auth/pin";
import {
  applyCorsHeaders,
  attachAuthCookies,
  corsPreflight,
  issueAuthTokens,
  revokeAllRefreshTokens,
} from "@/lib/auth/session";
import { jsonFail, jsonOk } from "@/lib/api/response";
import { rateLimit } from "@/lib/rate-limit";
import { clientRateKey } from "@/lib/rate-limit/client-key";
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
        jsonFail("VALIDATION", "Invalid login details", 400)
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

    const limited = await rateLimit(clientRateKey(request, "login", mobile), 10, 15 * 60 * 1000);
    if (!limited.allowed) {
      return applyCorsHeaders(
        request,
        jsonFail(
          "RATE_LIMITED",
          `Too many login attempts. Try again in ${limited.retryAfterSec}s`,
          429,
          { retryAfterSec: limited.retryAfterSec }
        )
      );
    }

    const user = await prisma.user.findUnique({ where: { mobile } });

    if (!user || !user.isActive || !user.pinHash) {
      return applyCorsHeaders(
        request,
        jsonFail("INVALID_CREDENTIALS", "Invalid mobile or PIN", 401)
      );
    }

    if (isPinLocked(user.pinLockedUntil)) {
      const retryAfterSec = pinLockRetryAfterSec(user.pinLockedUntil);
      return applyCorsHeaders(
        request,
        jsonFail(
          "PIN_LOCKED",
          `PIN locked after too many attempts. Use Forgot PIN, or try again in ${retryAfterSec}s.`,
          423,
          { retryAfterSec }
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

        return applyCorsHeaders(
          request,
          jsonFail(
            "PIN_LOCKED",
            `Too many incorrect PIN attempts. Use Forgot PIN, or try again in ${PIN_LOCK_MINUTES * 60}s.`,
            423,
            { retryAfterSec: PIN_LOCK_MINUTES * 60 }
          )
        );
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { failedPinAttempts: attempts },
      });

      const remaining = PIN_MAX_ATTEMPTS - attempts;
      return applyCorsHeaders(
        request,
        jsonFail(
          "INVALID_CREDENTIALS",
          remaining > 0
            ? `Invalid mobile or PIN. ${remaining} attempt${remaining === 1 ? "" : "s"} left.`
            : "Invalid mobile or PIN",
          401,
          { attemptsRemaining: remaining }
        )
      );
    }

    // New login invalidates other device sessions.
    await revokeAllRefreshTokens(user.id);
    const tokens = await issueAuthTokens(user);
    const response = jsonOk({
      message: "Login successful",
      user: tokens.user,
    });

    return applyCorsHeaders(request, attachAuthCookies(response, tokens));
  } catch (error) {
    console.error("login error", error);
    return applyCorsHeaders(
      request,
      jsonFail("SERVER_ERROR", "Login failed", 500)
    );
  }
}
