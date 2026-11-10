import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { requireStaff } from "@/auth/session";
import { db } from "@/db";
import { escalations, queues, resolutionCases, users } from "@/db/schema";
import { Badge, Card, DataTable, EmptyState, PageHeader, Td, Th, When } from "@/components/ui";
export const metadata: Metadata = { title: "Escalations" };
export default async function EscalationsPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const s = await requireStaff("case.read");
  const sp = await searchParams;
  const rows = await db
    .select({
      e: escalations,
      ref: resolutionCases.reference,
      title: resolutionCases.title,
      q: queues.name,
      owner: users.name,
    })
    .from(escalations)
    .innerJoin(
      resolutionCases,
      and(
        eq(resolutionCases.id, escalations.caseId),
        eq(resolutionCases.organizationId, escalations.organizationId),
      ),
    )
    .leftJoin(queues, eq(queues.id, escalations.queueId))
    .leftJoin(users, eq(users.id, escalations.ownerUserId))
    .where(
      and(
        eq(escalations.organizationId, s.org.id),
        sp.all ? undefined : inArray(escalations.status, ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS"]),
      ),
    )
    .orderBy(desc(escalations.createdAt));
  return (
    <>
      <PageHeader
        title="Escalations"
        description="Every row is a real record with a queue, an owner and a frozen snapshot of what was known."
        actions={
          <Link className="text-sm underline" href={sp.all ? "/app/escalations" : "/app/escalations?all=1"}>
            {sp.all ? "Show open only" : "Show all"}
          </Link>
        }
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No open escalations" />
        ) : (
          <DataTable caption="Escalations">
            <thead>
              <tr>
                <Th>Case</Th>
                <Th>Reason</Th>
                <Th>Channel</Th>
                <Th>Queue</Th>
                <Th>Owner</Th>
                <Th>Status</Th>
                <Th>Opened</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ e, ref, title, q, owner }) => (
                <tr key={e.id}>
                  <Td>
                    <Link className="t-code underline" href={`/app/cases/${ref}`}>
                      {ref}
                    </Link>
                    <div className="t-caption max-w-xs truncate">{title}</div>
                  </Td>
                  <Td className="max-w-sm">
                    <span className="t-code">{e.reasonCode}</span>
                    <div className="text-muted">{e.reason}</div>
                  </Td>
                  <Td>{e.channel.replace("_", " ")}</Td>
                  <Td>{q ?? "—"}</Td>
                  <Td>{owner ?? <span className="text-muted">Unowned</span>}</Td>
                  <Td>
                    <Badge
                      tone={["RESOLVED", "RETURNED_TO_AUTOMATION"].includes(e.status) ? "success" : "warning"}
                    >
                      {e.status.replace("_", " ")}
                    </Badge>
                  </Td>
                  <Td>
                    <When at={e.createdAt} />
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
