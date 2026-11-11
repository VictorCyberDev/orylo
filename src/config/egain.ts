import { createHash } from "node:crypto";

/**
 * The single place that knows about the eGain chat widget. Nothing else in the app embeds eGain script tags.
 *
 * Values come from the owner's eGain account (public widget configuration, not credentials). The Agent ID is NOT an
 * API credential. Defaults are the owner's agent; override per environment with EGAIN_AGENT_ID / EGAIN_SERVER_URL.
 * Set EGAIN_WIDGET=off to remove the widget everywhere without a deploy-time code change.
 */
const DEFAULT_AGENT_ID = "015f4f90-8772-4065-9e64-894b3615c5d3";
const DEFAULT_SERVER_URL = "https://ai.egain.cloud/r9iv";

/** Origins the widget talks to, observed in a real browser on 2026-11-11 (docs/evidence/egain-widget-csp.md). */
const API_ORIGIN = "https://api.ai.egain.cloud";
const CDN_ORIGIN = "https://cdn.aiagent.egain.cloud";
const FONT_CSS = "https://fonts.googleapis.com";
const FONT_FILES = "https://fonts.gstatic.com";

export interface EgainConfig {
  enabled: boolean;
  agentId: string;
  serverUrl: string;
  origin: string;
  scriptUrl: string;
}

/** Only eGain-operated https hosts may ever be loaded as script (a typo or hostile env value must not load arbitrary code). */
export function isTrustedEgainServerUrl(u: string): boolean {
  try {
    const x = new URL(u);
    return (
      x.protocol === "https:" && (x.hostname === "ai.egain.cloud" || x.hostname.endsWith(".egain.cloud"))
    );
  } catch {
    return false;
  }
}

export function getEgainConfig(env: NodeJS.ProcessEnv = process.env): EgainConfig {
  const serverUrl = (env.EGAIN_SERVER_URL ?? DEFAULT_SERVER_URL).replace(/\/+$/, "");
  const agentId = env.EGAIN_AGENT_ID ?? DEFAULT_AGENT_ID;
  const valid = isTrustedEgainServerUrl(serverUrl) && /^[0-9a-f-]{36}$/i.test(agentId);
  const origin = valid ? new URL(serverUrl).origin : "";
  return {
    enabled: valid && env.EGAIN_WIDGET !== "off",
    agentId,
    serverUrl,
    origin,
    scriptUrl: valid ? `${serverUrl}/system/templates/chat/egain-chat.js` : "",
  };
}

/** Routes whose pages may host the widget. Operator/admin (/app) and APIs never do. */
export function widgetRoute(pathname: string): boolean {
  return (
    pathname === "/demo" ||
    pathname.startsWith("/demo/") ||
    pathname === "/portal" ||
    pathname.startsWith("/portal/")
  );
}

/**
 * Pages that are loaded as a full document and can later be client-navigated to a widget route must already allow the
 * widget's origins in their CSP (CSP belongs to the document, not the route). Everything except operator/admin and API
 * qualifies. The script itself is only ever *loaded* on widgetRoute() pages.
 */
export function cspAllowsEgain(pathname: string): boolean {
  return !(pathname === "/app" || pathname.startsWith("/app/") || pathname.startsWith("/api/"));
}

/**
 * The official loader (egain-chat.js, v21.24.0) creates a `javascript:false` iframe and writes
 * `<body onload="document._l();">` into it. Both inherit this page's CSP, so a strict script-src blocks the widget.
 * Instead of 'unsafe-inline' we allow EXACTLY those two snippets by hash ('unsafe-hashes' only widens event
 * handlers / javascript: URLs, and only for these hashes). If eGain changes the loader, the widget shows its
 * "unavailable" state and `tests/e2e/egain-widget.spec.ts` fails loudly — it does not silently weaken the CSP.
 */
const sha = (s: string) => `'sha256-${createHash("sha256").update(s).digest("base64")}'`;
export const EGAIN_LOADER_HASHES = [sha("document._l();"), sha("javascript:false")] as const;

export interface CspAdditions {
  script: string[];
  style: string[];
  font: string[];
  img: string[];
  media: string[];
  connect: string[];
  frame: string[];
}

export function egainCspAdditions(cfg: EgainConfig): CspAdditions | null {
  if (!cfg.enabled) return null;
  return {
    script: ["'unsafe-hashes'", ...EGAIN_LOADER_HASHES],
    style: [cfg.origin, CDN_ORIGIN, FONT_CSS],
    font: [CDN_ORIGIN, FONT_FILES],
    img: [cfg.origin, CDN_ORIGIN],
    media: [CDN_ORIGIN],
    // The widget also posts telemetry to a *-dev.egain.cloud host; deliberately NOT allowed (see evidence doc).
    connect: [cfg.origin, API_ORIGIN, CDN_ORIGIN],
    frame: [cfg.origin],
  };
}
