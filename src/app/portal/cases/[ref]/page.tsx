import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCustomer } from "@/auth/session";
import { db } from "@/db";
import { getCaseView } from "@/domain/case-view";
import { AppError } from "@/domain/errors";
import { AutoRefresh } from "@/components/client";
import { Alert, PageHeader, StateBadge, When } from "@/components/ui";
import { allowedTargets } from "@/domain/case-machine";
import type { CaseState } from "@/db/schema";
import {
  ActionCards,
  EvidenceBox,
  HumanSupport,
  InfoForm,
  KnowledgePanel,
  ObjectiveList,
  ReceiptsAndLedger,
  ReopenOrFeedback,
  StatusSummary,
  Timeline,
} from "@/components/case-parts";
export const metadata: Metadata = { title: "Case" };
export default async function CasePage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const c = await requireCustomer();
  const view = await getCaseView(db, c.ctx, ref).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  if (c.caseScope && c.caseScope !== view.case.id) notFound(); // case-scoped access links see only their case
  const readOnly = c.ctx.actor.type === "customer" && !!c.ctx.actor.readOnly;
  const active = !["VERIFIED_RESOLVED", "CANCELLED", "FAILED"].includes(view.case.state);
  return (
    <>
      {active ? <AutoRefresh everyMs={20000} /> : null}
      <p className="mb-3 text-sm">
        <Link href="/portal/cases" className="underline">
          ← All cases
        </Link>
      </p>
      <PageHeader
        eyebrow={<span className="t-code normal-case tracking-normal">{view.case.reference}</span>}
        title={view.case.title}
        description={
          <>
            Opened <When at={view.case.openedAt} /> · <StateBadge state={view.case.state as never} />
          </>
        }
      />
      <div className="space-y-6">
        {readOnly ? (
          <Alert tone="info" title="You are viewing a read-only link">
            To confirm a step, upload evidence or ask for a person, please{" "}
            <Link className="underline" href="/sign-in?next=/portal">
              sign in
            </Link>
            . Staff can never act on your behalf.
          </Alert>
        ) : null}
        <StatusSummary view={view} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            {!readOnly ? <InfoForm view={view} caseRef={view.case.reference} /> : null}
            <KnowledgePanel view={view} audience="customer" />
            {!readOnly ? <ActionCards view={view} caseRef={view.case.reference} /> : null}
            <ReceiptsAndLedger view={view} />
            <Timeline view={view} audience="customer" />
          </div>
          <div className="space-y-6">
            <ObjectiveList view={view} />
            {!readOnly ? (
              <HumanSupport
                caseRef={view.case.reference}
                existing={view.escalations}
                canEscalate={allowedTargets(view.case.state as CaseState, "customer").includes("ESCALATED")}
              />
            ) : null}
            {!readOnly ? <EvidenceBox view={view} caseRef={view.case.reference} /> : null}
          </div>
        </div>
        {!readOnly ? <ReopenOrFeedback view={view} caseRef={view.case.reference} /> : null}
      </div>
    </>
  );
}
