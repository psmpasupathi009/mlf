import { randomUUID } from "crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { UserRole } from "@prisma/client";

/** Session length without refresh tokens (was access 15m + refresh 7d). */
const ACCESS_TTL = "7d";
const OTP_PROOF_TTL = "10m";

export type AccessTokenPayload = JWTPayload & {
  sub: string;
  mobile: string;
  roles: UserRole[];
  /** Client.unitId when this session is a client portal user. */
  cid?: string;
  typ: "access";
};

export type OtpProofPayload = JWTPayload & {
  jti: string;
  mobile: string;
  purpose: "setup" | "forgot_pin";
  typ: "otp_proof";
};

function getSecret(): Uint8Array {
  const value = process.env.JWT_SECRET;
  if (!value) {
    throw new Error("Missing JWT_SECRET environment variable");
  }
  return new TextEncoder().encode(value);
}

export async function signAccessToken(input: {
  /** Public employee unitId (EMP-#####) — never Mongo ObjectId. */
  unitId: string;
  mobile: string;
  roles: UserRole[];
  /** Linked Client.unitId for client portal sessions. */
  clientUnitId?: string | null;
}): Promise<string> {
  return new SignJWT({
    mobile: input.mobile,
    roles: input.roles,
    ...(input.clientUnitId ? { cid: input.clientUnitId } : {}),
    typ: "access",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.unitId)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .sign(getSecret());
}

export async function verifyAccessToken(
  token: string
): Promise<AccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
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
    .sign(getSecret());
}

export async function verifyOtpProofToken(
  token: string
): Promise<OtpProofPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
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
