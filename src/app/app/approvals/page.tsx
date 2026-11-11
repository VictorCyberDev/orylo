import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { requireStaff } from "@/auth/session";
import { db } from "@/db";
import { actionRequests, customers, resolutionCases } from "@/db/schema";
import { can } from "@/domain/rbac";
import { ActionForm } from "@/components/client";
import { Card, DataTable, EmptyState, Money, PageHeader, Td, Th, When, inputClass } from "@/components/ui";
import { approvalAction } from "../../actions";
export const metadata: Metadata = { title: "Approvals" };
export default async function Approvals() {
  const s = await requireStaff("case.read");
  const rows = await db
    .select({ a: actionRequests, c: resolutionCases, cust: customers.name })
    .from(actionRequests)
    .innerJoin(
      resolutionCases,
      and(
        eq(resolutionCases.id, actionRequests.caseId),
        eq(resolutionCases.organizationId, actionRequests.organizationId),
      ),
    )
    .innerJoin(
      customers,
      and(
        eq(customers.id, resolutionCases.customerId),
        eq(customers.organizationId, resolutionCases.organizationId),
      ),
    )
    .where(and(eq(actionRequests.organizationId, s.org.id), eq(actionRequests.status, "AWAITING_APPROVAL")));
  const canDecide = can(s.role, "approval.decide");
  return (
    <>
      <PageHeader
        title="Pending approvals"
        description="The customer has already confirmed these. Nothing runs until a team member decides. You can't approve a request you made yourself."
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="Nothing waiting">No approvals are pending.</EmptyState>
        ) : (
          <>
            <ul className="divide-y divide-border md:hidden" aria-label="Pending approvals">
              {rows.map(({ a, c, cust }) => (
                <li key={a.id} className="space-y-3 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link className="t-code underline" href={`/app/cases/${c.reference}`}>
                      {c.reference}
                    </Link>
                    <span className="t-num font-medium">
                      <Money cents={a.amountCents} />
                    </span>
                  </div>
                  <p className="text-sm">
                    {cust} · <span className="t-code">{a.operation}</span>
                  </p>
                  <p className="t-caption">
                    Waiting since <When at={a.updatedAt} />
                  </p>
                  <Decision a={a} caseRef={c.reference} canDecide={canDecide} idPrefix="m" />
                </li>
              ))}
            </ul>
            <DataTable caption="Pending approvals" className="hidden md:block">
              <thead>
                <tr>
                  <Th>Case</Th>
                  <Th>Customer</Th>
                  <Th>Step</Th>
                  <Th>Amount</Th>
                  <Th>Waiting since</Th>
                  <Th>Decision</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ a, c, cust }) => (
                  <tr key={a.id}>
                    <Td>
                      <Link className="t-code underline" href={`/app/cases/${c.reference}`}>
                        {c.reference}
                      </Link>
                    </Td>
                    <Td>{cust}</Td>
                    <Td>{a.operation}</Td>
                    <Td>
                      <Money cents={a.amountCents} />
                    </Td>
                    <Td>
                      <When at={a.updatedAt} />
                    </Td>
                    <Td>
                      <Decision a={a} caseRef={c.reference} canDecide={canDecide} idPrefix="t" />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </>
        )}
      </Card>
    </>
  );
}

function Decision({
  a,
  caseRef,
  canDecide,
  idPrefix,
}: {
  a: { id: string };
  caseRef: string;
  canDecide: boolean;
  idPrefix: string;
}) {
  if (!canDecide) return <span className="t-caption">Your role can&apos;t decide approvals</span>;
  return (
    <ActionForm action={approvalAction} className="space-y-2">
      <input type="hidden" name="requestId" value={a.id} />
      <input type="hidden" name="caseRef" value={caseRef} />
      <label htmlFor={`${idPrefix}-r-${a.id}`} className="sr-only">
        Reason
      </label>
      <input
        id={`${idPrefix}-r-${a.id}`}
        name="reason"
        placeholder="Reason (optional)"
        className={`${inputClass} min-h-9`}
      />
      <div className="flex gap-2">
        <button
          name="decision"
          value="approve"
          className="min-h-11 rounded-md bg-primary px-4 text-sm text-primary-fg"
        >
          Approve
        </button>
        <button
          name="decision"
          value="decline"
          className="min-h-11 rounded-md border border-border-strong px-4 text-sm"
        >
          Decline
        </button>
      </div>
    </ActionForm>
  );
}
