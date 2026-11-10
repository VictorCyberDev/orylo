import type { Metadata } from "next";
import Link from "next/link";
import { requireCustomer } from "@/auth/session";
import { db } from "@/db";
import { listCases } from "@/domain/cases";
import { Card, DataTable, EmptyState, LinkButton, PageHeader, StateBadge, Td, Th, When } from "@/components/ui";
export const metadata: Metadata = { title: "Cases" };
export default async function Cases() {
  const c = await requireCustomer();
  const { rows } = await listCases(db, c.ctx, { limit: 100 });
  return (
    <>
      <PageHeader title="Your cases" actions={<LinkButton href="/portal/cases/new">Start a case</LinkButton>} />
      <Card>
        {rows.length === 0 ? <EmptyState title="No cases yet">When you report a problem it will appear here.</EmptyState> : (
          <DataTable caption="Your cases">
            <thead><tr><Th>Reference</Th><Th>What happened</Th><Th>Status</Th><Th>Updated</Th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.id}><Td><Link className="t-code underline" href={`/portal/cases/${r.reference}`}>{r.reference}</Link></Td><Td>{r.title}</Td><Td><StateBadge state={r.state} /></Td><Td><When at={r.updatedAt} /></Td></tr>)}</tbody>
          </DataTable>
        )}
      </Card>
    </>
  );
}
