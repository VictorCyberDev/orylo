import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  apiKeys,
  auditEvents,
  caseEvents,
  caseObjectives,
  customers,
  integrationConnections,
  invitations,
  memberships,
  organizations,
  outcomeLedger,
  resolutionCases,
  users,
  workflowDefinitions,
  workflowVersions,
  orgRole,
  type OrgRole,
} from "@/db/schema";
import type { DbOrTx } from "@/db";
import type { Ctx } from "./context";
import { AppError, forbidden, notFound } from "./errors";
import { requirePermission } from "./rbac";
import { audit } from "./audit";
import { randomToken, sha256Hex } from "./crypto";
import { assertEntitlement } from "./billing";
import { WorkflowSpecSchema } from "@/workflows/spec";
import { SIM_MODES, type SimMode } from "@/adapters/subscription";

const staff = (ctx: Ctx) => {
  if (ctx.actor.type !== "operator") throw forbidden();
  return ctx.actor;
};

// ------------------------------------------------------------------ organization
export const OrgSettingsSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  branding: z
    .object({
      displayName: z.string().max(80).optional(),
      accent: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
      supportEmail: z.string().email().optional(),
    })
    .optional(),
  settings: z
    .object({
      retentionDays: z.number().int().min(30).max(3650),
      approvalThresholdCents: z.number().int().min(0).max(10_000_000),
      emailNotifications: z.boolean(),
      auditRetentionDays: z.number().int().min(90).max(3650),
    })
    .optional(),
});
export async function updateOrganization(db: DbOrTx, ctx: Ctx, raw: unknown) {
  const a = staff(ctx);
  requirePermission(a.role, "org.manage");
  const input = OrgSettingsSchema.parse(raw);
  if (input.branding && (input.branding.accent || input.branding.displayName))
    await assertEntitlement(db, ctx.orgId, "customBranding");
  const [o] = await db
    .update(organizations)
    .set({
      ...(input.name ? { name: input.name } : {}),
      ...(input.branding ? { branding: input.branding } : {}),
      ...(input.settings ? { settings: input.settings } : {}),
    })
    .where(eq(organizations.id, ctx.orgId))
    .returning();
  await audit(db, ctx, {
    action: "org.update",
    targetType: "organization",
    targetId: ctx.orgId,
    metadata: { fields: Object.keys(input) },
  });
  return o;
}

// ------------------------------------------------------------------ members & invitations
export async function listMembers(db: DbOrTx, ctx: Ctx) {
  const a = staff(ctx);
  requirePermission(a.role, "members.manage");
  return db
    .select({
      id: memberships.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      role: memberships.role,
      status: memberships.status,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organizationId, ctx.orgId))
    .orderBy(asc(users.name));
}

export async function changeMemberRole(db: DbOrTx, ctx: Ctx, userId: string, role: OrgRole) {
  const a = staff(ctx);
  requirePermission(a.role, "members.manage");
  if (!orgRole.enumValues.includes(role)) throw new AppError("VALIDATION", "Unknown role");
  if (role === "owner" && a.role !== "owner")
    throw new AppError("FORBIDDEN", "Only an owner can grant the owner role");
  return db.transaction(async (tx) => {
    const [m] = await tx
      .select()
      .from(memberships)
      .where(and(eq(memberships.organizationId, ctx.orgId), eq(memberships.userId, userId)))
      .for("update");
    if (!m) throw notFound("Member");
    if (m.role === "owner" && a.role !== "owner")
      throw new AppError("FORBIDDEN", "Only an owner can change an owner");
    if (m.role === "owner" && role !== "owner") await assertAnotherOwner(tx, ctx.orgId, userId);
    const [u] = await tx.update(memberships).set({ role }).where(eq(memberships.id, m.id)).returning();
    await audit(tx, ctx, {
      action: "member.role_change",
      targetType: "user",
      targetId: userId,
      metadata: { from: m.role, to: role },
    });
    return u;
  });
}

async function assertAnotherOwner(tx: DbOrTx, orgId: string, exceptUserId: string) {
  const [{ n }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(memberships)
    .where(
      and(
        eq(memberships.organizationId, orgId),
        eq(memberships.role, "owner"),
        eq(memberships.status, "active"),
        sql`${memberships.userId} <> ${exceptUserId}`,
      ),
    );
  if (n < 1) throw new AppError("CONFLICT", "An organization must keep at least one active owner");
}

export async function deactivateMember(db: DbOrTx, ctx: Ctx, userId: string) {
  const a = staff(ctx);
  requirePermission(a.role, "members.manage");
  return db.transaction(async (tx) => {
    const [m] = await tx
      .select()
      .from(memberships)
      .where(and(eq(memberships.organizationId, ctx.orgId), eq(memberships.userId, userId)))
      .for("update");
    if (!m) throw notFound("Member");
    if (m.role === "owner" && a.role !== "owner")
      throw new AppError("FORBIDDEN", "Only an owner can deactivate an owner");
    if (m.role === "owner") await assertAnotherOwner(tx, ctx.orgId, userId);
    await tx.update(memberships).set({ status: "inactive" }).where(eq(memberships.id, m.id));
    await tx
      .update(resolutionCases)
      .set({ assigneeUserId: null })
      .where(and(eq(resolutionCases.organizationId, ctx.orgId), eq(resolutionCases.assigneeUserId, userId)));
    await audit(tx, ctx, { action: "member.deactivate", targetType: "user", targetId: userId });
  });
}

export async function createInvitation(db: DbOrTx, ctx: Ctx, email: string, role: OrgRole, ttlHours = 72) {
  const a = staff(ctx);
  requirePermission(a.role, "members.manage");
  z.string().email().parse(email);
  if (!orgRole.enumValues.includes(role)) throw new AppError("VALIDATION", "Unknown role");
  if (role === "owner" && a.role !== "owner")
    throw new AppError("FORBIDDEN", "Only an owner can invite an owner");
  await assertEntitlement(db, ctx.orgId, "member");
  const token = randomToken(24);
  const [inv] = await db
    .insert(invitations)
    .values({
      organizationId: ctx.orgId,
      email: email.toLowerCase(),
      role,
      tokenHash: sha256Hex(token),
      expiresAt: new Date(Date.now() + ttlHours * 3_600_000),
      invitedBy: a.id,
    })
    .returning();
  await audit(db, ctx, {
    action: "invitation.create",
    targetType: "invitation",
    targetId: inv.id,
    metadata: { email: inv.email, role },
  });
  // The raw token is returned exactly once (shown as a copyable link). Only its hash is stored.
  return { invitation: inv, token };
}

export async function acceptInvitation(db: DbOrTx, token: string, user: { id: string; email: string }) {
  return db.transaction(async (tx) => {
    const [inv] = await tx
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, sha256Hex(token)))
      .for("update");
    if (!inv || inv.revokedAt || inv.acceptedAt)
      throw new AppError("NOT_FOUND", "This invitation is not valid");
    if (inv.expiresAt.getTime() < Date.now())
      throw new AppError("VALIDATION", "This invitation has expired. Ask for a new one.");
    if (inv.email.toLowerCase() !== user.email.toLowerCase())
      throw new AppError("FORBIDDEN", "This invitation was sent to a different email address");
    await tx
      .insert(memberships)
      .values({ organizationId: inv.organizationId, userId: user.id, role: inv.role })
      .onConflictDoNothing();
    await tx.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, inv.id));
    await audit(
      tx,
      { orgId: inv.organizationId, actor: { type: "operator", id: user.id, role: inv.role } },
      { action: "invitation.accept", targetType: "invitation", targetId: inv.id },
    );
    return inv;
  });
}

export async function listInvitations(db: DbOrTx, ctx: Ctx) {
  const a = staff(ctx);
  requirePermission(a.role, "members.manage");
  return db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
      revokedAt: invitations.revokedAt,
    })
    .from(invitations)
    .where(eq(invitations.organizationId, ctx.orgId))
    .orderBy(desc(invitations.createdAt));
}

// ------------------------------------------------------------------ API keys
export const API_SCOPES = ["egain:actions"] as const;
export async function createApiKey(db: DbOrTx, ctx: Ctx, name: string, scopes: string[]) {
  const a = staff(ctx);
  requirePermission(a.role, "apikeys.manage");
  await assertEntitlement(db, ctx.orgId, "apiAccess");
  if (!scopes.length || scopes.some((s) => !(API_SCOPES as readonly string[]).includes(s)))
    throw new AppError("VALIDATION", "Choose at least one valid scope");
  const secret = `oryk_${randomToken(32)}`;
  const [k] = await db
    .insert(apiKeys)
    .values({
      organizationId: ctx.orgId,
      name: name.trim().slice(0, 80),
      prefix: secret.slice(0, 10),
      keyHash: sha256Hex(secret),
      scopes,
      createdBy: a.id,
    })
    .returning();
  await audit(db, ctx, {
    action: "apikey.create",
    targetType: "api_key",
    targetId: k.id,
    metadata: { scopes },
  });
  return { key: { id: k.id, name: k.name, prefix: k.prefix, scopes: k.scopes }, secret }; // secret shown ONCE
}
export async function listApiKeys(db: DbOrTx, ctx: Ctx) {
  const a = staff(ctx);
  requirePermission(a.role, "apikeys.manage");
  return db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      scopes: apiKeys.scopes,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.organizationId, ctx.orgId))
    .orderBy(desc(apiKeys.createdAt));
}
export async function revokeApiKey(db: DbOrTx, ctx: Ctx, id: string) {
  const a = staff(ctx);
  requirePermission(a.role, "apikeys.manage");
  const [k] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.organizationId, ctx.orgId), isNull(apiKeys.revokedAt)))
    .returning();
  if (!k) throw notFound("API key");
  await audit(db, ctx, { action: "apikey.revoke", targetType: "api_key", targetId: id });
}
/** Resolve an `Authorization: Bearer` secret to its org + scopes. Constant-cost hash lookup. */
export async function authenticateApiKey(db: DbOrTx, secret: string | null | undefined, scope: string) {
  if (!secret || !secret.startsWith("oryk_"))
    throw new AppError("UNAUTHENTICATED", "Missing or invalid API key");
  const [k] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, sha256Hex(secret)), isNull(apiKeys.revokedAt)));
  if (!k) throw new AppError("UNAUTHENTICATED", "Missing or invalid API key");
  if (!k.scopes.includes(scope))
    throw new AppError("FORBIDDEN", "This API key does not have the required scope");
  await assertEntitlement(db, k.organizationId, "apiAccess");
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, k.id));
  return { orgId: k.organizationId, keyId: k.id };
}

// ------------------------------------------------------------------ integrations
export async function setSimulatorMode(db: DbOrTx, ctx: Ctx, mode: SimMode, delayMs = 400) {
  const a = staff(ctx);
  requirePermission(a.role, "integrations.manage");
  if (!SIM_MODES.includes(mode)) throw new AppError("VALIDATION", "Unknown simulator mode");
  const [c] = await db
    .update(integrationConnections)
    .set({ config: { mode, delayMs: Math.min(Math.max(delayMs, 0), 5000) } })
    .where(
      and(
        eq(integrationConnections.organizationId, ctx.orgId),
        eq(integrationConnections.provider, "demo_subscription"),
      ),
    )
    .returning();
  await audit(db, ctx, {
    action: "integration.configure",
    targetType: "integration",
    targetId: c.id,
    metadata: { mode },
  });
  return c;
}
export async function listIntegrations(db: DbOrTx, ctx: Ctx) {
  const a = staff(ctx);
  requirePermission(a.role, "integrations.manage");
  return db
    .select({
      id: integrationConnections.id,
      provider: integrationConnections.provider,
      name: integrationConnections.name,
      status: integrationConnections.status,
      config: integrationConnections.config,
    })
    .from(integrationConnections)
    .where(eq(integrationConnections.organizationId, ctx.orgId));
}

// ------------------------------------------------------------------ workflows (versioned authoring)
export async function listWorkflows(db: DbOrTx, ctx: Ctx) {
  const a = staff(ctx);
  requirePermission(a.role, "case.read");
  return db
    .select({ def: workflowDefinitions, v: workflowVersions })
    .from(workflowVersions)
    .innerJoin(workflowDefinitions, eq(workflowDefinitions.id, workflowVersions.definitionId))
    .where(eq(workflowVersions.organizationId, ctx.orgId))
    .orderBy(asc(workflowDefinitions.key), desc(workflowVersions.version));
}
/** Saves a new DRAFT version. The spec is fully validated (references, reachability, objectives) before it is stored. */
export async function saveWorkflowDraft(db: DbOrTx, ctx: Ctx, specRaw: unknown) {
  const a = staff(ctx);
  requirePermission(a.role, "workflow.write");
  const parsed = WorkflowSpecSchema.safeParse(specRaw);
  if (!parsed.success)
    throw new AppError(
      "VALIDATION",
      parsed.error.issues
        .map((i) => `${i.path.join(".") || "spec"}: ${i.message}`)
        .slice(0, 6)
        .join("; "),
    );
  const spec = parsed.data;
  return db.transaction(async (tx) => {
    let [def] = await tx
      .select()
      .from(workflowDefinitions)
      .where(and(eq(workflowDefinitions.organizationId, ctx.orgId), eq(workflowDefinitions.key, spec.key)));
    if (!def)
      [def] = await tx
        .insert(workflowDefinitions)
        .values({
          organizationId: ctx.orgId,
          key: spec.key,
          name: spec.name,
          category: spec.category,
          description: spec.description,
        })
        .returning();
    const [{ n }] = await tx
      .select({ n: sql<number>`coalesce(max(${workflowVersions.version}),0)::int` })
      .from(workflowVersions)
      .where(eq(workflowVersions.definitionId, def.id));
    const [v] = await tx
      .insert(workflowVersions)
      .values({
        organizationId: ctx.orgId,
        definitionId: def.id,
        version: n + 1,
        status: "DRAFT",
        spec: spec as unknown as Record<string, unknown>,
        createdBy: a.id,
      })
      .returning();
    await audit(tx, ctx, {
      action: "workflow.draft",
      targetType: "workflow_version",
      targetId: v.id,
      metadata: { key: spec.key, version: v.version },
    });
    return v;
  });
}
export async function publishWorkflowVersion(db: DbOrTx, ctx: Ctx, versionId: string) {
  const a = staff(ctx);
  requirePermission(a.role, "workflow.publish");
  return db.transaction(async (tx) => {
    const [v] = await tx
      .select()
      .from(workflowVersions)
      .where(and(eq(workflowVersions.id, versionId), eq(workflowVersions.organizationId, ctx.orgId)))
      .for("update");
    if (!v) throw notFound("Workflow version");
    if (v.status !== "DRAFT") throw new AppError("CONFLICT", `Version is ${v.status}`);
    if (v.createdBy === a.id)
      throw new AppError(
        "FORBIDDEN",
        "Separation of duties: the author cannot publish their own workflow version",
      );
    WorkflowSpecSchema.parse(v.spec); // re-validate at publish time
    await tx
      .update(workflowVersions)
      .set({ status: "ARCHIVED" })
      .where(
        and(eq(workflowVersions.definitionId, v.definitionId), eq(workflowVersions.status, "PUBLISHED")),
      );
    const [p] = await tx
      .update(workflowVersions)
      .set({ status: "PUBLISHED", publishedAt: new Date() })
      .where(eq(workflowVersions.id, v.id))
      .returning();
    await audit(tx, ctx, { action: "workflow.publish", targetType: "workflow_version", targetId: v.id });
    return p;
  });
}

// ------------------------------------------------------------------ audit viewer & export
export async function queryAudit(
  db: DbOrTx,
  ctx: Ctx,
  f: { action?: string; outcome?: string; limit?: number; offset?: number } = {},
) {
  const a = staff(ctx);
  requirePermission(a.role, "audit.read");
  const where = [eq(auditEvents.organizationId, ctx.orgId)];
  if (f.action) where.push(eq(auditEvents.action, f.action));
  if (f.outcome) where.push(eq(auditEvents.outcome, f.outcome));
  return db
    .select()
    .from(auditEvents)
    .where(and(...where))
    .orderBy(desc(auditEvents.createdAt))
    .limit(Math.min(f.limit ?? 100, 500))
    .offset(f.offset ?? 0);
}

/** JSON export of one organization's operational records. Excludes secrets, password hashes, file bodies. */
export async function exportOrganizationData(db: DbOrTx, ctx: Ctx) {
  const a = staff(ctx);
  requirePermission(a.role, "export.run");
  const o = ctx.orgId;
  const cases = await db.select().from(resolutionCases).where(eq(resolutionCases.organizationId, o));
  const objectives = await db.select().from(caseObjectives).where(eq(caseObjectives.organizationId, o));
  const events = await db.select().from(caseEvents).where(eq(caseEvents.organizationId, o));
  const ledger = await db.select().from(outcomeLedger).where(eq(outcomeLedger.organizationId, o));
  const custs = await db
    .select({
      id: customers.id,
      externalRef: customers.externalRef,
      name: customers.name,
      email: customers.email,
      synthetic: customers.synthetic,
    })
    .from(customers)
    .where(eq(customers.organizationId, o));
  await audit(db, ctx, {
    action: "export.run",
    targetType: "organization",
    targetId: o,
    metadata: { cases: cases.length },
  });
  return {
    exportedAt: new Date().toISOString(),
    organizationId: o,
    counts: { cases: cases.length, events: events.length, ledger: ledger.length, customers: custs.length },
    customers: custs,
    cases,
    objectives,
    events,
    ledger,
  };
}
