import { NextResponse, type NextRequest } from "next/server";
import { cspAllowsEgain, egainCspAdditions, getEgainConfig } from "@/config/egain";

/**
 * Per-request nonce CSP. Scripts run only if they carry this request's nonce (plus whatever those scripts load, via
 * 'strict-dynamic'); there is NO 'unsafe-inline' for scripts. Styles keep 'unsafe-inline' because React/Radix set inline
 * `style` attributes and a style-only injection cannot execute script (documented residual risk).
 * Pages must render dynamically for the nonce to reach Next's own bootstrap scripts (root layout is force-dynamic).
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV === "development";
  const https = (process.env.APP_URL ?? "").startsWith("https://");
  // eGain chat widget: extra origins (and two exact loader hashes) only on pages that may host or reach it — never /app.
  const eg = cspAllowsEgain(request.nextUrl.pathname) ? egainCspAdditions(getEgainConfig()) : null;
  const add = (base: string, extra: string[] | undefined) => [base, ...(extra ?? [])].join(" ");
  const csp = [
    "default-src 'self'",
    add(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`, eg?.script),
    add("style-src 'self' 'unsafe-inline'", eg?.style),
    add("img-src 'self' data: blob:", eg?.img),
    add("font-src 'self' data:", eg?.font),
    ...(eg ? [add("media-src 'self'", eg.media)] : []),
    add("connect-src 'self'", eg?.connect),
    ...(eg ? [add("frame-src 'self'", eg.frame)] : []),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
