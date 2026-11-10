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
          <DataTable caption="Pending approvals">
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
                    {canDecide ? (
                      <ActionForm action={approvalAction} className="space-y-2">
                        <input type="hidden" name="requestId" value={a.id} />
                        <input type="hidden" name="caseRef" value={c.reference} />
                        <label htmlFor={`r-${a.id}`} className="sr-only">
                          Reason
                        </label>
                        <input
                          id={`r-${a.id}`}
                          name="reason"
                          placeholder="Reason (optional)"
                          className={`${inputClass} min-h-9`}
                        />
                        <div className="flex gap-2">
                          <button
                            name="decision"
                            value="approve"
                            className="min-h-9 rounded-md bg-primary px-3 text-sm text-primary-fg"
                          >
                            Approve
                          </button>
                          <button
                            name="decision"
                            value="decline"
                            className="min-h-9 rounded-md border border-border-strong px-3 text-sm"
                          >
                            Decline
                          </button>
                        </div>
                      </ActionForm>
                    ) : (
                      <span className="t-caption">Your role can&apos;t decide approvals</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>
    </>
  );
}
