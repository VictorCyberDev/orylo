import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { requireCustomer } from "@/auth/session";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { PrefsForm } from "@/components/prefs-form";
import { Card, CardHeader, PageHeader } from "@/components/ui";
export const metadata: Metadata = { title: "Profile & privacy" };
export default async function Profile() {
  const c = await requireCustomer();
  const [row] = await db.select().from(customers).where(and(eq(customers.id, c.customer.id), eq(customers.organizationId, c.org.id)));
  return (
    <>
      <PageHeader title="Profile & privacy" />
      <div className="grid max-w-3xl gap-6">
        <Card><CardHeader title="Your details" /><dl className="divide-y divide-border text-sm"><div className="grid gap-1 px-5 py-3 sm:grid-cols-[10rem_1fr]"><dt className="text-muted">Name</dt><dd>{row.name}</dd></div><div className="grid gap-1 px-5 py-3 sm:grid-cols-[10rem_1fr]"><dt className="text-muted">Email</dt><dd>{row.email}</dd></div><div className="grid gap-1 px-5 py-3 sm:grid-cols-[10rem_1fr]"><dt className="text-muted">Customer reference</dt><dd className="t-code">{row.externalRef}</dd></div></dl></Card>
        <Card><CardHeader title="Notifications" /><div className="p-5"><PrefsForm notifyEmail={row.preferences.notifyEmail} notifyInApp={row.preferences.notifyInApp} /></div></Card>
        <Card><CardHeader title="How your data is used" /><div className="space-y-2 p-5 text-sm text-muted"><p>Your case history, uploads and receipts are visible only to you and authorised staff of the organization that holds your case. Uploaded files are kept for the organization&apos;s retention period (365 days by default after closure).</p><p>Every change is recorded in an audit trail. Consent you give is stored with the exact wording you saw. This is a demonstration environment: all data is fictional.</p></div></Card>
      </div>
    </>
  );
}
