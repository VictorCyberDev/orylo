import Link from "next/link";
import type { ReactNode } from "react";
import { brand } from "@/config/brand";
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-8 flex items-center gap-2 font-semibold" aria-label={`${brand.name} home`}>
        <svg width="28" height="28" viewBox="0 0 64 64" aria-hidden>
          <rect width="64" height="64" rx="16" fill="var(--primary)" />
          <circle cx="32" cy="32" r="14" fill="none" stroke="var(--accent)" strokeWidth="6" />
          <path
            d="M25 33l5 5 10-12"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="text-lg">{brand.wordmark}</span>
      </Link>
      <div className="rounded-lg border border-border bg-surface p-6 shadow-md sm:p-8">
        <h1 className="t-h2">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
      {footer ? <div className="mt-5 text-center text-sm text-muted">{footer}</div> : null}
    </main>
  );
}
