/** Cookie names — edge-safe (no Prisma / Node crypto). */
export const ACCESS_COOKIE = "mlf_access";
export const REFRESH_COOKIE = "mlf_refresh";

/** Opaque refresh tokens are base64url(~64 chars); reject junk early in proxy. */
export const REFRESH_COOKIE_MIN_LENGTH = 32;
