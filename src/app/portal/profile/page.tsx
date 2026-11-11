import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { requireCustomer } from "@/auth/session";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { PrefsForm } from "@/components/prefs-form";
import { ErasureForm } from "@/components/privacy-forms";
import { myDataRequests } from "@/domain/privacy";
import { Badge, When } from "@/components/ui";
import { Card, CardHeader, PageHeader } from "@/components/ui";
export const metadata: Metadata = { title: "Profile & privacy" };
export default async function Profile() {
  const c = await requireCustomer();
  const requests = await myDataRequests(db, c.ctx);
  const [row] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, c.customer.id), eq(customers.organizationId, c.org.id)));
  return (
    <>
      <PageHeader title="Profile & privacy" />
      <div className="grid max-w-3xl gap-6">
        <Card>
          <CardHeader title="Your details" />
          <dl className="divide-y divide-border text-sm">
            <div className="grid grid-cols-1 gap-1 px-5 py-3 sm:grid-cols-[10rem_1fr]">
              <dt className="text-muted">Name</dt>
              <dd>{row.name}</dd>
            </div>
            <div className="grid grid-cols-1 gap-1 px-5 py-3 sm:grid-cols-[10rem_1fr]">
              <dt className="text-muted">Email</dt>
              <dd>{row.email}</dd>
            </div>
            <div className="grid grid-cols-1 gap-1 px-5 py-3 sm:grid-cols-[10rem_1fr]">
              <dt className="text-muted">Customer reference</dt>
              <dd className="t-code">{row.externalRef}</dd>
            </div>
          </dl>
        </Card>
        <Card>
          <CardHeader title="Notifications" />
          <div className="p-5">
            <PrefsForm notifyEmail={row.preferences.notifyEmail} notifyInApp={row.preferences.notifyInApp} />
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Your data rights"
            description="You can download everything we hold about you, or ask for it to be erased."
          />
          <div className="space-y-5 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <a
                className="inline-flex min-h-11 items-center rounded-md border border-border-strong bg-surface px-4 text-sm font-medium hover:bg-surface-2"
                href="/api/portal/export"
                download
              >
                Download my data (JSON)
              </a>
              <span className="t-caption">
                Includes your cases, history, outcomes and file names. Not available through a read-only link.
              </span>
            </div>
            {requests.length ? (
              <ul className="space-y-2 text-sm">
                {requests.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2">
                    <Badge
                      tone={
                        r.status === "COMPLETED" ? "success" : r.status === "REJECTED" ? "neutral" : "warning"
                      }
                    >
                      Erasure {r.status.toLowerCase()}
                    </Badge>
                    <When at={r.createdAt} />
                    {r.note ? <span className="t-caption">— {r.note}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {requests.some((r) => r.status === "PENDING") ? (
              <p className="t-caption">Your erasure request is waiting for review.</p>
            ) : (
              <ErasureForm />
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="How your data is used" />
          <div className="space-y-2 p-5 text-sm text-muted">
            <p>
              Your case history, uploads and receipts are visible only to you and authorised staff of the
              organization that holds your case. Uploaded files are kept for the organization&apos;s retention
              period (365 days by default after closure).
            </p>
            <p>
              Every change is recorded in an audit trail. Consent you give is stored with the exact wording
              you saw. This is a demonstration environment: all data is fictional.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
