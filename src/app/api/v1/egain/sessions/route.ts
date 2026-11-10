import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { createEgainSession } from "@/domain/channel";
import { apiKeyAuth, handle, json, readJson } from "@/lib/api";
import { getCaseView } from "@/domain/case-view";

const Body = z
  .object({
    fullName: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(200),
    accountNumber: z.string().trim().min(3).max(40),
    issue: z.string().trim().min(1).max(1000),
  })
  .strict();

export async function POST(req: NextRequest) {
  return handle(req, async () => {
    const { orgId, keyId } = await apiKeyAuth(req, "egain:actions");
    const body = Body.parse(await readJson(req));
    const r = await createEgainSession(db, { orgId, keyId }, body);
    if (!r.verified) return json({ verified: false, message: r.message });
    const { channelCtx, resolveGrant } = await import("@/domain/channel");
    const view = await getCaseView(
      db,
      channelCtx(await resolveGrant(db, r.customerToken, orgId)),
      r.caseReference,
    );
    const f = view.execution?.findings as {
      priorCancellationFound?: boolean;
      accountStillActive?: boolean;
      disputedCharge?: { amountCents: number } | null;
    } | null;
    const summary = f
      ? [
          f.priorCancellationFound
            ? "Earlier cancellation request found"
            : "No earlier cancellation request found",
          f.accountStillActive ? "account still active" : "account not active",
          f.disputedCharge
            ? `a recent charge of $${(f.disputedCharge.amountCents / 100).toFixed(2)}`
            : "no recent charge found",
        ].join("; ") + "."
      : "Case opened.";
    return json({
      verified: true,
      caseReference: r.caseReference,
      customerToken: r.customerToken,
      state: view.case.state,
      summary,
    });
  });
}
