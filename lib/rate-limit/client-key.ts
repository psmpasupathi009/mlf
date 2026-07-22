/** Best-effort client key for rate limits (IP or forwarded). */
export function clientRateKey(request: Request, prefix: string, mobile?: string): string {
  const fwd = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = request.headers.get("x-real-ip")?.trim();
  const ip = fwd || real || "unknown";
  return mobile ? `${prefix}:${mobile}:${ip}` : `${prefix}:${ip}`;
}
