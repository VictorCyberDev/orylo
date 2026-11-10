import { auditEvents } from "@/db/schema";
import type { DbOrTx } from "@/db";
import type { Ctx } from "./context";

const SECRET_KEYS = /(password|secret|token|authorization|api[_-]?key|cookie)/i;

/** Redact obviously sensitive keys so audit rows can never become a credential leak. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEYS.test(k) ? "[redacted]" : redact(v, depth + 1)]),
  );
}

export interface AuditInput {
  action: string;
  targetType?: string;
  targetId?: string;
  outcome?: "success" | "denied" | "error";
  metadata?: Record<string, unknown>;
}

export async function audit(db: DbOrTx, ctx: Pick<Ctx, "orgId" | "actor" | "requestId"> | { orgId: null; actor: Ctx["actor"]; requestId?: string }, e: AuditInput) {
  await db.insert(auditEvents).values({
    organizationId: ctx.orgId,
    actorType: ctx.actor.type,
    actorId: ctx.actor.id,
    action: e.action,
    targetType: e.targetType,
    targetId: e.targetId,
    outcome: e.outcome ?? "success",
    metadata: redact(e.metadata ?? {}) as Record<string, unknown>,
    requestId: ctx.requestId,
  });
}
