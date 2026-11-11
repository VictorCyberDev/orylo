import type { Metadata } from "next";
import { requireStaff } from "@/auth/session";
import { db } from "@/db";
import { jobStats, recentJobs } from "@/jobs/queue";
import { can } from "@/domain/rbac";
import { ActionForm, SubmitButton } from "@/components/client";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  PageHeader,
  Td,
  Th,
  When,
} from "@/components/ui";
import { retryJobAction } from "../../../actions";
export const metadata: Metadata = { title: "Background jobs" };
export const dynamic = "force-dynamic";

const tone = { PENDING: "info", RUNNING: "warning", SUCCEEDED: "success", DEAD: "danger" } as const;
export default async function Jobs() {
  const s = await requireStaff("audit.read");
  const [stats, rows] = [await jobStats(db), await recentJobs(db, s.org.id, 60)];
  const mine = rows.filter((r) => r.status === "DEAD").length;
  return (
    <>
      <PageHeader
        title="Background jobs"
        description="Workflow timeouts, action retries and maintenance run automatically. Nothing here needs a human unless a job gave up."
      />
      {mine ? (
        <div className="mb-4">
          <Alert tone="danger" title={`${mine} job(s) gave up after repeated failures`}>
            Review the error and requeue once the cause is fixed.
          </Alert>
        </div>
      ) : (
        <div className="mb-4">
          <Alert tone="success" title="No failed jobs">
            The worker is processing due jobs automatically.
          </Alert>
        </div>
      )}
      <dl className="mb-6 grid gap-3 sm:grid-cols-4">
        {(
          [
            ["Pending (platform)", stats.pending],
            ["Running", stats.running],
            ["Dead (platform)", stats.dead],
            ["Oldest due (s)", stats.oldestDueSeconds],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-lg border border-border bg-surface p-4">
            <dt className="t-label">{k}</dt>
            <dd className="mt-2 text-2xl font-semibold t-num">{v}</dd>
          </div>
        ))}
      </dl>
      <Card>
        <CardHeader
          title="Recent jobs for this organization"
          description="At-least-once delivery with idempotent handlers; exponential backoff; dead after the attempt limit."
        />
        {rows.length === 0 ? (
          <EmptyState title="No jobs yet">
            Jobs appear when a workflow waits on a timeout or an action needs a retry.
          </EmptyState>
        ) : (
          <DataTable caption="Background jobs">
            <thead>
              <tr>
                <Th>Kind</Th>
                <Th>Status</Th>
                <Th>Attempts</Th>
                <Th>Run at</Th>
                <Th>Last error</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((j) => (
                <tr key={j.id}>
                  <Td className="t-code text-xs">
                    {j.kind}
                    <div className="t-caption">{j.dedupeKey ?? ""}</div>
                  </Td>
                  <Td>
                    <Badge tone={tone[j.status as keyof typeof tone] ?? "neutral"}>
                      {j.status.toLowerCase()}
                    </Badge>
                  </Td>
                  <Td className="t-num">
                    {j.attempts}/{j.maxAttempts}
                  </Td>
                  <Td>
                    <When at={j.runAt} />
                  </Td>
                  <Td className="max-w-xs truncate text-xs" title={j.lastError ?? ""}>
                    {j.lastError ?? "—"}
                  </Td>
                  <Td>
                    {j.status === "DEAD" && can(s.role, "org.manage") ? (
                      <ActionForm action={retryJobAction}>
                        <input type="hidden" name="id" value={j.id} />
                        <SubmitButton variant="secondary">Requeue</SubmitButton>
                      </ActionForm>
                    ) : null}
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
