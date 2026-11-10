import type { NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { actionRequests } from "@/db/schema";
import { confirmAction } from "@/domain/actions";
import { advance } from "@/workflows/engine";
import { AppError } from "@/domain/errors";
import { channelAuth, handle, json, readJson } from "@/lib/api";
import { sha256Hex } from "@/domain/crypto";
import { audit } from "@/domain/audit";

const Body = z.object({ consent: z.boolean() }).strict();
const MSG: Record<string, string> = {
  EXECUTED: "Done. The result was read back from the subscription system.",
  DUPLICATE: "That was already done; this is the same receipt.",
  DECLINED: "Understood — nothing was changed.",
  AWAITING_APPROVAL: "You've confirmed. A team member must approve this amount before it runs.",
  FAILED: "That didn't go through and nothing is reported as done.",
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ref: string; actionId: string }> },
) {
  return handle(req, async () => {
    const { ref, actionId } = await params;
    const { ctx, caseId } = await channelAuth(req, ref);
    const idem = req.headers.get("idempotency-key");
    if (!idem || !/^[A-Za-z0-9_.:-]{8,120}$/.test(idem))
      throw new AppError("VALIDATION", "Idempotency-Key header (8–120 URL-safe characters) is required");
    const { consent } = Body.parse(await readJson(req));
    const [reqRow] = await db
      .select()
      .from(actionRequests)
      .where(
        and(
          eq(actionRequests.id, actionId),
          eq(actionRequests.organizationId, ctx.orgId),
          eq(actionRequests.caseId, caseId),
        ),
      );
    if (!reqRow) throw new AppError("NOT_FOUND", "Action not found on this case");
    // Confirming is idempotent per action id in the gateway (replays return the same receipt). The caller's
    // Idempotency-Key is recorded for correlation in the audit trail.
    await audit(db, ctx, {
      action: "egain.confirm",
      targetType: "action_request",
      targetId: actionId,
      metadata: { idempotencyKeyHash: sha256Hex(idem).slice(0, 16), consent },
    });
    const r = await confirmAction(db, ctx, actionId, consent);
    await advance(db, ctx, caseId).catch(() => undefined);
    const status = r.status === "AWAITING_CONSENT" ? "FAILED" : r.status;
    const caseState =
      r.caseState ??
      (await db.query.resolutionCases.findFirst({ where: (t, { eq: e }) => e(t.id, caseId) }))?.state ??
      "UNKNOWN";
    return json({
      status,
      receiptNo: r.receipt?.receiptNo ?? null,
      verification: r.verification
        ? { verified: r.verification.verified, summary: r.verification.summary }
        : null,
      caseState,
      message:
        status === "FAILED" && r.failure
          ? `${MSG.FAILED} (${r.failure.code}${r.failure.retriable ? "; safe to retry" : "; a person will review"})`
          : (MSG[status] ?? ""),
    });
  });
}
