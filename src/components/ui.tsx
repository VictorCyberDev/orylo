import Link from "next/link";
import { cloneElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { CaseState } from "@/db/schema";
import { STATE_LABEL } from "@/domain/case-machine";

/* ---------- Buttons ---------- */
const btn = {
  base: "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors select-none whitespace-nowrap disabled:cursor-not-allowed disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-fg)] disabled:border-transparent aria-disabled:cursor-not-allowed aria-disabled:opacity-60",
  variant: {
    primary: "bg-primary text-primary-fg hover:bg-primary-hover border border-transparent shadow-sm",
    secondary: "bg-surface text-fg border border-border-strong hover:bg-surface-2",
    ghost: "text-fg hover:bg-surface-2 border border-transparent",
    danger: "bg-danger-bg text-danger border border-danger/40 hover:border-danger",
    accent: "bg-accent text-accent-fg border border-transparent hover:brightness-95",
  },
  size: { sm: "h-9 px-3 text-sm min-w-9", md: "h-11 px-4 text-[15px] min-w-11", lg: "h-12 px-6 text-base" },
};
export type ButtonVariant = keyof typeof btn.variant;
export const buttonClass = (
  variant: ButtonVariant = "primary",
  size: keyof typeof btn.size = "md",
  extra?: string,
) => cn(btn.base, btn.variant[variant], btn.size[size], extra);

export function Button({
  variant,
  size,
  className,
  ...p
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: keyof typeof btn.size }) {
  return <button type="button" {...p} className={buttonClass(variant, size, className)} />;
}
export function LinkButton({
  variant,
  size,
  className,
  ...p
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: keyof typeof btn.size }) {
  return <Link {...p} className={buttonClass(variant, size, className)} />;
}

/* ---------- Inputs ---------- */
export const inputClass =
  "block w-full min-h-11 rounded-md border border-border-strong bg-surface px-3 py-2 text-[15px] text-fg placeholder:text-subtle disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-fg)] aria-[invalid=true]:border-danger";
export function Field({
  id,
  label,
  hint,
  error,
  children,
  required,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {required ? (
          <span aria-hidden className="text-danger">
            {" "}
            *
          </span>
        ) : null}
        {required ? <span className="sr-only"> (required)</span> : null}
      </label>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<Record<string, unknown>>, {
            "aria-describedby":
              [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") ||
              undefined,
            ...(error ? { "aria-invalid": true } : {}),
          })
        : children}
      {hint ? (
        <p id={`${id}-hint`} className="t-caption">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* ---------- Status ---------- */
const tone = {
  neutral: "bg-surface-2 text-fg-muted border-border",
  success: "bg-success-bg text-success border-success/30",
  warning: "bg-warning-bg text-warning border-warning/30",
  danger: "bg-danger-bg text-danger border-danger/30",
  info: "bg-info-bg text-info border-info/30",
  accent: "bg-active text-accent-text border-accent-text/30",
};
export type Tone = keyof typeof tone;
export function Badge({
  tone: t = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium leading-5",
        tone[t],
        className,
      )}
    >
      {children}
    </span>
  );
}
const stateTone: Record<CaseState, Tone> = {
  OPEN: "info",
  INVESTIGATING: "info",
  AWAITING_CUSTOMER_INFORMATION: "warning",
  READY_FOR_ACTION: "accent",
  AWAITING_APPROVAL: "warning",
  ACTION_PENDING: "info",
  ACTION_EXECUTED: "info",
  OUTCOME_PENDING_VERIFICATION: "warning",
  VERIFIED_RESOLVED: "success",
  BLOCKED: "danger",
  ESCALATED: "warning",
  FAILED: "danger",
  CANCELLED: "neutral",
  REOPENED: "warning",
};
export const StateBadge = ({ state, label }: { state: CaseState; label?: string }) => (
  <Badge tone={stateTone[state]}>{label ?? STATE_LABEL[state]}</Badge>
);
export const SyntheticBadge = () => (
  <Badge tone="neutral" className="border-dashed">
    Synthetic demo data
  </Badge>
);
export const objectiveTone = (s: string): Tone =>
  s === "VERIFIED"
    ? "success"
    : s === "COMPLETED"
      ? "warning"
      : s === "BLOCKED"
        ? "danger"
        : s === "NOT_APPLICABLE"
          ? "neutral"
          : s === "IN_PROGRESS"
            ? "info"
            : "neutral";
export const objectiveLabel = (s: string) =>
  ({
    VERIFIED: "Verified",
    COMPLETED: "Done — not yet verified",
    PENDING: "Not started",
    IN_PROGRESS: "In progress",
    BLOCKED: "Blocked",
    NOT_APPLICABLE: "Not applicable",
  })[s] ?? s;

/* ---------- Layout bits ---------- */
export function Card({ className, ...p }: ComponentProps<"section">) {
  return (
    <section
      {...p}
      className={cn("min-w-0 rounded-lg border border-border bg-surface shadow-sm", className)}
    />
  );
}
export function CardHeader({
  title,
  action,
  description,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
      <div>
        <h2 id={id} className="t-h3">
          {title}
        </h2>
        {description ? <p className="t-caption mt-0.5">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <p className="t-label mb-2">{eyebrow}</p> : null}
        <h1 className="t-h1">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
export function Alert({
  tone: t = "info",
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div
      role={t === "danger" ? "alert" : "status"}
      className={cn("rounded-md border px-4 py-3 text-sm", tone[t])}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={title ? "mt-1" : ""}>{children}</div> : null}
    </div>
  );
}
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div aria-hidden className="mb-1 h-10 w-10 rounded-full border border-dashed border-border-strong" />
      <p className="t-h3">{title}</p>
      {children ? <p className="max-w-md text-sm text-muted">{children}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
export function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={label}
        className="h-2 overflow-hidden rounded-full bg-surface-3"
      >
        <div
          className="h-full rounded-full bg-success transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
export const Skeleton = ({ className }: { className?: string }) => (
  <div aria-hidden className={cn("skeleton h-4", className)} />
);

export function DataTable({
  caption,
  children,
  className,
}: {
  caption: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("relative overflow-x-auto", className)}
      tabIndex={0}
      role="region"
      aria-label={caption}
    >
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}
export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <th
    scope="col"
    className={cn("t-label whitespace-nowrap border-b border-border bg-surface-2 px-4 py-2.5", className)}
  >
    {children}
  </th>
);
export const Td = ({ children, className }: ComponentProps<"td">) => (
  <td className={cn("border-b border-border px-4 py-3 align-top", className)}>{children}</td>
);

/** Signature interaction. Rendered ONLY when the backend returned verification evidence. */
export function VerifiedSeal({ label = "Verified" }: { label?: string }) {
  return (
    <svg className="seal" viewBox="0 0 44 44" role="img" aria-label={label}>
      <circle cx="22" cy="22" r="20" />
      <circle className="ring" cx="22" cy="22" r="20" transform="rotate(-90 22 22)" />
      <path d="M13 23.5l6.5 6.5L31 16" />
    </svg>
  );
}

export function Money({ cents }: { cents: number | null | undefined }) {
  if (cents == null) return <span>—</span>;
  return (
    <span className="t-num">
      {(cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}
    </span>
  );
}
export function When({ at }: { at: Date | string | null | undefined }) {
  if (!at) return <span>—</span>;
  const d = new Date(at);
  return (
    <time dateTime={d.toISOString()} title={d.toISOString()} className="t-num">
      {d.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
      })}{" "}
      UTC
    </time>
  );
}
