"use client";
/**
 * The eGain AI Agent widget, integrated ONCE for the whole app (mounted in the root layout so it survives client-side
 * navigation). It loads eGain's official hosted script — nothing from eGain is bundled, forked or copied here.
 *
 *  - Loads only on /demo and /portal (never on operator/admin pages) and only after the page is idle.
 *  - Exactly one script tag and one widget, however often React re-renders or the user navigates.
 *  - Leaving a widget route removes the widget; coming back re-creates it.
 *  - Honest states: loading → ready, or unavailable with Retry. Never a fake chat.
 *
 * Config and CSP rules: src/config/egain.ts. Evidence: docs/evidence/egain-widget-csp.md.
 */
import { useCallback, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";

export interface EgainClientConfig {
  enabled: boolean;
  agentId: string;
  serverUrl: string;
  scriptUrl: string;
  standaloneUrl?: string;
  nonce?: string;
}
type Status = "off" | "loading" | "ready" | "unavailable";
interface DockApi {
  launchChat?: () => void;
}
declare global {
  interface Window {
    egainDockAi?: DockApi;
  }
}

const SCRIPT_ID = "_egainallowdockchat";
const READY_TIMEOUT_MS = 20_000;
/** Elements the official loader adds; removed when the widget is torn down. */
const WIDGET_DOM_IDS = [
  "egain-chat-iframe",
  "egain-chat-floating-launch-button-frame",
  "egain-chat-dynamic-greeting-frame",
  "egain-chat-relay-frame",
];

/* ---- tiny external store so launch buttons and the status chip share one truth ---- */
let status: Status = "off";
const listeners = new Set<() => void>();
const setStatus = (s: Status) => {
  if (status === s) return;
  status = s;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useEgainStatus = () =>
  useSyncExternalStore(
    subscribe,
    () => status,
    () => "off" as Status,
  );

let timer: ReturnType<typeof setInterval> | undefined;
let giveUp: ReturnType<typeof setTimeout> | undefined;
const clearTimers = () => {
  if (timer) clearInterval(timer);
  if (giveUp) clearTimeout(giveUp);
  timer = giveUp = undefined;
};

function widgetReady() {
  return (
    typeof window.egainDockAi?.launchChat === "function" &&
    !!document.getElementById("egain-chat-floating-launch-button-frame")
  );
}

export function removeEgainWidget() {
  clearTimers();
  document.getElementById(SCRIPT_ID)?.remove();
  document.getElementById("egain-docked-chat-async")?.remove();
  for (const id of WIDGET_DOM_IDS) document.getElementById(id)?.remove();
  // the loader's own about:blank "Chat" helper iframe
  document.querySelectorAll('iframe[title="Chat"]').forEach((f) => f.remove());
  delete window.egainDockAi;
  setStatus("off");
}

function injectEgainWidget(cfg: EgainClientConfig) {
  // Idempotent: a second call (re-render, StrictMode, remount, navigation) never adds a second script.
  if (document.getElementById(SCRIPT_ID)) {
    if (status === "off") setStatus(widgetReady() ? "ready" : "loading");
    return;
  }
  setStatus("loading");
  const s = document.createElement("script");
  s.id = SCRIPT_ID;
  s.src = cfg.scriptUrl;
  if (cfg.nonce) s.nonce = cfg.nonce;
  s.setAttribute("data-agent-id", cfg.agentId);
  s.setAttribute("data-server-url", cfg.serverUrl);
  s.onerror = () => {
    clearTimers();
    setStatus("unavailable");
  };
  document.body.appendChild(s);
  timer = setInterval(() => {
    if (widgetReady()) {
      clearTimers();
      setStatus("ready");
    }
  }, 400);
  giveUp = setTimeout(() => {
    if (!widgetReady()) {
      clearTimers();
      setStatus("unavailable");
    }
  }, READY_TIMEOUT_MS);
}

const onWidgetRoute = (p: string) =>
  p === "/demo" || p.startsWith("/demo/") || p === "/portal" || p.startsWith("/portal/");

export function EgainChat({ config }: { config: EgainClientConfig }) {
  const pathname = usePathname();
  const wanted = config.enabled && onWidgetRoute(pathname);

  useEffect(() => {
    if (!wanted) {
      if (document.getElementById(SCRIPT_ID)) removeEgainWidget();
      return;
    }
    // "after the page is ready": idle time, never competing with first paint or hydration.
    const run = () => injectEgainWidget(config);
    const hasIdle = typeof window.requestIdleCallback === "function";
    const h = hasIdle ? window.requestIdleCallback(run, { timeout: 2000 }) : window.setTimeout(run, 300);
    return () => {
      if (hasIdle) window.cancelIdleCallback(h);
      else window.clearTimeout(h);
    };
  }, [wanted, config]);

  if (!wanted) return null;
  return <EgainStatusChip config={config} />;
}

function retry(config: EgainClientConfig) {
  removeEgainWidget();
  injectEgainWidget(config);
}

/** Visible only while loading (after a short grace period) or when the widget is unavailable. Ready → renders nothing. */
function EgainStatusChip({ config }: { config: EgainClientConfig }) {
  const st = useEgainStatus();
  if (st === "ready" || st === "off") return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="egain-status"
      data-state={st}
      className="fixed bottom-4 left-4 z-40 max-w-[calc(100vw-7rem)] rounded-lg border border-border bg-surface p-3 text-sm shadow-md sm:max-w-xs"
    >
      {st === "loading" ? (
        <p className="text-muted">Loading the support assistant…</p>
      ) : (
        <div className="space-y-2">
          <p className="font-medium">The assistant couldn&apos;t load.</p>
          <p className="t-caption">
            It is provided by eGain and may be blocked by a network filter or temporarily unavailable. Nothing
            you were doing here is affected.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => retry(config)}
              className="min-h-11 rounded-md border border-border-strong px-3 text-sm font-medium"
            >
              Try again
            </button>
            {config.standaloneUrl ? (
              <a
                href={config.standaloneUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm underline"
              >
                Open the agent on eGain&apos;s page
              </a>
            ) : null}
            <a href="/contact" className="text-sm underline">
              Contact a person
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

/** A button that opens the real eGain chat. Falls back to a plain instruction if eGain's page hook is missing. */
export function EgainLaunchButton({
  config,
  children,
  className,
}: {
  config: EgainClientConfig;
  children?: ReactNode;
  className?: string;
}) {
  const st = useEgainStatus();
  const launch = useCallback(() => {
    // eGain finishes configuring the chat a moment after its launcher appears; a click in that window can be ignored.
    // Call launchChat, verify the chat window actually opened, and retry briefly instead of silently doing nothing.
    const opened = () =>
      (document.getElementById("egain-chat-iframe")?.getBoundingClientRect().width ?? 0) > 200;
    let tries = 0;
    const attempt = () => {
      if (opened() || tries++ >= 4) return;
      if (typeof window.egainDockAi?.launchChat === "function") window.egainDockAi.launchChat();
      window.setTimeout(attempt, 1500);
    };
    attempt();
  }, []);
  if (!config.enabled)
    return <p className="t-caption">The eGain assistant is switched off in this deployment.</p>;
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={st === "unavailable" ? () => retry(config) : launch}
        disabled={st === "loading" || st === "off"}
        data-testid="egain-launch"
        className={
          className ??
          "inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-fg disabled:opacity-60"
        }
      >
        {st === "ready"
          ? (children ?? "Open the eGain assistant")
          : st === "unavailable"
            ? "Assistant unavailable — try again"
            : "Loading the assistant…"}
      </button>
      {st === "ready" ? (
        <p className="t-caption">If nothing opens, use the chat bubble at the bottom right of the page.</p>
      ) : null}
      {config.standaloneUrl ? (
        <p className="t-caption">
          Prefer a full page, or the bubble does not appear?{" "}
          <a
            href={config.standaloneUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            data-testid="egain-standalone"
          >
            Open the same agent on eGain&apos;s own page
          </a>
          .
        </p>
      ) : null}
    </div>
  );
}
