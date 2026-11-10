import Link from "next/link";
import { requireCustomer } from "@/auth/session";
import { db } from "@/db";
import { listCases } from "@/domain/cases";
import { listForCustomer } from "@/domain/notifications";
import { getCaseView } from "@/domain/case-view";
import {
  Card,
  CardHeader,
  EmptyState,
  LinkButton,
  PageHeader,
  Progress,
  StateBadge,
  When,
} from "@/components/ui";
import { ArrowRight } from "lucide-react";

export default async function PortalHome() {
  const c = await requireCustomer();
  const { rows } = await listCases(db, c.ctx, { limit: 50, sort: "updated" });
  const open = rows.filter((r) => !["VERIFIED_RESOLVED", "CANCELLED", "FAILED"].includes(r.state));
  const notes = await listForCustomer(db, c.org.id, c.customer.id, 5);
  const progress = await Promise.all(
    open.slice(0, 3).map(async (r) => ({ r, v: await getCaseView(db, c.ctx, r.reference) })),
  );
  return (
    <>
      <PageHeader
        title={`Hello, ${c.customer.name.split(" ")[0]}`}
        description="Here's where everything stands. You'll never need to start over."
        actions={<LinkButton href="/portal/cases/new">Start a case</LinkButton>}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section aria-labelledby="open-h" className="space-y-3">
          <h2 id="open-h" className="t-h2">
            In progress
          </h2>
          {progress.length === 0 ? (
            <Card>
              <EmptyState
                title="Nothing open right now"
                action={
                  <LinkButton href="/portal/cases/new" variant="secondary">
                    Report a problem
                  </LinkButton>
                }
              >
                If something went wrong with your subscription, billing, service visit or device, tell us once
                and we&apos;ll take it from there.
              </EmptyState>
            </Card>
          ) : (
            progress.map(({ r, v }) => (
              <Card key={r.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link
                      href={`/portal/cases/${r.reference}`}
                      className="t-h3 underline-offset-2 hover:underline"
                    >
                      {r.title}
                    </Link>
                    <p className="t-caption mt-0.5">
                      <span className="t-code">{r.reference}</span> · updated <When at={r.updatedAt} />
                    </p>
                  </div>
                  <StateBadge state={r.state} />
                </div>
                <div className="mt-4">
                  <Progress
                    value={v.progress.verified}
                    max={Math.max(v.progress.required, 1)}
                    label={`${r.reference} verified objectives`}
                  />
                  <p className="t-caption mt-1.5">
                    {v.progress.verified} of {v.progress.required} outcomes verified
                  </p>
                </div>
                <Link
                  href={`/portal/cases/${r.reference}`}
                  className="mt-3 inline-flex min-h-9 items-center gap-1 text-sm font-medium underline"
                >
                  Open case <ArrowRight size={14} aria-hidden />
                </Link>
              </Card>
            ))
          )}
          {rows.length > open.length ? (
            <p className="t-caption">
              <Link className="underline" href="/portal/cases">
                {rows.length - open.length} closed case(s)
              </Link>{" "}
              · closed cases can be reopened.
            </p>
          ) : null}
        </section>
        <Card aria-labelledby="n-h">
          <CardHeader
            id="n-h"
            title="Latest updates"
            action={
              <Link href="/portal/notifications" className="text-sm underline">
                All
              </Link>
            }
          />
          {notes.length === 0 ? (
            <EmptyState title="No updates yet" />
          ) : (
            <ul className="divide-y divide-border">
              {notes.map((n) => (
                <li key={n.id} className="px-5 py-3">
                  <p className="text-sm font-medium">{n.title}</p>
                  {n.body ? <p className="t-caption">{n.body}</p> : null}
                  <p className="t-caption">
                    <When at={n.createdAt} />
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
