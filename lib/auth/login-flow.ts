/**
 * Shared login step machine — keep web LoginForm and mobile app in sync.
 * Mobile: mirror these steps and API calls (Bearer token from login/setup-pin/reset).
 */

export type LoginStep =
  | "phone"
  | "pin"
  | "otp_setup"
  | "setup_pin"
  | "otp_forgot"
  | "reset_pin";

export type CheckMobileStatus = "pin" | "otp_required" | "not_found";

export type OtpPurpose = "setup" | "forgot_pin";

/** Auth API paths used by every client (web cookie + mobile Bearer). */
export const AUTH_API = {
  checkMobile: "/api/auth/check-mobile",
  login: "/api/auth/login",
  sendOtp: "/api/auth/send-otp",
  verifyOtp: "/api/auth/verify-otp",
  setupPin: "/api/auth/setup-pin",
  forgotPinReset: "/api/auth/forgot-pin/reset",
  me: "/api/auth/me",
  logout: "/api/auth/logout",
} as const;

/**
 * Next step after check-mobile (matches LoginForm.handleCheckMobile).
 * - pin → enter PIN → login
 * - otp_required → sendOtp(setup) → otp_setup
 * - not_found → show error
 */
export function nextStepAfterCheckMobile(
  status: CheckMobileStatus | undefined
): LoginStep | "error" {
  if (status === "pin") return "pin";
  if (status === "otp_required") return "otp_setup";
  return "error";
}

/** Endpoints that return accessToken for native clients. */
export const AUTH_TOKEN_ENDPOINTS = [
  AUTH_API.login,
  AUTH_API.setupPin,
  AUTH_API.forgotPinReset,
] as const;
