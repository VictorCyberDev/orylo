import type { NextRequest } from "next/server";
import { db } from "@/db";
import { getCaseView } from "@/domain/case-view";
import { channelAuth, handle, json } from "@/lib/api";

export async function GET(req: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  return handle(req, async () => {
    const { ref } = await params;
    const { ctx } = await channelAuth(req, ref);
    const v = await getCaseView(db, ctx, ref);
    const f = (v.execution?.findings ?? {}) as { priorCancellationFound?: boolean; priorCancellationAt?: string | null; accountStillActive?: boolean; disputedCharge?: { amountCents: number; chargedAt: string; description: string } | null };
    return json({
      caseReference: v.case.reference,
      state: v.case.state,
      stateLabel: v.case.stateLabel,
      findings: { priorCancellationFound: !!f.priorCancellationFound, priorCancellationAt: f.priorCancellationAt ?? null, accountStillActive: !!f.accountStillActive, disputedCharge: f.disputedCharge ? { amountCents: f.disputedCharge.amountCents, chargedAt: f.disputedCharge.chargedAt, description: f.disputedCharge.description } : null },
      objectives: v.objectives.map((o) => ({ key: o.key, label: o.label, status: o.status })),
      proposedActions: v.actions.filter((a) => ["AWAITING_CONSENT", "AWAITING_APPROVAL", "APPROVED"].includes(a.status)).map((a) => ({ actionId: a.id, operation: a.operation, label: a.label, consentText: a.consentText ?? "", needsApproval: a.needsApproval, status: a.status === "AWAITING_CONSENT" ? "PROPOSED" : a.status === "AWAITING_APPROVAL" ? "AWAITING_APPROVAL" : "CONFIRMED" })),
      ledger: (v.ledger as { requestedOutcome: string; executionResult: string; finalOutcome: string; verifiedAt: Date | null; summary: string | null; receiptRef: string | null }[]).map((l) => ({ requestedOutcome: l.requestedOutcome, executionResult: l.executionResult, finalOutcome: l.finalOutcome, verifiedAt: l.verifiedAt, summary: l.summary, receiptRef: l.receiptRef })),
      escalations: (v.escalations as { status: string; channel: string }[]).map((e) => ({ status: e.status, channel: e.channel })),
    });
  });
}
