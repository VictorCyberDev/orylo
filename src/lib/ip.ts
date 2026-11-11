/**
 * Client IP for rate limiting, with an EXPLICIT trust boundary.
 *
 * Forwarded headers are attacker-controlled unless a proxy you operate overwrites/appends them. Therefore:
 *  - `TRUSTED_PROXY_HOPS` (default 0) = number of proxies in front of the app that append to `X-Forwarded-For`.
 *  - 0  → forwarded headers are IGNORED; every caller shares the bucket "direct" (safe, coarse, and obvious in logs).
 *  - n>0 → the n-th entry from the RIGHT of X-Forwarded-For is the client as seen by your outermost trusted proxy;
 *          anything to its left is attacker-supplied and ignored. (`X-Real-IP` is honoured only when hops > 0.)
 */
export function clientIp(h: Headers, hops = Number(process.env.TRUSTED_PROXY_HOPS ?? 0)): string {
  if (!Number.isInteger(hops) || hops <= 0) return "direct";
  const xff = h
    .get("x-forwarded-for")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (xff && xff.length >= hops) return xff[xff.length - hops];
  return h.get("x-real-ip")?.trim() || "unknown";
}
