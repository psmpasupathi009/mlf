import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  isEnvAdminMobile,
  normalizeMobile,
} from "@/lib/auth/mobile";
import {
  applyCorsHeaders,
  corsPreflight,
} from "@/lib/auth/session";
import { jsonFail, jsonOk } from "@/lib/api/response";
import { rateLimit } from "@/lib/rate-limit";
import { clientRateKey } from "@/lib/rate-limit/client-key";
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
        jsonFail(
          "VALIDATION",
          "Enter a valid 10-digit Indian mobile number",
          400
        )
      );
    }

    const mobile = normalizeMobile(parsed.data.mobile);
    if (!mobile) {
      return applyCorsHeaders(
        request,
        jsonFail(
          "VALIDATION",
          "Enter a valid 10-digit Indian mobile number (starts with 6–9)",
          400
        )
      );
    }

    const limited = await rateLimit(clientRateKey(request, "check-mobile", mobile), 20, 15 * 60 * 1000);
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

    const user = await prisma.user.findUnique({
      where: { mobile },
      select: { isActive: true, pinHash: true },
    });

    if (user) {
      if (!user.isActive) {
        return applyCorsHeaders(
          request,
          jsonOk({
            status: "not_found" as const,
            message:
              "This number is not registered. Contact your admin for access.",
          })
        );
      }

      return applyCorsHeaders(
        request,
        jsonOk({
          status: (user.pinHash ? "pin" : "otp_required") as
            | "pin"
            | "otp_required",
        })
      );
    }

    if (isEnvAdminMobile(mobile)) {
      return applyCorsHeaders(
        request,
        jsonOk({ status: "otp_required" as const })
      );
    }

    return applyCorsHeaders(
      request,
      jsonOk({
        status: "not_found" as const,
        message:
          "This number is not registered. Contact your admin for access.",
      })
    );
  } catch (error) {
    console.error("check-mobile error", error);
    const message = String(
      error instanceof Error ? error.message : error
    ).toLowerCase();
    const dbDown =
      message.includes("server selection") ||
      message.includes("connect") ||
      message.includes("timed out") ||
      message.includes("replica");
    return applyCorsHeaders(
      request,
      jsonFail(
        "SERVER_ERROR",
        dbDown
          ? "Database unreachable. Check MongoDB Atlas Network Access (IP allowlist)."
          : "Could not verify this number. Please try again.",
        500
      )
    );
  }
}
