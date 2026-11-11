import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/auth/session";
import { db } from "@/db";
import { getCaseView } from "@/domain/case-view";
import { listAssignableMembers } from "@/domain/admin";
import { AppError } from "@/domain/errors";
import { can } from "@/domain/rbac";
import { AutoRefresh } from "@/components/client";
import { PageHeader, StateBadge, SyntheticBadge, When, Badge } from "@/components/ui";
import { KnowledgePanel, ObjectiveList, Timeline, EvidenceBox } from "@/components/case-parts";
import {
  ActionsTable,
  CaseControls,
  EscalateButton,
  EscalationsBlock,
  OperatorLedger,
  PortalLinkForm,
  Recommendation,
  StaffOps,
} from "@/components/operator-parts";
import { Card, CardHeader } from "@/components/ui";
export const metadata: Metadata = { title: "Case" };

export default async function OperatorCase({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const s = await requireStaff("case.read");
  const view = await getCaseView(db, s.ctx, ref).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const members = can(s.role, "case.assign") ? await listAssignableMembers(db, s.ctx) : [];
  const canWrite = can(s.role, "case.write");
  const c = view.case;
  const cust = view.customer as { name: string; email: string; externalRef: string };
  return (
    <>
      <AutoRefresh everyMs={15000} />
      <p className="mb-3 text-sm">
        <Link href="/app/cases" className="underline">
          ← Cases
        </Link>
      </p>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2">
            <span className="t-code normal-case tracking-normal">{c.reference}</span>
            {c.synthetic ? <SyntheticBadge /> : null}
          </span>
        }
        title={c.title}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StateBadge state={c.state as never} />
            <Badge>{c.priority}</Badge>
            <span>
              {cust.name} · {cust.email}
            </span>
            <span>
              Opened <When at={c.openedAt} />
            </span>
            {c.reopenCount ? <Badge tone="warning">Reopened ×{c.reopenCount}</Badge> : null}
            {c.assigneeName ? <span>Owner: {c.assigneeName}</span> : <span>Unassigned</span>}
          </span>
        }
        actions={canWrite ? <EscalateButton caseRef={c.reference} /> : null}
      />
      <div className="space-y-6">
        <Recommendation view={view} canAct={canWrite} />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-6">
            <KnowledgePanel view={view} audience="operator" />
            <ActionsTable view={view} caseRef={c.reference} canApprove={can(s.role, "approval.decide")} />
            <StaffOps view={view} caseRef={c.reference} />
            <EscalationsBlock view={view} canManage={can(s.role, "escalation.manage")} />
            <OperatorLedger view={view} />
            <Timeline view={view} audience="operator" />
          </div>
          <div className="space-y-6">
            <ObjectiveList view={view} />
            {view.execution ? (
              <Card aria-labelledby="wf-h">
                <CardHeader
                  id="wf-h"
                  title="Workflow"
                  description={`${view.execution.workflow.name} v${view.execution.workflow.version} · ${view.execution.status}`}
                />
                <ol className="space-y-2 px-5 py-4 text-sm">
                  {view.execution.steps.map((st, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span>{st.label}</span>
                      <Badge
                        tone={
                          st.status === "COMPLETED"
                            ? "success"
                            : st.status === "FAILED"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {st.status.toLowerCase()}
                      </Badge>
                    </li>
                  ))}
                </ol>
              </Card>
            ) : null}
            <CaseControls
              view={view}
              staff={{ canWrite, canAssign: can(s.role, "case.assign"), canNote: can(s.role, "notes.write") }}
              members={members}
            />
            {canWrite ? (
              <Card aria-labelledby="pl-h">
                <CardHeader id="pl-h" title="Customer access" />
                <div className="p-5">
                  <PortalLinkForm caseId={c.id} />
                </div>
              </Card>
            ) : null}
            <EvidenceBox view={view} caseRef={c.reference} />
          </div>
        </div>
      </div>
    </>
  );
}
