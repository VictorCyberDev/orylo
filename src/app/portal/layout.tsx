import Link from "next/link";
import type { Metadata } from "next";
import { requireCustomer } from "@/auth/session";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { ThemeToggle, MobileNav } from "@/components/client";
import { SyntheticBadge } from "@/components/ui";
import { signOutAction } from "../actions";
import { brand } from "@/config/brand";

export const metadata: Metadata = { title: { default: "Your cases", template: `%s · ${brand.name}` }, robots: { index: false } };
const links = [["/portal", "Overview"], ["/portal/cases", "Cases"], ["/portal/notifications", "Notifications"], ["/portal/profile", "Profile & privacy"]];

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const c = await requireCustomer();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(notifications).where(and(eq(notifications.organizationId, c.org.id), eq(notifications.recipientCustomerId, c.customer.id), isNull(notifications.readAt)));
  return (
    <>
      <header className="relative border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/portal" className="flex items-center gap-2 font-semibold"><span className="text-lg">{c.org.name.replace(/ \(synthetic\)/, "")}</span><span className="t-caption hidden sm:inline">· resolution portal</span></Link>
          <nav aria-label="Portal" className="hidden items-center gap-1 md:flex">
            {links.map(([h, l]) => <Link key={h} href={h} className="rounded-md px-3 py-2 text-sm text-muted hover:text-fg">{l}{h.endsWith("notifications") && n ? <span className="ml-1.5 rounded-full bg-accent px-1.5 text-xs text-accent-fg">{n}<span className="sr-only"> unread</span></span> : null}</Link>)}
          </nav>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <form action={signOutAction}><button className="min-h-11 rounded-md px-3 text-sm text-muted hover:text-fg" type="submit">Sign out</button></form>
            <MobileNav label="portal menu"><nav aria-label="Portal mobile" className="flex flex-col">{links.map(([h, l]) => <Link key={h} href={h} className="flex min-h-12 items-center px-2">{l}</Link>)}</nav></MobileNav>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted">Signed in as <strong className="font-medium text-fg">{c.customer.name}</strong></p><SyntheticBadge /></div>
        {children}
      </main>
    </>
  );
}
