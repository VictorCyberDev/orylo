import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { requireStaff } from "@/auth/session";
import { db } from "@/db";
import { knowledgeGaps } from "@/db/schema";
import { activeRules, listPolicyVersions } from "@/domain/policy";
import { can } from "@/domain/rbac";
import { PolicyDraftForm, PolicyTester } from "@/components/admin-forms";
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
import { policyStepAction } from "../../../actions";
export const metadata: Metadata = { title: "Policies & knowledge" };
const tone = {
  APPROVED: "success",
  DRAFT: "neutral",
  IN_REVIEW: "warning",
  SUPERSEDED: "neutral",
  RETIRED: "neutral",
} as const;
export default async function Policies() {
  const s = await requireStaff("policy.read");
  const versions = await listPolicyVersions(db, s.org.id);
  const { conflicts } = await activeRules(db, s.org.id);
  const gaps = await db.select().from(knowledgeGaps).where(eq(knowledgeGaps.organizationId, s.org.id));
  const canWrite = can(s.role, "policy.write"),
    canApprove = can(s.role, "policy.approve");
  const docs = [...new Map(versions.map(({ d }) => [d.key, d])).values()];
  return (
    <>
      <PageHeader
        title="Policies & knowledge"
        description="Versioned, owned, effective-dated. Only APPROVED versions are authoritative; the author can't approve."
      />
      {conflicts.length ? (
        <div className="mb-4">
          <Alert tone="danger" title="Active policies contradict each other">
            {conflicts
              .map(
                (c) => `${c.key} (${c.values.map((v) => `${v.document}=${String(v.value)}`).join(" vs ")})`,
              )
              .join("; ")}
            . Affected rules are withheld: related actions are refused and customers are routed to a person
            until resolved.
          </Alert>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Documents & versions" />
          <DataTable caption="Policy versions">
            <thead>
              <tr>
                <Th>Document</Th>
                <Th>Ver</Th>
                <Th>Status</Th>
                <Th>Effective</Th>
                <Th>Rules</Th>
                <Th>Review</Th>
              </tr>
            </thead>
            <tbody>
              {versions.map(({ v, d }) => (
                <tr key={v.id}>
                  <Td>
                    <span className="font-medium">{d.title}</span>
                    <div className="t-code text-muted">
                      {d.key} · owner {d.ownerName}
                    </div>
                  </Td>
                  <Td className="t-num">v{v.version}</Td>
                  <Td>
                    <Badge tone={tone[v.status]}>{v.status.replace("_", " ")}</Badge>
                    {v.quarantinedSections.length ? (
                      <Badge tone="danger" className="ml-1">
                        Quarantined
                      </Badge>
                    ) : null}
                  </Td>
                  <Td className="text-xs">
                    {v.effectiveFrom ? <When at={v.effectiveFrom} /> : "—"}
                    {v.effectiveTo ? (
                      <>
                        <br />
                        to <When at={v.effectiveTo} />
                      </>
                    ) : null}
                  </Td>
                  <Td className="t-code max-w-48 text-xs">
                    {Object.keys(v.rules).length
                      ? Object.entries(v.rules).map(([k, val]) => (
                          <div key={k}>
                            {k}={String(val)}
                          </div>
                        ))
                      : "—"}
                  </Td>
                  <Td>
                    {v.status === "DRAFT" && canWrite ? (
                      <ActionForm action={policyStepAction}>
                        <input type="hidden" name="id" value={v.id} />
                        <input type="hidden" name="step" value="submit" />
                        <SubmitButton variant="secondary">Submit</SubmitButton>
                      </ActionForm>
                    ) : null}
                    {v.status === "IN_REVIEW" && canApprove ? (
                      <ActionForm action={policyStepAction} className="flex gap-2">
                        <input type="hidden" name="id" value={v.id} />
                        <button
                          name="step"
                          value="approve"
                          className="min-h-9 rounded-md bg-primary px-3 text-sm text-primary-fg"
                        >
                          Approve
                        </button>
                        <button
                          name="step"
                          value="reject"
                          className="min-h-9 rounded-md border border-border-strong px-3 text-sm"
                        >
                          Send back
                        </button>
                      </ActionForm>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Test the knowledge" />
            <div className="p-5">
              <PolicyTester />
            </div>
          </Card>
          <Card>
            <CardHeader title="Knowledge gaps" description="Questions with no approved answer" />
            {gaps.length === 0 ? (
              <EmptyState title="None recorded" />
            ) : (
              <ul className="divide-y divide-border text-sm">
                {gaps.map((g) => (
                  <li key={g.id} className="px-5 py-3">
                    <span>“{g.query}”</span>
                    <div className="t-caption">
                      {g.reason} · asked {g.occurrences}×
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {canWrite ? (
            <Card>
              <CardHeader title="Draft a new version" />
              <div className="p-5">
                <PolicyDraftForm docs={docs.map((d) => ({ key: d.key, title: d.title }))} />
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
