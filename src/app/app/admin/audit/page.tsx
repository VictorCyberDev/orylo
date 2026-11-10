import type { Metadata } from "next";
import { requireStaff } from "@/auth/session";
import { db } from "@/db";
import { queryAudit } from "@/domain/admin";
import { buttonClass, Badge, Card, DataTable, PageHeader, Td, Th, When, inputClass } from "@/components/ui";
export const metadata: Metadata = { title: "Audit log" };
export default async function Audit({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; outcome?: string }>;
}) {
  const s = await requireStaff("audit.read");
  const sp = await searchParams;
  const rows = await queryAudit(db, s.ctx, {
    action: sp.action || undefined,
    outcome: sp.outcome || undefined,
    limit: 200,
  });
  return (
    <>
      <PageHeader title="Audit log" description="Append-only. Secrets are redacted before storage." />
      <Card className="mb-4 p-4">
        <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Filter audit log">
          <div>
            <label htmlFor="action" className="t-label mb-1.5 block">
              Action
            </label>
            <input
              id="action"
              name="action"
              defaultValue={sp.action}
              placeholder="e.g. action.execute"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="outcome" className="t-label mb-1.5 block">
              Outcome
            </label>
            <select id="outcome" name="outcome" defaultValue={sp.outcome ?? ""} className={inputClass}>
              <option value="">Any</option>
              <option>success</option>
              <option>denied</option>
              <option>error</option>
            </select>
          </div>
          <button className={buttonClass("primary")} type="submit">
            Filter
          </button>
        </form>
      </Card>
      <Card>
        <DataTable caption="Audit events">
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Actor</Th>
              <Th>Action</Th>
              <Th>Target</Th>
              <Th>Outcome</Th>
              <Th>Detail</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td>
                  <When at={r.createdAt} />
                </Td>
                <Td className="t-code text-xs">
                  {r.actorType}:{(r.actorId ?? "").slice(0, 14)}
                </Td>
                <Td className="t-code text-xs">{r.action}</Td>
                <Td className="t-code text-xs">
                  {r.targetType}:{(r.targetId ?? "").slice(0, 8)}
                </Td>
                <Td>
                  <Badge
                    tone={r.outcome === "success" ? "success" : r.outcome === "denied" ? "warning" : "danger"}
                  >
                    {r.outcome}
                  </Badge>
                </Td>
                <Td className="t-code max-w-xs truncate text-xs" title={JSON.stringify(r.metadata)}>
                  {JSON.stringify(r.metadata)}
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>
    </>
  );
}
