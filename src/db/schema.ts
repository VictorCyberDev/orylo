/**
 * Orylo database schema (PostgreSQL via Drizzle).
 *
 * Tenancy: every business table carries `organization_id`. Parent/child relations that must stay
 * inside one tenant use COMPOSITE foreign keys (child.org_id + child.parent_id -> parent.org_id +
 * parent.id), so the database itself refuses a cross-tenant link even if application code is wrong.
 *
 * Append-only: case_events, audit_events and outcome_ledger have UPDATE/DELETE blocked by triggers
 * (see drizzle/*_append_only_triggers.sql).
 *
 * Tables prefixed `sim_` are the SYNTHETIC "external subscription provider" used by the demo adapter.
 * They exist so the Action Gateway has a real, independently-readable system to mutate and verify.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  bigint,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

const pk = () => uuid("id").primaryKey().defaultRandom();
const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts("created_at").notNull().defaultNow();
const orgId = () => uuid("organization_id").notNull();

// ---------------------------------------------------------------- enums
export const orgRole = pgEnum("org_role", [
  "owner",
  "admin",
  "policy_manager",
  "operator",
  "approver",
  "analyst",
]);
export const caseState = pgEnum("case_state", [
  "OPEN",
  "INVESTIGATING",
  "AWAITING_CUSTOMER_INFORMATION",
  "READY_FOR_ACTION",
  "AWAITING_APPROVAL",
  "ACTION_PENDING",
  "ACTION_EXECUTED",
  "OUTCOME_PENDING_VERIFICATION",
  "VERIFIED_RESOLVED",
  "BLOCKED",
  "ESCALATED",
  "FAILED",
  "CANCELLED",
  "REOPENED",
]);
export const priority = pgEnum("priority", ["low", "normal", "high", "urgent"]);
export const objectiveStatus = pgEnum("objective_status", [
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
  "VERIFIED",
  "BLOCKED",
  "NOT_APPLICABLE",
]);
export const actorType = pgEnum("actor_type", ["customer", "operator", "system", "integration", "channel"]);
export const actionStatus = pgEnum("action_status", [
  "REQUESTED",
  "AWAITING_CONSENT",
  "AWAITING_APPROVAL",
  "APPROVED",
  "EXECUTING",
  "SUCCEEDED",
  "FAILED",
  "DENIED",
  "CANCELLED",
]);
export const policyStatus = pgEnum("policy_status", [
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "SUPERSEDED",
  "RETIRED",
]);
export const escalationStatus = pgEnum("escalation_status", [
  "OPEN",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "RESOLVED",
  "RETURNED_TO_AUTOMATION",
  "CANCELLED",
]);
export const workflowVersionStatus = pgEnum("workflow_version_status", ["DRAFT", "PUBLISHED", "ARCHIVED"]);
export const executionStatus = pgEnum("execution_status", [
  "RUNNING",
  "WAITING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

// ---------------------------------------------------------------- identity (Better Auth tables)
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------- tenancy
export const organizations = pgTable("organizations", {
  id: pk(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  /** Organization-level branding overrides (display name, accent). Never secrets. */
  branding: jsonb("branding")
    .$type<{ displayName?: string; accent?: string; supportEmail?: string }>()
    .notNull()
    .default({}),
  /** Retention + notification + approval thresholds. */
  settings: jsonb("settings")
    .$type<{
      retentionDays: number;
      approvalThresholdCents: number;
      emailNotifications: boolean;
      auditRetentionDays: number;
    }>()
    .notNull()
    .default({
      retentionDays: 365,
      approvalThresholdCents: 5000,
      emailNotifications: false,
      auditRetentionDays: 730,
    }),
  /** True for fixtures created by the seed. Surfaced in the UI. */
  synthetic: boolean("synthetic").notNull().default(false),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: orgRole("role").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("memberships_org_user_uq").on(t.organizationId, t.userId),
    index("memberships_user_idx").on(t.userId),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: orgRole("role").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: ts("expires_at").notNull(),
    acceptedAt: ts("accepted_at"),
    revokedAt: ts("revoked_at"),
    invitedBy: text("invited_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("invitations_org_idx").on(t.organizationId)],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    scopes: text("scopes")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    lastUsedAt: ts("last_used_at"),
    revokedAt: ts("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [index("api_keys_org_idx").on(t.organizationId)],
);

export const queues = pgTable(
  "queues",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** Simple declarative rules, e.g. {"escalateAfterHours": 48}. */
    rules: jsonb("rules").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    unique("queues_org_key_uq").on(t.organizationId, t.key),
    unique("queues_id_org_uq").on(t.id, t.organizationId),
  ],
);

// ---------------------------------------------------------------- customers
export const customers = pgTable(
  "customers",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    externalRef: text("external_ref").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    /** Optional portal login. Customers are NOT org members; they only ever see their own cases. */
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    synthetic: boolean("synthetic").notNull().default(true),
    preferences: jsonb("preferences")
      .$type<{ notifyEmail: boolean; notifyInApp: boolean }>()
      .notNull()
      .default({ notifyEmail: false, notifyInApp: true }),
    /** Set when the customer's personal data was erased on request (profile anonymized, uploads deleted). */
    anonymizedAt: ts("anonymized_at"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("customers_org_ext_uq").on(t.organizationId, t.externalRef),
    unique("customers_id_org_uq").on(t.id, t.organizationId),
    index("customers_user_idx").on(t.userId),
    index("customers_email_idx").on(t.organizationId, t.email),
  ],
);

// ---------------------------------------------------------------- policy & knowledge
export const policyDocuments = pgTable(
  "policy_documents",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    title: text("title").notNull(),
    ownerName: text("owner_name").notNull(),
    /** Authorized-source label shown beside every citation. */
    sourceLabel: text("source_label").notNull().default("Internal policy (synthetic)"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("policy_docs_org_key_uq").on(t.organizationId, t.key),
    unique("policy_docs_id_org_uq").on(t.id, t.organizationId),
  ],
);

export const policyVersions = pgTable(
  "policy_versions",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").notNull(),
    version: integer("version").notNull(),
    status: policyStatus("status").notNull().default("DRAFT"),
    effectiveFrom: ts("effective_from"),
    effectiveTo: ts("effective_to"),
    /** Markdown body; sections are `## Heading` blocks. Treated strictly as DATA. */
    body: text("body").notNull(),
    /**
     * Machine-readable rules (authoritative for authorization). Action decisions NEVER read `body`;
     * they read only rules from an APPROVED, effective version. This is the structural defence
     * against prompt injection via knowledge content.
     */
    rules: jsonb("rules").$type<Record<string, string | number | boolean>>().notNull().default({}),
    topics: text("topics")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    contentSha256: text("content_sha256").notNull(),
    supersedesId: uuid("supersedes_id"),
    /** Sections quarantined by the injection scanner (indices into the section list). */
    quarantinedSections: jsonb("quarantined_sections").$type<number[]>().notNull().default([]),
    createdBy: text("created_by"),
    approvedBy: text("approved_by"),
    approvedAt: ts("approved_at"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.documentId, t.organizationId],
      foreignColumns: [policyDocuments.id, policyDocuments.organizationId],
    }),
    unique("policy_versions_doc_ver_uq").on(t.documentId, t.version),
    unique("policy_versions_id_org_uq").on(t.id, t.organizationId),
    // Only ONE approved version may be live per document.
    uniqueIndex("policy_versions_one_approved_uq")
      .on(t.documentId)
      .where(sql`${t.status} = 'APPROVED'`),
    index("policy_versions_org_status_idx").on(t.organizationId, t.status),
  ],
);

export const policyApprovals = pgTable(
  "policy_approvals",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    policyVersionId: uuid("policy_version_id").notNull(),
    approverUserId: text("approver_user_id").notNull(),
    decision: text("decision").notNull(), // APPROVED | REJECTED | CHANGES_REQUESTED
    comment: text("comment"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.policyVersionId, t.organizationId],
      foreignColumns: [policyVersions.id, policyVersions.organizationId],
    }),
  ],
);

export const knowledgeGaps = pgTable(
  "knowledge_gaps",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    query: text("query").notNull(),
    reason: text("reason").notNull(), // NO_AUTHORITY | CONFLICT | INJECTION_QUARANTINE
    occurrences: integer("occurrences").notNull().default(1),
    status: text("status").notNull().default("OPEN"),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [unique("knowledge_gaps_org_query_uq").on(t.organizationId, t.query)],
);

// ---------------------------------------------------------------- workflows
export const workflowDefinitions = pgTable(
  "workflow_definitions",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    description: text("description"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("wf_def_org_key_uq").on(t.organizationId, t.key),
    unique("wf_def_id_org_uq").on(t.id, t.organizationId),
  ],
);

export const workflowVersions = pgTable(
  "workflow_versions",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    definitionId: uuid("definition_id").notNull(),
    version: integer("version").notNull(),
    status: workflowVersionStatus("status").notNull().default("DRAFT"),
    /** Validated against WorkflowSpecSchema (src/workflows/spec.ts) on every write. */
    spec: jsonb("spec").$type<Record<string, unknown>>().notNull(),
    createdBy: text("created_by"),
    publishedAt: ts("published_at"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.definitionId, t.organizationId],
      foreignColumns: [workflowDefinitions.id, workflowDefinitions.organizationId],
    }),
    unique("wf_ver_def_ver_uq").on(t.definitionId, t.version),
    unique("wf_ver_id_org_uq").on(t.id, t.organizationId),
    uniqueIndex("wf_ver_one_published_uq")
      .on(t.definitionId)
      .where(sql`${t.status} = 'PUBLISHED'`),
  ],
);

// ---------------------------------------------------------------- cases
export const resolutionCases = pgTable(
  "resolution_cases",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    reference: text("reference").notNull(),
    customerId: uuid("customer_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    category: text("category").notNull(),
    state: caseState("state").notNull().default("OPEN"),
    priority: priority("priority").notNull().default("normal"),
    assigneeUserId: text("assignee_user_id").references(() => users.id, { onDelete: "set null" }),
    queueId: uuid("queue_id"),
    workflowVersionId: uuid("workflow_version_id"),
    source: text("source").notNull().default("portal"), // portal | egain | operator
    /** Optimistic concurrency token; bumped on every state transition. */
    version: integer("version").notNull().default(1),
    reopenCount: integer("reopen_count").notNull().default(0),
    synthetic: boolean("synthetic").notNull().default(true),
    openedAt: ts("opened_at").notNull().defaultNow(),
    firstActionAt: ts("first_action_at"),
    closedAt: ts("closed_at"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("cases_org_ref_uq").on(t.organizationId, t.reference),
    unique("cases_id_org_uq").on(t.id, t.organizationId),
    foreignKey({
      columns: [t.customerId, t.organizationId],
      foreignColumns: [customers.id, customers.organizationId],
    }),
    foreignKey({
      columns: [t.queueId, t.organizationId],
      foreignColumns: [queues.id, queues.organizationId],
    }),
    foreignKey({
      columns: [t.workflowVersionId, t.organizationId],
      foreignColumns: [workflowVersions.id, workflowVersions.organizationId],
    }),
    index("cases_org_state_idx").on(t.organizationId, t.state),
    index("cases_customer_idx").on(t.customerId),
    index("cases_assignee_idx").on(t.organizationId, t.assigneeUserId),
    index("cases_org_updated_idx").on(t.organizationId, t.updatedAt),
  ],
);

/** Independently tracked objectives. There is deliberately no `resolved` boolean on the case. */
export const caseObjectives = pgTable(
  "case_objectives",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    caseId: uuid("case_id").notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    required: boolean("required").notNull().default(true),
    status: objectiveStatus("status").notNull().default("PENDING"),
    detail: text("detail"),
    verifiedAt: ts("verified_at"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.caseId, t.organizationId],
      foreignColumns: [resolutionCases.id, resolutionCases.organizationId],
    }).onDelete("cascade"),
    unique("case_objectives_case_key_uq").on(t.caseId, t.key),
    unique("case_objectives_id_org_uq").on(t.id, t.organizationId),
  ],
);

export const caseEvents = pgTable(
  "case_events",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    caseId: uuid("case_id").notNull(),
    seq: integer("seq").notNull(),
    type: text("type").notNull(),
    actorType: actorType("actor_type").notNull(),
    actorId: text("actor_id"),
    fromState: caseState("from_state"),
    toState: caseState("to_state"),
    /** Customer-visible text, if any. Internal notes carry visibility = 'internal'. */
    visibility: text("visibility").notNull().default("customer"),
    message: text("message"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.caseId, t.organizationId],
      foreignColumns: [resolutionCases.id, resolutionCases.organizationId],
    }),
    unique("case_events_case_seq_uq").on(t.caseId, t.seq),
    index("case_events_case_idx").on(t.caseId, t.seq),
  ],
);

export const caseEvidence = pgTable(
  "case_evidence",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    caseId: uuid("case_id").notNull(),
    uploadedByType: actorType("uploaded_by_type").notNull(),
    uploadedById: text("uploaded_by_id"),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    note: text("note"),
    content: bytea("content").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.caseId, t.organizationId],
      foreignColumns: [resolutionCases.id, resolutionCases.organizationId],
    }),
  ],
);

export const customerAccessGrants = pgTable(
  "customer_access_grants",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").notNull(),
    caseId: uuid("case_id"),
    tokenHash: text("token_hash").notNull().unique(),
    scopes: text("scopes")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    issuedVia: text("issued_via").notNull(), // operator | egain | portal
    expiresAt: ts("expires_at").notNull(),
    revokedAt: ts("revoked_at"),
    lastUsedAt: ts("last_used_at"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.customerId, t.organizationId],
      foreignColumns: [customers.id, customers.organizationId],
    }),
    foreignKey({
      columns: [t.caseId, t.organizationId],
      foreignColumns: [resolutionCases.id, resolutionCases.organizationId],
    }),
  ],
);

export const assignments = pgTable(
  "assignments",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    caseId: uuid("case_id").notNull(),
    assigneeUserId: text("assignee_user_id").references(() => users.id, { onDelete: "set null" }),
    queueId: uuid("queue_id"),
    assignedBy: text("assigned_by"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.caseId, t.organizationId],
      foreignColumns: [resolutionCases.id, resolutionCases.organizationId],
    }),
    foreignKey({
      columns: [t.queueId, t.organizationId],
      foreignColumns: [queues.id, queues.organizationId],
    }),
    uniqueIndex("assignments_one_active_uq")
      .on(t.caseId)
      .where(sql`${t.active} = true`),
  ],
);

// ---------------------------------------------------------------- workflow execution
export const workflowExecutions = pgTable(
  "workflow_executions",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    caseId: uuid("case_id").notNull(),
    workflowVersionId: uuid("workflow_version_id").notNull(),
    status: executionStatus("status").notNull().default("RUNNING"),
    currentNode: text("current_node"),
    context: jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
    version: integer("version").notNull().default(1),
    startedAt: ts("started_at").notNull().defaultNow(),
    completedAt: ts("completed_at"),
  },
  (t) => [
    foreignKey({
      columns: [t.caseId, t.organizationId],
      foreignColumns: [resolutionCases.id, resolutionCases.organizationId],
    }),
    foreignKey({
      columns: [t.workflowVersionId, t.organizationId],
      foreignColumns: [workflowVersions.id, workflowVersions.organizationId],
    }),
    unique("wf_exec_id_org_uq").on(t.id, t.organizationId),
    // At most one live execution per case.
    uniqueIndex("wf_exec_one_live_uq")
      .on(t.caseId)
      .where(sql`${t.status} in ('RUNNING','WAITING')`),
  ],
);

export const workflowStepExecutions = pgTable(
  "workflow_step_executions",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    executionId: uuid("execution_id").notNull(),
    nodeId: text("node_id").notNull(),
    nodeType: text("node_type").notNull(),
    status: text("status").notNull(), // COMPLETED | WAITING | FAILED | SKIPPED
    attempt: integer("attempt").notNull().default(1),
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
    output: jsonb("output").$type<Record<string, unknown>>().notNull().default({}),
    error: text("error"),
    startedAt: ts("started_at").notNull().defaultNow(),
    finishedAt: ts("finished_at"),
  },
  (t) => [
    foreignKey({
      columns: [t.executionId, t.organizationId],
      foreignColumns: [workflowExecutions.id, workflowExecutions.organizationId],
    }),
    index("wf_step_exec_idx").on(t.executionId),
  ],
);

// ---------------------------------------------------------------- actions
export const actionRequests = pgTable(
  "action_requests",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    caseId: uuid("case_id").notNull(),
    customerId: uuid("customer_id").notNull(),
    operation: text("operation").notNull(),
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
    idempotencyKey: text("idempotency_key").notNull(),
    status: actionStatus("status").notNull().default("REQUESTED"),
    requestedByType: actorType("requested_by_type").notNull(),
    requestedById: text("requested_by_id"),
    policyVersionId: uuid("policy_version_id"),
    /** Hash of the resource state the consent/approval was granted against (stale-state guard). */
    expectedStateHash: text("expected_state_hash"),
    amountCents: integer("amount_cents"),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.caseId, t.organizationId],
      foreignColumns: [resolutionCases.id, resolutionCases.organizationId],
    }),
    foreignKey({
      columns: [t.customerId, t.organizationId],
      foreignColumns: [customers.id, customers.organizationId],
    }),
    foreignKey({
      columns: [t.policyVersionId, t.organizationId],
      foreignColumns: [policyVersions.id, policyVersions.organizationId],
    }),
    unique("action_requests_org_idem_uq").on(t.organizationId, t.idempotencyKey),
    unique("action_requests_id_org_uq").on(t.id, t.organizationId),
    index("action_requests_case_idx").on(t.caseId),
  ],
);

export const actionApprovals = pgTable(
  "action_approvals",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    actionRequestId: uuid("action_request_id").notNull(),
    approverType: actorType("approver_type").notNull(), // customer = consent; operator = approval
    approverId: text("approver_id").notNull(),
    decision: text("decision").notNull(), // GRANTED | DECLINED
    /** Exact consent wording shown to the customer (so consent is auditable). */
    consentText: text("consent_text"),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.actionRequestId, t.organizationId],
      foreignColumns: [actionRequests.id, actionRequests.organizationId],
    }),
    index("action_approvals_req_idx").on(t.actionRequestId),
  ],
);

export const actionAttempts = pgTable(
  "action_attempts",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    actionRequestId: uuid("action_request_id").notNull(),
    attemptNo: integer("attempt_no").notNull(),
    status: text("status").notNull(), // STARTED | SUCCEEDED | FAILED | TIMEOUT
    adapter: text("adapter").notNull(),
    request: jsonb("request").$type<Record<string, unknown>>().notNull().default({}),
    response: jsonb("response").$type<Record<string, unknown>>().notNull().default({}),
    errorCode: text("error_code"),
    externalRef: text("external_ref"),
    startedAt: ts("started_at").notNull().defaultNow(),
    finishedAt: ts("finished_at"),
  },
  (t) => [
    foreignKey({
      columns: [t.actionRequestId, t.organizationId],
      foreignColumns: [actionRequests.id, actionRequests.organizationId],
    }),
    unique("action_attempts_req_no_uq").on(t.actionRequestId, t.attemptNo),
  ],
);

export const actionReceipts = pgTable(
  "action_receipts",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    actionRequestId: uuid("action_request_id").notNull(),
    receiptNo: text("receipt_no").notNull(),
    operation: text("operation").notNull(),
    externalRef: text("external_ref"),
    /** Customer-safe result summary (no secrets, no unrelated customer data). */
    result: jsonb("result").$type<Record<string, unknown>>().notNull().default({}),
    /** HMAC-SHA256 over the canonical receipt body; verifiable with verifyReceipt(). */
    signature: text("signature").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.actionRequestId, t.organizationId],
      foreignColumns: [actionRequests.id, actionRequests.organizationId],
    }),
    unique("action_receipts_req_uq").on(t.actionRequestId),
    unique("action_receipts_no_uq").on(t.receiptNo),
  ],
);

// ---------------------------------------------------------------- outcome ledger (append-only, hash chained per org)
export const outcomeLedger = pgTable(
  "outcome_ledger",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    caseId: uuid("case_id").notNull(),
    objectiveKey: text("objective_key"),
    requestedOutcome: text("requested_outcome").notNull(),
    actionAttempted: text("action_attempted"),
    executor: text("executor").notNull(),
    authorizationRef: text("authorization_ref"),
    policyVersionId: uuid("policy_version_id"),
    externalOperationRef: text("external_operation_ref"),
    executionResult: text("execution_result").notNull(), // SUCCEEDED | FAILED | NOT_EXECUTED
    verificationMethod: text("verification_method"), // e.g. read_after_write
    verifiedAt: ts("verified_at"),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
    finalOutcome: text("final_outcome").notNull(), // VERIFIED | UNVERIFIED | FAILED | PENDING
    remainingObjectives: jsonb("remaining_objectives").$type<string[]>().notNull().default([]),
    prevHash: text("prev_hash").notNull(),
    entryHash: text("entry_hash").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.caseId, t.organizationId],
      foreignColumns: [resolutionCases.id, resolutionCases.organizationId],
    }),
    unique("ledger_org_seq_uq").on(t.organizationId, t.seq),
    unique("ledger_id_org_uq").on(t.id, t.organizationId),
    index("ledger_case_idx").on(t.caseId),
  ],
);

// ---------------------------------------------------------------- escalation
export const escalations = pgTable(
  "escalations",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    caseId: uuid("case_id").notNull(),
    reason: text("reason").notNull(),
    reasonCode: text("reason_code").notNull(),
    status: escalationStatus("status").notNull().default("OPEN"),
    queueId: uuid("queue_id"),
    ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    channel: text("channel").notNull().default("queue"), // queue | callback_request | email_request
    /** Frozen copy of what was known when escalated (objectives, failed steps, last attempts). */
    contextSnapshot: jsonb("context_snapshot").$type<Record<string, unknown>>().notNull().default({}),
    createdByType: actorType("created_by_type").notNull(),
    createdById: text("created_by_id"),
    resolutionNote: text("resolution_note"),
    resolvedAt: ts("resolved_at"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.caseId, t.organizationId],
      foreignColumns: [resolutionCases.id, resolutionCases.organizationId],
    }),
    foreignKey({
      columns: [t.queueId, t.organizationId],
      foreignColumns: [queues.id, queues.organizationId],
    }),
    index("escalations_org_status_idx").on(t.organizationId, t.status),
    index("escalations_case_idx").on(t.caseId),
  ],
);

// ---------------------------------------------------------------- notifications
export const notifications = pgTable(
  "notifications",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    recipientUserId: text("recipient_user_id").references(() => users.id, { onDelete: "cascade" }),
    recipientCustomerId: uuid("recipient_customer_id"),
    caseId: uuid("case_id"),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    channel: text("channel").notNull().default("in_app"), // in_app | email
    /** PENDING | DELIVERED | SKIPPED | FAILED — email is SKIPPED unless a provider is configured. */
    deliveryStatus: text("delivery_status").notNull().default("DELIVERED"),
    deliveryDetail: text("delivery_detail"),
    readAt: ts("read_at"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.recipientCustomerId, t.organizationId],
      foreignColumns: [customers.id, customers.organizationId],
    }),
    foreignKey({
      columns: [t.caseId, t.organizationId],
      foreignColumns: [resolutionCases.id, resolutionCases.organizationId],
    }),
    index("notifications_user_idx").on(t.recipientUserId, t.readAt),
    index("notifications_customer_idx").on(t.recipientCustomerId, t.readAt),
  ],
);

// ---------------------------------------------------------------- integrations
export const integrationConnections = pgTable(
  "integration_connections",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // demo_subscription | egain | email
    name: text("name").notNull(),
    status: text("status").notNull().default("active"),
    /** Non-secret configuration only (e.g. simulator mode). Secrets live in env / a vault, referenced by name. */
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    secretRef: text("secret_ref"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("integration_org_provider_uq").on(t.organizationId, t.provider),
    unique("integration_id_org_uq").on(t.id, t.organizationId),
  ],
);

export const integrationEvents = pgTable(
  "integration_events",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id"),
    direction: text("direction").notNull(), // outbound | inbound
    type: text("type").notNull(),
    status: text("status").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.connectionId, t.organizationId],
      foreignColumns: [integrationConnections.id, integrationConnections.organizationId],
    }),
    index("integration_events_org_idx").on(t.organizationId, t.createdAt),
  ],
);

// ---------------------------------------------------------------- audit (append-only)
export const auditEvents = pgTable(
  "audit_events",
  {
    id: pk(),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    actorType: actorType("actor_type").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    outcome: text("outcome").notNull().default("success"), // success | denied | error
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    requestId: text("request_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_org_time_idx").on(t.organizationId, t.createdAt),
    index("audit_target_idx").on(t.targetType, t.targetId),
  ],
);

// ---------------------------------------------------------------- commercial
export const plans = pgTable("plans", {
  id: pk(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  priceCentsMonthly: integer("price_cents_monthly").notNull(),
  /** PROVISIONAL pricing experiment — not validated willingness to pay. */
  experimental: boolean("experimental").notNull().default(true),
  entitlements: jsonb("entitlements")
    .$type<{
      maxOperators: number;
      includedVerifiedOutcomes: number;
      workflows: number;
      apiAccess: boolean;
      customBranding: boolean;
    }>()
    .notNull(),
  createdAt: createdAt(),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id),
    status: text("status").notNull().default("trialing"), // trialing | active | cancelled
    provider: text("provider").notNull().default("test_billing"), // TEST billing provider only
    trialEndsAt: ts("trial_ends_at"),
    currentPeriodStart: ts("current_period_start").notNull().defaultNow(),
    currentPeriodEnd: ts("current_period_end").notNull(),
    cancelledAt: ts("cancelled_at"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("subscriptions_org_uq").on(t.organizationId),
    unique("subscriptions_id_org_uq").on(t.id, t.organizationId),
  ],
);

export const invoices = pgTable(
  "invoices",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id").notNull(),
    periodStart: ts("period_start").notNull(),
    periodEnd: ts("period_end").notNull(),
    amountCents: integer("amount_cents").notNull(),
    status: text("status").notNull().default("draft"), // draft | test_paid — never a live charge
    testMode: boolean("test_mode").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.subscriptionId, t.organizationId],
      foreignColumns: [subscriptions.id, subscriptions.organizationId],
    }),
  ],
);

export const usageRecords = pgTable(
  "usage_records",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    metric: text("metric").notNull(), // verified_outcome | case_opened | action_executed
    quantity: integer("quantity").notNull().default(1),
    caseId: uuid("case_id"),
    dedupeKey: text("dedupe_key"),
    occurredAt: ts("occurred_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("usage_dedupe_uq").on(t.organizationId, t.dedupeKey),
    index("usage_org_metric_idx").on(t.organizationId, t.metric, t.occurredAt),
  ],
);

// ---------------------------------------------------------------- testing support
export const evaluationRuns = pgTable("evaluation_runs", {
  id: pk(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  suite: text("suite").notNull(),
  status: text("status").notNull(),
  passed: integer("passed").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  results: jsonb("results").$type<Record<string, unknown>>().notNull().default({}),
  startedAt: ts("started_at").notNull().defaultNow(),
  finishedAt: ts("finished_at"),
});

export const testFixtures = pgTable("test_fixtures", {
  id: pk(),
  key: text("key").notNull().unique(),
  description: text("description").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------- marketing & infra
export const leads = pgTable(
  "leads",
  {
    id: pk(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    company: text("company"),
    useCase: text("use_case"),
    message: text("message"),
    source: text("source").notNull().default("website"),
    ipHash: text("ip_hash"),
    createdAt: createdAt(),
  },
  (t) => [index("leads_email_idx").on(t.email)],
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: ts("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [uniqueIndex("rate_limits_key_window_uq").on(t.key, t.windowStart)],
);

/** Better Auth rate-limit storage (shared across instances; replaces its in-memory default). */
export const authRateLimits = pgTable("auth_rate_limits", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/**
 * Durable work queue for everything that must happen later without a human: workflow timeouts, action retries,
 * maintenance (retention, expiry). Claimed with FOR UPDATE SKIP LOCKED + a lease, so any number of workers/instances
 * can run safely and a crashed worker's job is reclaimed when its lease expires.
 */
export const scheduledJobs = pgTable(
  "scheduled_jobs",
  {
    id: pk(),
    /** null = platform-level job (maintenance). */
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    runAt: ts("run_at").notNull().defaultNow(),
    status: text("status").notNull().default("PENDING"), // PENDING | RUNNING | SUCCEEDED | DEAD
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    lockedBy: text("locked_by"),
    lockedUntil: ts("locked_until"),
    lastError: text("last_error"),
    /** Enqueueing the same key twice is a no-op (idempotent scheduling). */
    dedupeKey: text("dedupe_key"),
    createdAt: createdAt(),
    startedAt: ts("started_at"),
    finishedAt: ts("finished_at"),
  },
  (t) => [
    uniqueIndex("scheduled_jobs_dedupe_uq")
      .on(t.dedupeKey)
      .where(sql`${t.dedupeKey} is not null`),
    index("scheduled_jobs_due_idx").on(t.status, t.runAt),
  ],
);

/** Customer privacy requests (export is instant; deletion is processed by staff and leaves an audit trail). */
export const dataRequests = pgTable(
  "data_requests",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").notNull(),
    kind: text("kind").notNull(), // export | deletion
    status: text("status").notNull().default("PENDING"), // PENDING | COMPLETED | REJECTED
    reason: text("reason"),
    processedBy: text("processed_by"),
    processedAt: ts("processed_at"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.customerId, t.organizationId],
      foreignColumns: [customers.id, customers.organizationId],
    }),
    uniqueIndex("data_requests_one_pending_uq")
      .on(t.customerId, t.kind)
      .where(sql`${t.status} = 'PENDING'`),
    index("data_requests_org_idx").on(t.organizationId, t.status),
  ],
);

// ---------------------------------------------------------------- SYNTHETIC external provider (demo adapter backend)
export const simAccounts = pgTable(
  "sim_accounts",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    accountNumber: text("account_number").notNull(),
    customerId: uuid("customer_id").notNull(),
    planName: text("plan_name").notNull(),
    priceCents: integer("price_cents").notNull(),
    status: text("status").notNull(), // ACTIVE | CANCELLED
    billingActive: boolean("billing_active").notNull().default(true),
    nextBillingAt: ts("next_billing_at"),
    cancelledAt: ts("cancelled_at"),
    /** Provider-side optimistic version; used by the stale-state guard. */
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [
    unique("sim_accounts_org_num_uq").on(t.organizationId, t.accountNumber),
    unique("sim_accounts_id_org_uq").on(t.id, t.organizationId),
    foreignKey({
      columns: [t.customerId, t.organizationId],
      foreignColumns: [customers.id, customers.organizationId],
    }),
  ],
);

export const simCancellationRequests = pgTable(
  "sim_cancellation_requests",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull(),
    requestedAt: ts("requested_at").notNull(),
    channel: text("channel").notNull(),
    status: text("status").notNull(), // RECEIVED | PROCESSED | FAILED_TO_APPLY
    note: text("note"),
  },
  (t) => [
    foreignKey({
      columns: [t.accountId, t.organizationId],
      foreignColumns: [simAccounts.id, simAccounts.organizationId],
    }),
  ],
);

export const simCharges = pgTable(
  "sim_charges",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
    description: text("description").notNull(),
    chargedAt: ts("charged_at").notNull(),
    status: text("status").notNull().default("POSTED"), // POSTED | UNDER_REVIEW
  },
  (t) => [
    foreignKey({
      columns: [t.accountId, t.organizationId],
      foreignColumns: [simAccounts.id, simAccounts.organizationId],
    }),
  ],
);

export const simBillingReviews = pgTable(
  "sim_billing_reviews",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    chargeId: uuid("charge_id").notNull(),
    accountId: uuid("account_id").notNull(),
    externalRef: text("external_ref").notNull(),
    status: text("status").notNull().default("OPEN"), // OPEN | DECIDED
    /** Set only by a human billing reviewer in the simulator. Orylo never moves money. */
    decision: text("decision"), // APPROVED_FOR_REFUND_PROCESSING | DENIED
    decidedAt: ts("decided_at"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.accountId, t.organizationId],
      foreignColumns: [simAccounts.id, simAccounts.organizationId],
    }),
    unique("sim_reviews_ref_uq").on(t.externalRef),
    uniqueIndex("sim_reviews_one_per_charge_uq").on(t.chargeId),
  ],
);

/** Provider-side idempotency ledger: a repeated external key returns the original result and mutates nothing. */
export const simOperations = pgTable(
  "sim_operations",
  {
    id: pk(),
    organizationId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    externalKey: text("external_key").notNull(),
    operation: text("operation").notNull(),
    result: jsonb("result").$type<Record<string, unknown>>().notNull(),
    /** How many times this external key was RECEIVED (mutation count is observable via account.version). */
    deliveries: bigint("deliveries", { mode: "number" }).notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [unique("sim_ops_org_key_uq").on(t.organizationId, t.externalKey)],
);

export type Org = typeof organizations.$inferSelect;
export type CaseRow = typeof resolutionCases.$inferSelect;
export type CaseState = (typeof caseState.enumValues)[number];
export type OrgRole = (typeof orgRole.enumValues)[number];
