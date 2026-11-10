"use client";
import * as Dialog from "@radix-ui/react-dialog";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Check, Copy, Menu, Moon, Search, Sun, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useActionState, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/cn";
import { Alert, Button, buttonClass, type ButtonVariant } from "./ui";

/* ---------- Theme ---------- */
export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => {
    const t = document.documentElement.dataset.theme as "light" | "dark" | undefined;
    setTheme(t ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  }, []);
  const flip = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("orylo-theme", next); } catch { /* storage may be blocked */ }
  };
  return (
    <button type="button" onClick={flip} className={buttonClass("ghost", "sm", "w-11")} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
      {theme === "dark" ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
    </button>
  );
}

/* ---------- Toasts ---------- */
type Toast = { id: number; message: string; tone: "success" | "danger" | "info" };
const ToastCtx = createContext<(m: string, tone?: Toast["tone"]) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, message, tone }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 6000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6">
        {items.map((t) => (
          <div key={t.id} role={t.tone === "danger" ? "alert" : "status"} className={cn("fade-up pointer-events-auto flex max-w-md items-start gap-3 rounded-md border bg-surface px-4 py-3 text-sm shadow-lg", t.tone === "danger" ? "border-danger/50" : t.tone === "success" ? "border-success/50" : "border-border-strong")}>
            <span className="flex-1">{t.message}</span>
            <button type="button" aria-label="Dismiss notification" className="-m-2 p-2 text-muted hover:text-fg" onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))}><X size={16} aria-hidden /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Forms bound to server actions ---------- */
export type ActionResult = { ok: boolean; message?: string; error?: string; fieldErrors?: Record<string, string>; redirectTo?: string };
export const initialResult: ActionResult = { ok: false };

export function SubmitButton({ children, variant = "primary", pendingLabel = "Working…", className, disabled }: { children: ReactNode; variant?: ButtonVariant; pendingLabel?: string; className?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} aria-disabled={pending || disabled} className={buttonClass(variant, "md", className)}>
      {pending ? pendingLabel : children}
    </button>
  );
}

export function ActionForm({ action, children, className, successToast = true }: { action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>; children: ReactNode | ((r: ActionResult) => ReactNode); className?: string; successToast?: boolean }) {
  const [state, formAction] = useActionState(action, initialResult);
  const toast = useToast();
  const router = useRouter();
  const seen = useRef<ActionResult | null>(null);
  useEffect(() => {
    if (state === seen.current || state === initialResult) return;
    seen.current = state;
    if (state.ok && state.message && successToast) toast(state.message, "success");
    if (state.redirectTo) router.push(state.redirectTo);
  }, [state, toast, router, successToast]);
  return (
    <form action={formAction} className={className} noValidate>
      {typeof children === "function" ? children(state) : children}
      {state.error ? <div className="mt-3"><Alert tone="danger" title="That didn't work">{state.error}</Alert></div> : null}
    </form>
  );
}

/* ---------- Dialog (focus trap, ESC, return focus via Radix) ---------- */
export function Modal({ trigger, title, description, children }: { trigger: ReactNode; title: string; description?: string; children: ReactNode }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[min(92vw,34rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-surface p-6 shadow-lg">
          <Dialog.Title className="t-h2">{title}</Dialog.Title>
          <Dialog.Description className={description ? "mt-1 text-sm text-muted" : "sr-only"}>{description ?? title}</Dialog.Description>
          <div className="mt-4">{children}</div>
          <Dialog.Close asChild><button type="button" aria-label="Close dialog" className="absolute right-3 top-3 rounded-md p-2.5 text-muted hover:bg-surface-2"><X size={18} aria-hidden /></button></Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ---------- Tabs ---------- */
export const Tabs = TabsPrimitive.Root;
export const TabsList = ({ className, ...p }: TabsPrimitive.TabsListProps) => <TabsPrimitive.List {...p} className={cn("flex gap-1 overflow-x-auto border-b border-border", className)} />;
export const TabsTrigger = ({ className, ...p }: TabsPrimitive.TabsTriggerProps) => (
  <TabsPrimitive.Trigger {...p} className={cn("min-h-11 whitespace-nowrap border-b-2 border-transparent px-4 text-sm font-medium text-muted hover:text-fg data-[state=active]:border-accent-text data-[state=active]:text-fg", className)} />
);
export const TabsContent = ({ className, ...p }: TabsPrimitive.TabsContentProps) => <TabsPrimitive.Content {...p} className={cn("pt-5", className)} />;

/* ---------- Tooltip ---------- */
export function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={250}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content sideOffset={6} className="z-50 max-w-xs rounded-md bg-primary px-2.5 py-1.5 text-xs text-primary-fg shadow-md">{label}</TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button variant="secondary" size="sm" onClick={async () => { try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1800); } catch { /* clipboard blocked */ } }}>
      {done ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />} {done ? "Copied" : label}
    </Button>
  );
}

/* ---------- Command palette (Ctrl/⌘+K) ---------- */
export interface Command { id: string; label: string; href: string; group: string; keywords?: string }
export function CommandPalette({ commands }: { commands: Command[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const router = useRouter();
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    };
    addEventListener("keydown", h);
    return () => removeEventListener("keydown", h);
  }, []);
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    return commands.filter((c) => !t || `${c.label} ${c.group} ${c.keywords ?? ""}`.toLowerCase().includes(t)).slice(0, 12);
  }, [q, commands]);
  const go = (c: Command) => { setOpen(false); setQ(""); router.push(c.href); };
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setQ(""); setActive(0); } }}>
      <Dialog.Trigger asChild>
        <button type="button" className={buttonClass("secondary", "sm", "gap-2 text-muted")} aria-label="Open command palette (Control or Command K)">
          <Search size={16} aria-hidden /> <span className="hidden sm:inline">Search &amp; jump</span> <kbd className="t-code hidden rounded border border-border px-1.5 sm:inline">⌘K</kbd>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-[12vh] z-50 w-[min(94vw,36rem)] -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-surface shadow-lg" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <div className="border-b border-border p-3">
            <input
              autoFocus role="combobox" aria-expanded aria-controls="cmd-list" aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined} aria-label="Search pages and actions"
              value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} placeholder="Type to search pages, e.g. approvals, analytics…"
              className="w-full bg-transparent px-1 py-2 text-base outline-none"
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                if (e.key === "Enter" && results[active]) go(results[active]);
              }}
            />
          </div>
          <ul id="cmd-list" role="listbox" aria-label="Results" className="max-h-80 overflow-y-auto p-2">
            {results.length === 0 ? <li className="px-3 py-6 text-center text-sm text-muted">No matches.</li> : null}
            {results.map((c, i) => (
              <li key={c.id} id={`cmd-${c.id}`} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onClick={() => go(c)} className={cn("flex min-h-11 cursor-pointer items-center justify-between rounded-md px-3 text-sm", i === active ? "bg-active" : "")}>
                <span>{c.label}</span><span className="t-caption">{c.group}</span>
              </li>
            ))}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ---------- Mobile disclosure nav ---------- */
export function MobileNav({ children, label = "Menu" }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      <button type="button" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((o) => !o)} className={buttonClass("ghost", "sm", "w-11")} aria-label={open ? `Close ${label}` : `Open ${label}`}>
        {open ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
      </button>
      {open ? <div id="mobile-nav" className="absolute inset-x-0 top-full z-30 border-b border-border bg-bg p-4 shadow-md" onClick={() => setOpen(false)}>{children}</div> : null}
    </div>
  );
}

export function AutoRefresh({ everyMs = 15000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, everyMs);
    return () => clearInterval(t);
  }, [router, everyMs]);
  return null;
}
