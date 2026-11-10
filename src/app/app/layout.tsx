import Link from "next/link";
import type { Metadata } from "next";
import { requireStaff } from "@/auth/session";
import { db } from "@/db";
import { unreadCountForUser } from "@/domain/notifications";
import { CommandPalette, MobileNav, ThemeToggle } from "@/components/client";
import { Badge, SyntheticBadge } from "@/components/ui";
import { commandsFor, navFor } from "@/components/app-nav";
import { signOutAction } from "../actions";
import { Bell } from "lucide-react";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: { default: "Command center", template: `%s · ${brand.name} Console` },
  robots: { index: false },
};

type NavItems = ReturnType<typeof navFor>;
function ConsoleNav({ nav }: { nav: NavItems }) {
  return (
    <nav aria-label="Console" className="space-y-5">
      {(["Work", "Admin"] as const).map((g) => {
        const items = nav.filter((n) => n.group === g);
        if (!items.length) return null;
        return (
          <div key={g}>
            <p className="t-label mb-2 px-3">{g}</p>
            <ul className="space-y-0.5">
              {items.map((n) => (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    className="flex min-h-10 items-center rounded-md px-3 text-sm text-muted hover:bg-surface-2 hover:text-fg"
                  >
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireStaff();
  const unread = await unreadCountForUser(db, s.org.id, s.user.id);
  const nav = navFor(s.role);
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="hidden border-r border-border bg-surface lg:block">
        <div className="sticky top-0 flex h-screen flex-col gap-6 overflow-y-auto p-4">
          <Link href="/app" className="flex items-center gap-2 px-3 pt-1 font-semibold">
            <svg width="24" height="24" viewBox="0 0 64 64" aria-hidden>
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
            {brand.wordmark}
          </Link>
          <ConsoleNav nav={nav} />
          <div className="mt-auto space-y-1 px-3 t-caption">
            <p className="font-medium text-fg">{s.org.name}</p>
            <p>
              {s.user.name} · {s.role.replace("_", " ")}
            </p>
          </div>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="relative sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-border bg-bg/90 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2">
            <MobileNav label="console menu">
              <div className="max-h-[70vh] space-y-4 overflow-y-auto">
                <ConsoleNav nav={nav} />
                <form action={signOutAction} className="sm:hidden">
                  <button
                    type="submit"
                    className="flex min-h-11 items-center rounded-md px-3 text-sm text-muted hover:text-fg"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            </MobileNav>
            {s.org.synthetic ? <SyntheticBadge /> : null}
          </div>
          <div className="flex items-center gap-1">
            <CommandPalette commands={commandsFor(s.role)} />
            <Link
              href="/app/notifications"
              className="relative inline-flex h-9 min-w-11 items-center justify-center rounded-md hover:bg-surface-2"
              aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
            >
              <Bell size={18} aria-hidden />
              {unread ? (
                <Badge tone="accent" className="absolute -right-1 -top-1 px-1.5">
                  {unread}
                </Badge>
              ) : null}
            </Link>
            <ThemeToggle />
            <form action={signOutAction} className="hidden sm:block">
              <button type="submit" className="min-h-11 rounded-md px-3 text-sm text-muted hover:text-fg">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-[88rem] px-4 py-6 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
