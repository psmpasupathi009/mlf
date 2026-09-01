/**
 * Env super-admin bootstrap PIN policy.
 * - Development: auto-set SEED_PIN when pinHash is empty (fast local login).
 * - Production: leave pinHash empty so first login goes through OTP setup (strong PIN).
 */
export function shouldAutoSetBootstrapPin(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function bootstrapPinFromEnv(): string {
  return process.env.SEED_PIN ?? "123456";
}
