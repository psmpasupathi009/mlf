import { createHash, randomBytes, randomUUID } from "crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { UserRole } from "@prisma/client";

const ACCESS_TTL = "15m";
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OTP_PROOF_TTL = "10m";

export type AccessTokenPayload = JWTPayload & {
  sub: string;
  mobile: string;
  roles: UserRole[];
  typ: "access";
};

export type OtpProofPayload = JWTPayload & {
  jti: string;
  mobile: string;
  purpose: "setup" | "forgot_pin";
  typ: "otp_proof";
};

function getSecret(name: "JWT_SECRET" | "JWT_REFRESH_SECRET"): Uint8Array {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable`);
  }
  return new TextEncoder().encode(value);
}

export async function signAccessToken(input: {
  userId: string;
  mobile: string;
  roles: UserRole[];
}): Promise<string> {
  return new SignJWT({
    mobile: input.mobile,
    roles: input.roles,
    typ: "access",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.userId)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .sign(getSecret("JWT_SECRET"));
}

export async function verifyAccessToken(
  token: string
): Promise<AccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret("JWT_SECRET"));
    if (payload.typ !== "access" || !payload.sub) return null;
    return payload as AccessTokenPayload;
  } catch {
    return null;
  }
}

export async function signOtpProofToken(input: {
  mobile: string;
  purpose: "setup" | "forgot_pin";
}): Promise<string> {
  const jti = randomUUID();
  return new SignJWT({
    mobile: input.mobile,
    purpose: input.purpose,
    typ: "otp_proof",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(OTP_PROOF_TTL)
    .sign(getSecret("JWT_SECRET"));
}

export async function verifyOtpProofToken(
  token: string
): Promise<OtpProofPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret("JWT_SECRET"));
    if (
      payload.typ !== "otp_proof" ||
      typeof payload.mobile !== "string" ||
      typeof payload.jti !== "string"
    ) {
      return null;
    }
    return payload as OtpProofPayload;
  } catch {
    return null;
  }
}

export function createRefreshTokenValue(): string {
  return randomBytes(48).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function refreshTokenExpiresAt(): Date {
  return new Date(Date.now() + REFRESH_TTL_MS);
}
