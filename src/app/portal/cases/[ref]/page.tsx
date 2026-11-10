import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCustomer } from "@/auth/session";
import { db } from "@/db";
import { getCaseView } from "@/domain/case-view";
import { AppError } from "@/domain/errors";
import { AutoRefresh } from "@/components/client";
import { PageHeader, StateBadge, When } from "@/components/ui";
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
        <StatusSummary view={view} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            <InfoForm view={view} caseRef={view.case.reference} />
            <KnowledgePanel view={view} audience="customer" />
            <ActionCards view={view} caseRef={view.case.reference} />
            <ReceiptsAndLedger view={view} />
            <Timeline view={view} audience="customer" />
          </div>
          <div className="space-y-6">
            <ObjectiveList view={view} />
            <HumanSupport caseRef={view.case.reference} existing={view.escalations} />
            <EvidenceBox view={view} caseRef={view.case.reference} />
          </div>
        </div>
        <ReopenOrFeedback view={view} caseRef={view.case.reference} />
      </div>
    </>
  );
}
