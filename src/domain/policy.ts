import { and, asc, desc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { knowledgeGaps, policyApprovals, policyDocuments, policyVersions } from "@/db/schema";
import type { DbOrTx } from "@/db";
import { AppError, notFound } from "./errors";
import type { Ctx } from "./context";
import { requirePermission } from "./rbac";
import { sha256Hex } from "./crypto";
import { audit } from "./audit";

/**
 * Policy text is DATA. Authorization never reads prose; it reads `rules` from an APPROVED, effective
 * version. Prose is only ever quoted back as a citation. Sections that look like instructions to an
 * AI/system are quarantined and cannot be approved or cited.
 */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+|any\s+|the\s+|your\s+)?(previous|prior|above|earlier)\s+(instructions?|rules?|policy|policies)/i,
  /disregard\s+.{0,40}(polic|rule|instruction|guardrail)/i,
  /you\s+are\s+now\b/i,
  /\bsystem\s*prompt\b/i,
  /<\s*\/?\s*(system|assistant|developer)\s*>/i,
  /override\s+(the\s+)?(security|safety|authori[sz]ation|consent|approval)/i,
  /without\s+(asking\s+for\s+)?(consent|approval|authori[sz]ation)/i,
  /do\s+not\s+(tell|inform|notify)\s+the\s+(user|customer)/i,
  /(approve|issue|process)\s+(the\s+|a\s+|any\s+)?refund\s+(regardless|automatically|immediately)/i,
  /\bjailbreak\b/i,
];

export interface Section {
  heading: string;
  text: string;
}

export function parseSections(body: string): Section[] {
  const parts = body.split(/^##\s+/m);
  const out: Section[] = [];
  const intro = parts.shift()?.trim();
  if (intro) out.push({ heading: "Overview", text: intro.replace(/^#\s+.*\n?/, "").trim() });
  for (const p of parts) {
    const nl = p.indexOf("\n");
    out.push({
      heading: (nl === -1 ? p : p.slice(0, nl)).trim(),
      text: (nl === -1 ? "" : p.slice(nl + 1)).trim(),
    });
  }
  return out.filter((s) => s.heading || s.text);
}

export function scanForInjection(sections: Section[]): number[] {
  return sections.flatMap((s, i) =>
    INJECTION_PATTERNS.some((re) => re.test(`${s.heading}\n${s.text}`)) ? [i] : [],
  );
}

export interface PolicyDraftInput {
  documentKey: string;
  title?: string;
  ownerName?: string;
  sourceLabel?: string;
  body: string;
  rules?: Record<string, string | number | boolean>;
  topics?: string[];
  effectiveFrom?: Date | null;
}

export async function createPolicyVersion(db: DbOrTx, ctx: Ctx, input: PolicyDraftInput) {
  if (ctx.actor.type !== "operator") throw new AppError("FORBIDDEN", "Only staff can author policy");
  requirePermission(ctx.actor.role, "policy.write");
  return db.transaction(async (tx) => {
    let [doc] = await tx
      .select()
      .from(policyDocuments)
      .where(and(eq(policyDocuments.organizationId, ctx.orgId), eq(policyDocuments.key, input.documentKey)));
    if (!doc) {
      if (!input.title) throw new AppError("VALIDATION", "title is required for a new policy document");
      [doc] = await tx
        .insert(policyDocuments)
        .values({
          organizationId: ctx.orgId,
          key: input.documentKey,
          title: input.title,
          ownerName: input.ownerName ?? ctx.actor.id,
          sourceLabel: input.sourceLabel ?? "Internal policy (synthetic)",
        })
        .returning();
    }
    const [{ n }] = await tx
      .select({ n: sql<number>`coalesce(max(${policyVersions.version}),0)::int` })
      .from(policyVersions)
      .where(eq(policyVersions.documentId, doc.id));
    const [prevApproved] = await tx
      .select({ id: policyVersions.id })
      .from(policyVersions)
      .where(and(eq(policyVersions.documentId, doc.id), eq(policyVersions.status, "APPROVED")));
    const quarantined = scanForInjection(parseSections(input.body));
    const [v] = await tx
      .insert(policyVersions)
      .values({
        organizationId: ctx.orgId,
        documentId: doc.id,
        version: n + 1,
        status: "DRAFT",
        body: input.body,
        rules: input.rules ?? {},
        topics: input.topics ?? [],
        contentSha256: sha256Hex(input.body),
        supersedesId: prevApproved?.id ?? null,
        effectiveFrom: input.effectiveFrom ?? null,
        quarantinedSections: quarantined,
        createdBy: ctx.actor.id,
      })
      .returning();
    await audit(tx, ctx, {
      action: "policy.version.create",
      targetType: "policy_version",
      targetId: v.id,
      metadata: { document: doc.key, version: v.version, quarantined },
    });
    return { version: v, document: doc, quarantinedSections: quarantined };
  });
}

export async function submitForReview(db: DbOrTx, ctx: Ctx, versionId: string) {
  if (ctx.actor.type !== "operator") throw new AppError("FORBIDDEN", "Only staff can submit policy");
  requirePermission(ctx.actor.role, "policy.write");
  const [v] = await db
    .update(policyVersions)
    .set({ status: "IN_REVIEW" })
    .where(
      and(
        eq(policyVersions.id, versionId),
        eq(policyVersions.organizationId, ctx.orgId),
        eq(policyVersions.status, "DRAFT"),
      ),
    )
    .returning();
  if (!v) throw new AppError("CONFLICT", "Only a draft can be submitted for review");
  await audit(db, ctx, { action: "policy.version.submit", targetType: "policy_version", targetId: v.id });
  return v;
}

export async function approvePolicyVersion(db: DbOrTx, ctx: Ctx, versionId: string, comment?: string) {
  if (ctx.actor.type !== "operator") throw new AppError("FORBIDDEN", "Only staff can approve policy");
  requirePermission(ctx.actor.role, "policy.approve");
  return db.transaction(async (tx) => {
    const [v] = await tx
      .select()
      .from(policyVersions)
      .where(and(eq(policyVersions.id, versionId), eq(policyVersions.organizationId, ctx.orgId)))
      .for("update");
    if (!v) throw notFound("Policy version");
    if (v.status !== "IN_REVIEW")
      throw new AppError("CONFLICT", `Policy version is ${v.status}; only IN_REVIEW can be approved`);
    if (v.createdBy === ctx.actor.id)
      throw new AppError("FORBIDDEN", "Separation of duties: the author cannot approve their own policy");
    if (v.quarantinedSections.length)
      throw new AppError(
        "VALIDATION",
        "This version contains sections that look like instructions to an AI system and were quarantined. Edit and resubmit.",
        { sections: v.quarantinedSections },
      );
    const now = new Date();
    await tx
      .update(policyVersions)
      .set({ status: "SUPERSEDED", effectiveTo: now })
      .where(
        and(
          eq(policyVersions.documentId, v.documentId),
          eq(policyVersions.status, "APPROVED"),
          eq(policyVersions.organizationId, ctx.orgId),
        ),
      );
    const [a] = await tx
      .update(policyVersions)
      .set({
        status: "APPROVED",
        approvedBy: ctx.actor.id,
        approvedAt: now,
        effectiveFrom: v.effectiveFrom ?? now,
      })
      .where(eq(policyVersions.id, v.id))
      .returning();
    await tx.insert(policyApprovals).values({
      organizationId: ctx.orgId,
      policyVersionId: v.id,
      approverUserId: ctx.actor.id,
      decision: "APPROVED",
      comment,
    });
    await audit(tx, ctx, {
      action: "policy.version.approve",
      targetType: "policy_version",
      targetId: v.id,
      metadata: { version: v.version },
    });
    return a;
  });
}

export async function rejectPolicyVersion(db: DbOrTx, ctx: Ctx, versionId: string, comment: string) {
  if (ctx.actor.type !== "operator") throw new AppError("FORBIDDEN", "Only staff can review policy");
  requirePermission(ctx.actor.role, "policy.approve");
  const [v] = await db
    .update(policyVersions)
    .set({ status: "DRAFT" })
    .where(
      and(
        eq(policyVersions.id, versionId),
        eq(policyVersions.organizationId, ctx.orgId),
        eq(policyVersions.status, "IN_REVIEW"),
      ),
    )
    .returning();
  if (!v) throw new AppError("CONFLICT", "Only an in-review version can be sent back");
  await db.insert(policyApprovals).values({
    organizationId: ctx.orgId,
    policyVersionId: v.id,
    approverUserId: ctx.actor.id,
    decision: "CHANGES_REQUESTED",
    comment,
  });
  await audit(db, ctx, { action: "policy.version.reject", targetType: "policy_version", targetId: v.id });
  return v;
}

/** Versions that are authoritative RIGHT NOW (approved, effective window contains `at`). */
export async function activeVersions(db: DbOrTx, orgId: string, at = new Date()) {
  return db
    .select({ v: policyVersions, d: policyDocuments })
    .from(policyVersions)
    .innerJoin(policyDocuments, eq(policyDocuments.id, policyVersions.documentId))
    .where(
      and(
        eq(policyVersions.organizationId, orgId),
        eq(policyVersions.status, "APPROVED"),
        lte(policyVersions.effectiveFrom, at),
        or(isNull(policyVersions.effectiveTo), gt(policyVersions.effectiveTo, at)),
      ),
    )
    .orderBy(asc(policyDocuments.key));
}

export interface ActiveRules {
  rules: Record<string, string | number | boolean>;
  /** rule key → versions that disagree */
  conflicts: { key: string; values: { value: unknown; versionId: string; document: string }[] }[];
  sources: Record<string, string>;
}

export async function activeRules(db: DbOrTx, orgId: string, at = new Date()): Promise<ActiveRules> {
  const act = await activeVersions(db, orgId, at);
  const seen = new Map<string, { value: string | number | boolean; versionId: string; document: string }[]>();
  for (const { v, d } of act)
    for (const [k, val] of Object.entries(v.rules))
      seen.set(k, [...(seen.get(k) ?? []), { value: val, versionId: v.id, document: d.key }]);
  const rules: ActiveRules["rules"] = {};
  const sources: Record<string, string> = {};
  const conflicts: ActiveRules["conflicts"] = [];
  for (const [k, vals] of seen) {
    if (new Set(vals.map((x) => String(x.value))).size > 1) conflicts.push({ key: k, values: vals });
    else {
      rules[k] = vals[0].value;
      sources[k] = vals[0].versionId;
    }
  }
  // A conflicting rule is deliberately ABSENT from `rules`: callers must treat missing authority as "refuse/escalate".
  return { rules, conflicts, sources };
}

/** Is this specific version still the live, approved, effective one? (stale-policy guard) */
export async function isVersionCurrent(db: DbOrTx, orgId: string, versionId: string, at = new Date()) {
  const [v] = await db
    .select({ id: policyVersions.id })
    .from(policyVersions)
    .where(
      and(
        eq(policyVersions.id, versionId),
        eq(policyVersions.organizationId, orgId),
        eq(policyVersions.status, "APPROVED"),
        lte(policyVersions.effectiveFrom, at),
        or(isNull(policyVersions.effectiveTo), gt(policyVersions.effectiveTo, at)),
      ),
    );
  return !!v;
}

const STOP = new Set(
  "a an the and or of to for in on at is are was were be been do does did can could i my me we our you your it its this that with from by as if not no how what when why who which will would should about into out up have has had get got".split(
    " ",
  ),
);
const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t));

export interface PolicyAnswer {
  status: "ANSWERED" | "NO_AUTHORITY" | "CONFLICT";
  answer?: string;
  citations: {
    document: string;
    title: string;
    version: number;
    section: string;
    sourceLabel: string;
    versionId: string;
  }[];
  message: string;
}

/**
 * Source-grounded answer from approved, effective policy only. Never generates text: it quotes the
 * best-matching section(s). Unknown → NO_AUTHORITY (safe refusal + knowledge-gap record).
 * Contradictory active rules touching the matched documents → CONFLICT (safe refusal + escalation hint).
 */
export async function answerFromPolicy(db: DbOrTx, orgId: string, query: string): Promise<PolicyAnswer> {
  const q = tokens(query);
  const act = await activeVersions(db, orgId);
  const cand: {
    score: number;
    v: (typeof act)[number]["v"];
    d: (typeof act)[number]["d"];
    s: Section;
    idx: number;
  }[] = [];
  let quarantineHit = false;
  for (const { v, d } of act) {
    parseSections(v.body).forEach((s, idx) => {
      const head = new Set(tokens(s.heading));
      const body = new Set(tokens(s.text));
      let score = 0;
      for (const t of q) score += (head.has(t) ? 3 : 0) + (body.has(t) ? 1 : 0);
      if (score > 0) {
        if (v.quarantinedSections.includes(idx)) quarantineHit = true;
        else cand.push({ score, v, d, s, idx });
      }
    });
  }
  cand.sort((a, b) => b.score - a.score);
  const threshold = Math.max(2, Math.ceil(q.length * 0.6));
  const top = cand.filter((c) => c.score >= threshold).slice(0, 2);
  const { conflicts } = await activeRules(db, orgId);

  if (top.length === 0) {
    await recordGap(db, orgId, query, quarantineHit ? "INJECTION_QUARANTINE" : "NO_AUTHORITY");
    return {
      status: "NO_AUTHORITY",
      citations: [],
      message:
        "I can't find approved policy that answers that, so I won't guess. I can pass this to a person.",
    };
  }
  const docs = new Set(top.map((t) => t.d.key));
  const rel = conflicts.filter((c) => c.values.some((v) => docs.has(v.document)));
  if (rel.length) {
    await recordGap(db, orgId, query, "CONFLICT");
    return {
      status: "CONFLICT",
      citations: top.map(cite),
      message: `Our approved policies disagree about ${rel.map((r) => r.key).join(", ")}, so I can't give you a reliable answer. I'll route this to a person who can resolve it.`,
    };
  }
  return {
    status: "ANSWERED",
    answer: top.map((t) => t.s.text).join("\n\n"),
    citations: top.map(cite),
    message: "From our approved policy:",
  };
}
const cite = (c: {
  v: { id: string; version: number };
  d: { key: string; title: string; sourceLabel: string };
  s: Section;
}) => ({
  document: c.d.key,
  title: c.d.title,
  version: c.v.version,
  section: c.s.heading,
  sourceLabel: c.d.sourceLabel,
  versionId: c.v.id,
});

async function recordGap(db: DbOrTx, orgId: string, query: string, reason: string) {
  const q = query.trim().slice(0, 300).toLowerCase();
  await db
    .insert(knowledgeGaps)
    .values({ organizationId: orgId, query: q, reason })
    .onConflictDoUpdate({
      target: [knowledgeGaps.organizationId, knowledgeGaps.query],
      set: { occurrences: sql`${knowledgeGaps.occurrences} + 1`, lastSeenAt: new Date(), reason },
    });
}

export async function listPolicyVersions(db: DbOrTx, orgId: string) {
  return db
    .select({ v: policyVersions, d: policyDocuments })
    .from(policyVersions)
    .innerJoin(policyDocuments, eq(policyDocuments.id, policyVersions.documentId))
    .where(eq(policyVersions.organizationId, orgId))
    .orderBy(asc(policyDocuments.key), desc(policyVersions.version));
}
