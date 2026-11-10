/**
 * Deterministic synthetic world used by the demo seed AND the integration tests.
 * Two organizations deliberately share account numbers / customer refs to prove tenant isolation.
 * Everything here is fictional and flagged `synthetic`.
 */
import { sql } from "drizzle-orm";
import type { Db } from "@/db";
import {
  customers,
  integrationConnections,
  memberships,
  organizations,
  plans,
  policyApprovals,
  policyDocuments,
  policyVersions,
  queues,
  simAccounts,
  simCancellationRequests,
  simCharges,
  subscriptions,
  users,
  accounts as authAccounts,
  workflowDefinitions,
  workflowVersions,
  type OrgRole,
} from "@/db/schema";
import { POLICY_PACK, SUPERSEDED_BILLING_V1 } from "@/policy/pack";
import { BUILTIN_WORKFLOWS } from "@/workflows/definitions";
import { sha256Hex } from "@/domain/crypto";

export const DEMO_PASSWORD = "OryloDemo!2026";
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

export async function resetAllTables(db: Db) {
  const { rows } = await db.execute(sql`select tablename from pg_tables where schemaname='public' and tablename not like '\\_\\_%' and tablename <> '__drizzle_migrations'`);
  const names = rows.map((r) => `"${(r as { tablename: string }).tablename}"`).join(", ");
  await db.execute(sql.raw(`truncate table ${names} restart identity cascade`));
}

export interface World {
  orgs: { nf: string; ke: string };
  users: Record<string, { id: string; email: string; role: OrgRole; orgId: string }>;
  customers: Record<string, { id: string; orgId: string; email: string; accountNumber?: string; userId?: string }>;
  policyVersions: Record<string, string>;
  workflowVersions: Record<string, string>;
}

type Opts = { withPasswords?: boolean };

export async function seedWorld(db: Db, opts: Opts = {}): Promise<World> {
  const w: World = { orgs: { nf: "", ke: "" }, users: {}, customers: {}, policyVersions: {}, workflowVersions: {} };
  const hash = opts.withPasswords ? (await import("better-auth/crypto")).hashPassword : null;

  // ---- plans (PROVISIONAL pricing experiments, not validated)
  const planRows = await db
    .insert(plans)
    .values([
      { key: "pilot", name: "Pilot (early access)", priceCentsMonthly: 0, entitlements: { maxOperators: 3, includedVerifiedOutcomes: 50, workflows: 1, apiAccess: false, customBranding: false } },
      { key: "team", name: "Team (experiment)", priceCentsMonthly: 49_000, entitlements: { maxOperators: 15, includedVerifiedOutcomes: 500, workflows: 5, apiAccess: true, customBranding: false } },
      { key: "scale", name: "Scale (experiment)", priceCentsMonthly: 149_000, entitlements: { maxOperators: 100, includedVerifiedOutcomes: 3000, workflows: 25, apiAccess: true, customBranding: true } },
    ])
    .returning();

  // ---- organizations
  const [nf, ke] = await db
    .insert(organizations)
    .values([
      { slug: "northfield", name: "Northfield Digital (synthetic)", synthetic: true, branding: { displayName: "Northfield Digital", supportEmail: "support@northfield.example" }, settings: { retentionDays: 365, approvalThresholdCents: 5000, emailNotifications: false, auditRetentionDays: 730 } },
      { slug: "kestrel", name: "Kestrel Broadband (synthetic)", synthetic: true, branding: { displayName: "Kestrel Broadband" }, settings: { retentionDays: 365, approvalThresholdCents: 10_000, emailNotifications: false, auditRetentionDays: 730 } },
    ])
    .returning();
  w.orgs = { nf: nf.id, ke: ke.id };
  for (const o of [nf, ke]) {
    // Northfield trials the Team plan (so the seeded 7-person team + API keys are entitled); Kestrel is on the free Pilot.
    await db.insert(subscriptions).values({ organizationId: o.id, planId: (o.id === nf.id ? planRows[1] : planRows[0]).id, status: "trialing", trialEndsAt: new Date(Date.now() + 30 * DAY), currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * DAY) });
    await db.insert(integrationConnections).values([
      { organizationId: o.id, provider: "demo_subscription", name: "Demo subscription provider (simulator)", config: { mode: "normal", delayMs: 400 } },
      { organizationId: o.id, provider: "egain", name: "eGain (action API caller)", status: "inactive", config: { note: "Live eGain agent is configured on eGain's platform; Orylo exposes the action API." } },
      { organizationId: o.id, provider: "email", name: "Email provider (not configured)", status: "inactive", config: {} },
    ]);
    await db.insert(queues).values([
      { organizationId: o.id, key: "escalations", name: "General escalations", description: "Cases a person must look at" },
      { organizationId: o.id, key: "field-scheduling", name: "Field scheduling", description: "Appointment rescheduling requests" },
      { organizationId: o.id, key: "claims-review", name: "Claims review", description: "Warranty claim packets" },
    ]);
  }

  // ---- users
  const mkUser = async (key: string, name: string, email: string, orgId: string | null, role: OrgRole | null) => {
    const id = `usr_${sha256Hex(email).slice(0, 20)}`;
    await db.insert(users).values({ id, name, email, emailVerified: true });
    if (hash) await db.insert(authAccounts).values({ id: `acc_${id}`, accountId: id, providerId: "credential", userId: id, password: await hash(DEMO_PASSWORD) });
    if (orgId && role) await db.insert(memberships).values({ organizationId: orgId, userId: id, role });
    w.users[key] = { id, email, role: role ?? ("operator" as OrgRole), orgId: orgId ?? "" };
  };
  await mkUser("nfOwner", "Olivia Park", "owner@northfield.example", nf.id, "owner");
  await mkUser("nfAdmin", "Adam Cole", "admin@northfield.example", nf.id, "admin");
  await mkUser("nfOperator", "Ana Ortiz", "ana@northfield.example", nf.id, "operator");
  await mkUser("nfOperator2", "Tomas Weber", "tomas@northfield.example", nf.id, "operator");
  await mkUser("nfApprover", "Ben Lindqvist", "ben@northfield.example", nf.id, "approver");
  await mkUser("nfPolicy", "Cara Mensah", "cara@northfield.example", nf.id, "policy_manager");
  await mkUser("nfAnalyst", "Dev Rao", "dev@northfield.example", nf.id, "analyst");
  await mkUser("keOwner", "Kira Voss", "owner@kestrel.example", ke.id, "owner");
  await mkUser("keOperator", "Ivo Marek", "ivo@kestrel.example", ke.id, "operator");

  // ---- customers + synthetic provider accounts (NF-100234 exists in BOTH orgs, for different people)
  const mkCustomer = async (key: string, orgId: string, ref: string, name: string, email: string, acct: { no: string; plan: string; priceCents: number; status: "ACTIVE" | "CANCELLED"; cancelledDaysAgo?: number } | null, withLogin = false) => {
    let userId: string | undefined;
    if (withLogin) {
      userId = `usr_${sha256Hex(email).slice(0, 20)}`;
      await db.insert(users).values({ id: userId, name, email, emailVerified: true });
      if (hash) await db.insert(authAccounts).values({ id: `acc_${userId}`, accountId: userId, providerId: "credential", userId, password: await hash(DEMO_PASSWORD) });
    }
    const [c] = await db.insert(customers).values({ organizationId: orgId, externalRef: ref, name, email, userId, synthetic: true }).returning();
    w.customers[key] = { id: c.id, orgId, email, accountNumber: acct?.no, userId };
    if (acct) {
      const [a] = await db
        .insert(simAccounts)
        .values({ organizationId: orgId, accountNumber: acct.no, customerId: c.id, planName: acct.plan, priceCents: acct.priceCents, status: acct.status, billingActive: acct.status === "ACTIVE", nextBillingAt: acct.status === "ACTIVE" ? new Date(Date.now() + 20 * DAY) : null, cancelledAt: acct.cancelledDaysAgo ? ago(acct.cancelledDaysAgo) : null })
        .returning();
      return a;
    }
  };

  // Jordan (NF): the canonical Failed Cancellation story. Cancelled 9 days ago (never applied), charged 3 days ago.
  const jordan = await mkCustomer("jordan", nf.id, "CUST-5001", "Jordan Reyes", "jordan.reyes@customer.example", { no: "NF-100234", plan: "Northfield Plus", priceCents: 2999, status: "ACTIVE" }, true);
  await db.insert(simCancellationRequests).values({ organizationId: nf.id, accountId: jordan!.id, requestedAt: ago(9), channel: "web_form", status: "FAILED_TO_APPLY", note: "Received but not applied (provider sync error)" });
  await db.insert(simCharges).values([
    { organizationId: nf.id, accountId: jordan!.id, amountCents: 2999, description: "Northfield Plus — monthly", chargedAt: ago(33), status: "POSTED" },
    { organizationId: nf.id, accountId: jordan!.id, amountCents: 2999, description: "Northfield Plus — monthly", chargedAt: ago(3), status: "POSTED" },
  ]);
  // Priya (NF): higher-value charge → operator approval path.
  const priya = await mkCustomer("priya", nf.id, "CUST-5002", "Priya Nair", "priya.nair@customer.example", { no: "NF-100777", plan: "Northfield Premier", priceCents: 14_900, status: "ACTIVE" }, true);
  await db.insert(simCancellationRequests).values({ organizationId: nf.id, accountId: priya!.id, requestedAt: ago(12), channel: "chat", status: "FAILED_TO_APPLY" });
  await db.insert(simCharges).values({ organizationId: nf.id, accountId: priya!.id, amountCents: 14_900, description: "Northfield Premier — monthly", chargedAt: ago(5), status: "POSTED" });
  // Marcus (NF): already cancelled, but charged afterwards → review only.
  const marcus = await mkCustomer("marcus", nf.id, "CUST-5003", "Marcus Bell", "marcus.bell@customer.example", { no: "NF-100555", plan: "Northfield Basic", priceCents: 999, status: "CANCELLED", cancelledDaysAgo: 20 }, true);
  await db.insert(simCharges).values({ organizationId: nf.id, accountId: marcus!.id, amountCents: 999, description: "Northfield Basic — monthly", chargedAt: ago(4), status: "POSTED" });
  // Elena (NF): active, never asked to cancel → no permitted automatic action → escalate.
  const elena = await mkCustomer("elena", nf.id, "CUST-5004", "Elena Rossi", "elena.rossi@customer.example", { no: "NF-100900", plan: "Northfield Plus", priceCents: 2999, status: "ACTIVE" }, true);
  await db.insert(simCharges).values({ organizationId: nf.id, accountId: elena!.id, amountCents: 2999, description: "Northfield Plus — monthly", chargedAt: ago(2), status: "POSTED" });
  await mkCustomer("sam", nf.id, "CUST-5005", "Sam Okafor", "sam.okafor@customer.example", null, true);

  // Kestrel: SAME account number and similar customer ref, different person, different org.
  const kJordan = await mkCustomer("keJordan", ke.id, "CUST-5001", "Jordan Reyes (Kestrel)", "jreyes@kestrel-customer.example", { no: "NF-100234", plan: "Kestrel Fibre 300", priceCents: 5999, status: "ACTIVE" }, true);
  await db.insert(simCancellationRequests).values({ organizationId: ke.id, accountId: kJordan!.id, requestedAt: ago(6), channel: "phone", status: "FAILED_TO_APPLY" });
  await db.insert(simCharges).values({ organizationId: ke.id, accountId: kJordan!.id, amountCents: 5999, description: "Kestrel Fibre 300 — monthly", chargedAt: ago(2), status: "POSTED" });

  // ---- policy (APPROVED by seed — a fixture; runtime approval enforces separation of duties)
  for (const org of [nf, ke]) {
    for (const d of POLICY_PACK) {
      const [doc] = await db.insert(policyDocuments).values({ organizationId: org.id, key: d.key, title: d.title, ownerName: d.owner }).returning();
      if (d.key === "billing-policy") {
        const [v1] = await db.insert(policyVersions).values({ organizationId: org.id, documentId: doc.id, version: 1, status: "SUPERSEDED", body: SUPERSEDED_BILLING_V1.body, rules: SUPERSEDED_BILLING_V1.rules, topics: d.topics, contentSha256: sha256Hex(SUPERSEDED_BILLING_V1.body), effectiveFrom: ago(400), effectiveTo: ago(200), approvedBy: w.users.nfApprover.id, approvedAt: ago(400), createdBy: w.users.nfPolicy.id }).returning();
        if (org.id === nf.id) w.policyVersions["billing-policy:v1"] = v1.id;
      }
      const [v] = await db
        .insert(policyVersions)
        .values({ organizationId: org.id, documentId: doc.id, version: d.key === "billing-policy" ? 2 : 1, status: "APPROVED", body: d.body, rules: d.rules, topics: d.topics, contentSha256: sha256Hex(d.body), effectiveFrom: ago(200), approvedBy: (org.id === nf.id ? w.users.nfApprover : w.users.keOwner).id, approvedAt: ago(200), createdBy: (org.id === nf.id ? w.users.nfPolicy : w.users.keOwner).id })
        .returning();
      await db.insert(policyApprovals).values({ organizationId: org.id, policyVersionId: v.id, approverUserId: (org.id === nf.id ? w.users.nfApprover : w.users.keOwner).id, decision: "APPROVED", comment: "Seed fixture approval" });
      if (org.id === nf.id) w.policyVersions[d.key] = v.id;
    }
    for (const spec of BUILTIN_WORKFLOWS) {
      const [def] = await db.insert(workflowDefinitions).values({ organizationId: org.id, key: spec.key, name: spec.name, category: spec.category, description: spec.description }).returning();
      const [ver] = await db.insert(workflowVersions).values({ organizationId: org.id, definitionId: def.id, version: 1, status: "PUBLISHED", spec: spec as unknown as Record<string, unknown>, publishedAt: new Date(), createdBy: "seed" }).returning();
      if (org.id === nf.id) w.workflowVersions[spec.key] = ver.id;
    }
  }
  return w;
}
