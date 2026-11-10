/**
 * Best-effort client IP for rate limiting. `x-forwarded-for` is client-controlled at its LEFT end; a trusted
 * proxy appends the real peer at the RIGHT end, so we use `x-real-ip` if the platform sets it, else the last entry.
 * Only meaningful behind a proxy you control (documented in the runbook).
 */
export function clientIp(h: Headers): string {
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",").at(-1)!.trim() || "unknown";
  return "unknown";
}
