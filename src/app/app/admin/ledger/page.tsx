import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, and } from "drizzle-orm";
import { requireStaff } from "@/auth/session";
import { db } from "@/db";
import { outcomeLedger, resolutionCases } from "@/db/schema";
import { verifyChain } from "@/domain/ledger";
import { Alert, Badge, Card, CardHeader, DataTable, EmptyState, PageHeader, Td, Th, When } from "@/components/ui";
export const metadata: Metadata = { title: "Outcome ledger" };
export default async function LedgerPage() {
  const s = await requireStaff("audit.read");
  const chain = await verifyChain(db, s.org.id);
  const rows = await db.select({ l: outcomeLedger, ref: resolutionCases.reference }).from(outcomeLedger).innerJoin(resolutionCases, and(eq(resolutionCases.id, outcomeLedger.caseId), eq(resolutionCases.organizationId, outcomeLedger.organizationId))).where(eq(outcomeLedger.organizationId, s.org.id)).orderBy(desc(outcomeLedger.seq)).limit(100);
  return (
    <>
      <PageHeader title="Outcome ledger" description="Append-only, hash-chained evidence of consequential operations. Recomputed live on every page load." />
      <div className="mb-4">{chain.ok ? <Alert tone="success" title="Chain verified">{chain.checked} entries recomputed; every hash links to the previous one.</Alert> : <Alert tone="danger" title="Chain broken">Tampering detected at entry #{chain.brokenAtSeq}.</Alert>}</div>
      <Card><CardHeader title="Entries (latest 100)" />{rows.length === 0 ? <EmptyState title="No entries yet" /> : (
        <DataTable caption="Outcome ledger"><thead><tr><Th>#</Th><Th>Case</Th><Th>Outcome</Th><Th>Executed</Th><Th>Verification</Th><Th>Final</Th><Th>When</Th></tr></thead>
          <tbody>{rows.map(({ l, ref }) => <tr key={l.id}><Td className="t-num">{l.seq}</Td><Td><Link className="t-code underline" href={`/app/cases/${ref}`}>{ref}</Link></Td><Td>{l.requestedOutcome}<div className="t-caption t-code">{l.actionAttempted}</div></Td><Td>{l.executionResult}</Td><Td className="text-xs">{l.verificationMethod ?? "—"}</Td><Td><Badge tone={l.finalOutcome === "VERIFIED" ? "success" : l.finalOutcome === "FAILED" ? "danger" : "warning"}>{l.finalOutcome}</Badge></Td><Td><When at={l.createdAt} /></Td></tr>)}</tbody></DataTable>)}</Card>
    </>
  );
}
