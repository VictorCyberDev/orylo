import { and, asc, desc, eq, sql } from "drizzle-orm";
import { outcomeLedger } from "@/db/schema";
import type { DbOrTx } from "@/db";
import type { Ctx } from "./context";
import { canonicalJson, sha256Hex } from "./crypto";

export const GENESIS = "0".repeat(64);

export interface LedgerInput {
  caseId: string;
  objectiveKey?: string;
  requestedOutcome: string;
  actionAttempted?: string;
  executor: string;
  authorizationRef?: string;
  policyVersionId?: string | null;
  externalOperationRef?: string;
  executionResult: "SUCCEEDED" | "FAILED" | "NOT_EXECUTED";
  verificationMethod?: string;
  verifiedAt?: Date;
  evidence?: Record<string, unknown>;
  finalOutcome: "VERIFIED" | "UNVERIFIED" | "FAILED" | "PENDING";
  remainingObjectives?: string[];
}

type Body = Omit<typeof outcomeLedger.$inferInsert, "id" | "createdAt" | "entryHash" | "prevHash" | "seq">;

function hashEntry(prev: string, seq: number, b: Record<string, unknown>) {
  return sha256Hex(`${prev}|${seq}|${canonicalJson(b)}`);
}

function bodyForHash(r: typeof outcomeLedger.$inferSelect | (Body & { seq: number })) {
  return {
    caseId: r.caseId,
    objectiveKey: r.objectiveKey ?? null,
    requestedOutcome: r.requestedOutcome,
    actionAttempted: r.actionAttempted ?? null,
    executor: r.executor,
    authorizationRef: r.authorizationRef ?? null,
    policyVersionId: r.policyVersionId ?? null,
    externalOperationRef: r.externalOperationRef ?? null,
    executionResult: r.executionResult,
    verificationMethod: r.verificationMethod ?? null,
    verifiedAt: r.verifiedAt ? new Date(r.verifiedAt).toISOString() : null,
    evidence: r.evidence ?? {},
    finalOutcome: r.finalOutcome,
    remainingObjectives: r.remainingObjectives ?? [],
  };
}

/** Append one entry to the organization's hash chain. Must run inside a transaction. */
export async function appendLedger(tx: DbOrTx, ctx: Pick<Ctx, "orgId">, e: LedgerInput) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"ledger:" + ctx.orgId}))`);
  const [last] = await tx
    .select({ seq: outcomeLedger.seq, hash: outcomeLedger.entryHash })
    .from(outcomeLedger)
    .where(eq(outcomeLedger.organizationId, ctx.orgId))
    .orderBy(desc(outcomeLedger.seq))
    .limit(1);
  const seq = (last?.seq ?? 0) + 1;
  const prevHash = last?.hash ?? GENESIS;
  const body: Body = {
    organizationId: ctx.orgId,
    caseId: e.caseId,
    objectiveKey: e.objectiveKey ?? null,
    requestedOutcome: e.requestedOutcome,
    actionAttempted: e.actionAttempted ?? null,
    executor: e.executor,
    authorizationRef: e.authorizationRef ?? null,
    policyVersionId: e.policyVersionId ?? null,
    externalOperationRef: e.externalOperationRef ?? null,
    executionResult: e.executionResult,
    verificationMethod: e.verificationMethod ?? null,
    verifiedAt: e.verifiedAt ?? null,
    evidence: e.evidence ?? {},
    finalOutcome: e.finalOutcome,
    remainingObjectives: e.remainingObjectives ?? [],
  };
  const entryHash = hashEntry(prevHash, seq, bodyForHash({ ...body, seq }));
  const [row] = await tx.insert(outcomeLedger).values({ ...body, seq, prevHash, entryHash }).returning();
  return row;
}

/** Recompute the whole chain for an organization. Anyone holding the rows can do this — no key needed. */
export async function verifyChain(db: DbOrTx, orgId: string) {
  const rows = await db.select().from(outcomeLedger).where(eq(outcomeLedger.organizationId, orgId)).orderBy(asc(outcomeLedger.seq));
  let prev = GENESIS;
  for (const r of rows) {
    const expect = hashEntry(prev, r.seq, bodyForHash(r));
    if (r.prevHash !== prev || r.entryHash !== expect) return { ok: false as const, checked: rows.length, brokenAtSeq: r.seq };
    prev = r.entryHash;
  }
  return { ok: true as const, checked: rows.length };
}

export async function ledgerForCase(db: DbOrTx, orgId: string, caseId: string) {
  return db
    .select()
    .from(outcomeLedger)
    .where(and(eq(outcomeLedger.organizationId, orgId), eq(outcomeLedger.caseId, caseId)))
    .orderBy(asc(outcomeLedger.seq));
}

/** Customer-appropriate projection: no executor ids, authorization refs, policy ids or raw evidence internals. */
export function customerLedgerView(r: typeof outcomeLedger.$inferSelect) {
  return {
    seq: r.seq,
    requestedOutcome: r.requestedOutcome,
    actionAttempted: r.actionAttempted,
    executionResult: r.executionResult,
    verificationMethod: r.verificationMethod,
    verifiedAt: r.verifiedAt,
    finalOutcome: r.finalOutcome,
    remainingObjectives: r.remainingObjectives,
    receiptRef: (r.evidence as { receiptNo?: string }).receiptNo ?? null,
    summary: (r.evidence as { summary?: string }).summary ?? null,
    recordedAt: r.createdAt,
  };
}
