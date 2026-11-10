CREATE TYPE "public"."action_status" AS ENUM('REQUESTED', 'AWAITING_CONSENT', 'AWAITING_APPROVAL', 'APPROVED', 'EXECUTING', 'SUCCEEDED', 'FAILED', 'DENIED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."actor_type" AS ENUM('customer', 'operator', 'system', 'integration', 'channel');--> statement-breakpoint
CREATE TYPE "public"."case_state" AS ENUM('OPEN', 'INVESTIGATING', 'AWAITING_CUSTOMER_INFORMATION', 'READY_FOR_ACTION', 'AWAITING_APPROVAL', 'ACTION_PENDING', 'ACTION_EXECUTED', 'OUTCOME_PENDING_VERIFICATION', 'VERIFIED_RESOLVED', 'BLOCKED', 'ESCALATED', 'FAILED', 'CANCELLED', 'REOPENED');--> statement-breakpoint
CREATE TYPE "public"."escalation_status" AS ENUM('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'RETURNED_TO_AUTOMATION', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."execution_status" AS ENUM('RUNNING', 'WAITING', 'COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."objective_status" AS ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'VERIFIED', 'BLOCKED', 'NOT_APPLICABLE');--> statement-breakpoint
CREATE TYPE "public"."org_role" AS ENUM('owner', 'admin', 'policy_manager', 'operator', 'approver', 'analyst');--> statement-breakpoint
CREATE TYPE "public"."policy_status" AS ENUM('DRAFT', 'IN_REVIEW', 'APPROVED', 'SUPERSEDED', 'RETIRED');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."workflow_version_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"action_request_id" uuid NOT NULL,
	"approver_type" "actor_type" NOT NULL,
	"approver_id" text NOT NULL,
	"decision" text NOT NULL,
	"consent_text" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"action_request_id" uuid NOT NULL,
	"attempt_no" integer NOT NULL,
	"status" text NOT NULL,
	"adapter" text NOT NULL,
	"request" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_code" text,
	"external_ref" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "action_attempts_req_no_uq" UNIQUE("action_request_id","attempt_no")
);
--> statement-breakpoint
CREATE TABLE "action_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"action_request_id" uuid NOT NULL,
	"receipt_no" text NOT NULL,
	"operation" text NOT NULL,
	"external_ref" text,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"signature" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "action_receipts_req_uq" UNIQUE("action_request_id"),
	CONSTRAINT "action_receipts_no_uq" UNIQUE("receipt_no")
);
--> statement-breakpoint
CREATE TABLE "action_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "action_status" DEFAULT 'REQUESTED' NOT NULL,
	"requested_by_type" "actor_type" NOT NULL,
	"requested_by_id" text,
	"policy_version_id" uuid,
	"expected_state_hash" text,
	"amount_cents" integer,
	"failure_code" text,
	"failure_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "action_requests_org_idem_uq" UNIQUE("organization_id","idempotency_key"),
	CONSTRAINT "action_requests_id_org_uq" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_by" text,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"assignee_user_id" text,
	"queue_id" uuid,
	"assigned_by" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"outcome" text DEFAULT 'success' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"type" text NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" text,
	"from_state" "case_state",
	"to_state" "case_state",
	"visibility" text DEFAULT 'customer' NOT NULL,
	"message" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "case_events_case_seq_uq" UNIQUE("case_id","seq")
);
--> statement-breakpoint
CREATE TABLE "case_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"uploaded_by_type" "actor_type" NOT NULL,
	"uploaded_by_id" text,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"note" text,
	"content" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_objectives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"status" "objective_status" DEFAULT 'PENDING' NOT NULL,
	"detail" text,
	"verified_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "case_objectives_case_key_uq" UNIQUE("case_id","key"),
	CONSTRAINT "case_objectives_id_org_uq" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "customer_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"case_id" uuid,
	"token_hash" text NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"issued_via" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_access_grants_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"external_ref" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"user_id" text,
	"synthetic" boolean DEFAULT true NOT NULL,
	"preferences" jsonb DEFAULT '{"notifyEmail":false,"notifyInApp":true}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_org_ext_uq" UNIQUE("organization_id","external_ref"),
	CONSTRAINT "customers_id_org_uq" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "escalations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"reason_code" text NOT NULL,
	"status" "escalation_status" DEFAULT 'OPEN' NOT NULL,
	"queue_id" uuid,
	"owner_user_id" text,
	"channel" text DEFAULT 'queue' NOT NULL,
	"context_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_type" "actor_type" NOT NULL,
	"created_by_id" text,
	"resolution_note" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"suite" text NOT NULL,
	"status" text NOT NULL,
	"passed" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"results" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "integration_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secret_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_org_provider_uq" UNIQUE("organization_id","provider"),
	CONSTRAINT "integration_id_org_uq" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "integration_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid,
	"direction" text NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "org_role" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"invited_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"test_mode" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_gaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"query" text NOT NULL,
	"reason" text NOT NULL,
	"occurrences" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_gaps_org_query_uq" UNIQUE("organization_id","query")
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"company" text,
	"use_case" text,
	"message" text,
	"source" text DEFAULT 'website' NOT NULL,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "org_role" NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_org_user_uq" UNIQUE("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"recipient_user_id" text,
	"recipient_customer_id" uuid,
	"case_id" uuid,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"channel" text DEFAULT 'in_app' NOT NULL,
	"delivery_status" text DEFAULT 'DELIVERED' NOT NULL,
	"delivery_detail" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"branding" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"settings" jsonb DEFAULT '{"retentionDays":365,"approvalThresholdCents":5000,"emailNotifications":false,"auditRetentionDays":730}'::jsonb NOT NULL,
	"synthetic" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "outcome_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"case_id" uuid NOT NULL,
	"objective_key" text,
	"requested_outcome" text NOT NULL,
	"action_attempted" text,
	"executor" text NOT NULL,
	"authorization_ref" text,
	"policy_version_id" uuid,
	"external_operation_ref" text,
	"execution_result" text NOT NULL,
	"verification_method" text,
	"verified_at" timestamp with time zone,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"final_outcome" text NOT NULL,
	"remaining_objectives" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prev_hash" text NOT NULL,
	"entry_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_org_seq_uq" UNIQUE("organization_id","seq"),
	CONSTRAINT "ledger_id_org_uq" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"price_cents_monthly" integer NOT NULL,
	"experimental" boolean DEFAULT true NOT NULL,
	"entitlements" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "policy_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"approver_user_id" text NOT NULL,
	"decision" text NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"owner_name" text NOT NULL,
	"source_label" text DEFAULT 'Internal policy (synthetic)' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "policy_docs_org_key_uq" UNIQUE("organization_id","key"),
	CONSTRAINT "policy_docs_id_org_uq" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "policy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "policy_status" DEFAULT 'DRAFT' NOT NULL,
	"effective_from" timestamp with time zone,
	"effective_to" timestamp with time zone,
	"body" text NOT NULL,
	"rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"topics" text[] DEFAULT '{}'::text[] NOT NULL,
	"content_sha256" text NOT NULL,
	"supersedes_id" uuid,
	"quarantined_sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "policy_versions_doc_ver_uq" UNIQUE("document_id","version"),
	CONSTRAINT "policy_versions_id_org_uq" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "queues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "queues_org_key_uq" UNIQUE("organization_id","key"),
	CONSTRAINT "queues_id_org_uq" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resolution_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text NOT NULL,
	"state" "case_state" DEFAULT 'OPEN' NOT NULL,
	"priority" "priority" DEFAULT 'normal' NOT NULL,
	"assignee_user_id" text,
	"queue_id" uuid,
	"workflow_version_id" uuid,
	"source" text DEFAULT 'portal' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"reopen_count" integer DEFAULT 0 NOT NULL,
	"synthetic" boolean DEFAULT true NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_action_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cases_org_ref_uq" UNIQUE("organization_id","reference"),
	CONSTRAINT "cases_id_org_uq" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "sim_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"account_number" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"plan_name" text NOT NULL,
	"price_cents" integer NOT NULL,
	"status" text NOT NULL,
	"billing_active" boolean DEFAULT true NOT NULL,
	"next_billing_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sim_accounts_org_num_uq" UNIQUE("organization_id","account_number"),
	CONSTRAINT "sim_accounts_id_org_uq" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "sim_billing_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"external_ref" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"decision" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sim_reviews_ref_uq" UNIQUE("external_ref")
);
--> statement-breakpoint
CREATE TABLE "sim_cancellation_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"channel" text NOT NULL,
	"status" text NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "sim_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"description" text NOT NULL,
	"charged_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'POSTED' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sim_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"external_key" text NOT NULL,
	"operation" text NOT NULL,
	"result" jsonb NOT NULL,
	"deliveries" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sim_ops_org_key_uq" UNIQUE("organization_id","external_key")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" text DEFAULT 'trialing' NOT NULL,
	"provider" text DEFAULT 'test_billing' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"current_period_start" timestamp with time zone DEFAULT now() NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_org_uq" UNIQUE("organization_id"),
	CONSTRAINT "subscriptions_id_org_uq" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "test_fixtures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"description" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "test_fixtures_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"case_id" uuid,
	"dedupe_key" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wf_def_org_key_uq" UNIQUE("organization_id","key"),
	CONSTRAINT "wf_def_id_org_uq" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "workflow_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"workflow_version_id" uuid NOT NULL,
	"status" "execution_status" DEFAULT 'RUNNING' NOT NULL,
	"current_node" text,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "wf_exec_id_org_uq" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "workflow_step_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"execution_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"node_type" text NOT NULL,
	"status" text NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workflow_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"definition_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "workflow_version_status" DEFAULT 'DRAFT' NOT NULL,
	"spec" jsonb NOT NULL,
	"created_by" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wf_ver_def_ver_uq" UNIQUE("definition_id","version"),
	CONSTRAINT "wf_ver_id_org_uq" UNIQUE("id","organization_id")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_approvals" ADD CONSTRAINT "action_approvals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_approvals" ADD CONSTRAINT "action_approvals_action_request_id_organization_id_action_requests_id_organization_id_fk" FOREIGN KEY ("action_request_id","organization_id") REFERENCES "public"."action_requests"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_attempts" ADD CONSTRAINT "action_attempts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_attempts" ADD CONSTRAINT "action_attempts_action_request_id_organization_id_action_requests_id_organization_id_fk" FOREIGN KEY ("action_request_id","organization_id") REFERENCES "public"."action_requests"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_receipts" ADD CONSTRAINT "action_receipts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_receipts" ADD CONSTRAINT "action_receipts_action_request_id_organization_id_action_requests_id_organization_id_fk" FOREIGN KEY ("action_request_id","organization_id") REFERENCES "public"."action_requests"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_requests" ADD CONSTRAINT "action_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_requests" ADD CONSTRAINT "action_requests_case_id_organization_id_resolution_cases_id_organization_id_fk" FOREIGN KEY ("case_id","organization_id") REFERENCES "public"."resolution_cases"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_requests" ADD CONSTRAINT "action_requests_customer_id_organization_id_customers_id_organization_id_fk" FOREIGN KEY ("customer_id","organization_id") REFERENCES "public"."customers"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_requests" ADD CONSTRAINT "action_requests_policy_version_id_organization_id_policy_versions_id_organization_id_fk" FOREIGN KEY ("policy_version_id","organization_id") REFERENCES "public"."policy_versions"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_case_id_organization_id_resolution_cases_id_organization_id_fk" FOREIGN KEY ("case_id","organization_id") REFERENCES "public"."resolution_cases"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_queue_id_organization_id_queues_id_organization_id_fk" FOREIGN KEY ("queue_id","organization_id") REFERENCES "public"."queues"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_case_id_organization_id_resolution_cases_id_organization_id_fk" FOREIGN KEY ("case_id","organization_id") REFERENCES "public"."resolution_cases"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_evidence" ADD CONSTRAINT "case_evidence_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_evidence" ADD CONSTRAINT "case_evidence_case_id_organization_id_resolution_cases_id_organization_id_fk" FOREIGN KEY ("case_id","organization_id") REFERENCES "public"."resolution_cases"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_objectives" ADD CONSTRAINT "case_objectives_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_objectives" ADD CONSTRAINT "case_objectives_case_id_organization_id_resolution_cases_id_organization_id_fk" FOREIGN KEY ("case_id","organization_id") REFERENCES "public"."resolution_cases"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_access_grants" ADD CONSTRAINT "customer_access_grants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_access_grants" ADD CONSTRAINT "customer_access_grants_customer_id_organization_id_customers_id_organization_id_fk" FOREIGN KEY ("customer_id","organization_id") REFERENCES "public"."customers"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_access_grants" ADD CONSTRAINT "customer_access_grants_case_id_organization_id_resolution_cases_id_organization_id_fk" FOREIGN KEY ("case_id","organization_id") REFERENCES "public"."resolution_cases"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_case_id_organization_id_resolution_cases_id_organization_id_fk" FOREIGN KEY ("case_id","organization_id") REFERENCES "public"."resolution_cases"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_queue_id_organization_id_queues_id_organization_id_fk" FOREIGN KEY ("queue_id","organization_id") REFERENCES "public"."queues"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_events" ADD CONSTRAINT "integration_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_events" ADD CONSTRAINT "integration_events_connection_id_organization_id_integration_connections_id_organization_id_fk" FOREIGN KEY ("connection_id","organization_id") REFERENCES "public"."integration_connections"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_organization_id_subscriptions_id_organization_id_fk" FOREIGN KEY ("subscription_id","organization_id") REFERENCES "public"."subscriptions"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_gaps" ADD CONSTRAINT "knowledge_gaps_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_customer_id_organization_id_customers_id_organization_id_fk" FOREIGN KEY ("recipient_customer_id","organization_id") REFERENCES "public"."customers"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_case_id_organization_id_resolution_cases_id_organization_id_fk" FOREIGN KEY ("case_id","organization_id") REFERENCES "public"."resolution_cases"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcome_ledger" ADD CONSTRAINT "outcome_ledger_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcome_ledger" ADD CONSTRAINT "outcome_ledger_case_id_organization_id_resolution_cases_id_organization_id_fk" FOREIGN KEY ("case_id","organization_id") REFERENCES "public"."resolution_cases"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_approvals" ADD CONSTRAINT "policy_approvals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_approvals" ADD CONSTRAINT "policy_approvals_policy_version_id_organization_id_policy_versions_id_organization_id_fk" FOREIGN KEY ("policy_version_id","organization_id") REFERENCES "public"."policy_versions"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_documents" ADD CONSTRAINT "policy_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_document_id_organization_id_policy_documents_id_organization_id_fk" FOREIGN KEY ("document_id","organization_id") REFERENCES "public"."policy_documents"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queues" ADD CONSTRAINT "queues_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_cases" ADD CONSTRAINT "resolution_cases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_cases" ADD CONSTRAINT "resolution_cases_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_cases" ADD CONSTRAINT "resolution_cases_customer_id_organization_id_customers_id_organization_id_fk" FOREIGN KEY ("customer_id","organization_id") REFERENCES "public"."customers"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_cases" ADD CONSTRAINT "resolution_cases_queue_id_organization_id_queues_id_organization_id_fk" FOREIGN KEY ("queue_id","organization_id") REFERENCES "public"."queues"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_cases" ADD CONSTRAINT "resolution_cases_workflow_version_id_organization_id_workflow_versions_id_organization_id_fk" FOREIGN KEY ("workflow_version_id","organization_id") REFERENCES "public"."workflow_versions"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sim_accounts" ADD CONSTRAINT "sim_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sim_accounts" ADD CONSTRAINT "sim_accounts_customer_id_organization_id_customers_id_organization_id_fk" FOREIGN KEY ("customer_id","organization_id") REFERENCES "public"."customers"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sim_billing_reviews" ADD CONSTRAINT "sim_billing_reviews_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sim_billing_reviews" ADD CONSTRAINT "sim_billing_reviews_account_id_organization_id_sim_accounts_id_organization_id_fk" FOREIGN KEY ("account_id","organization_id") REFERENCES "public"."sim_accounts"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sim_cancellation_requests" ADD CONSTRAINT "sim_cancellation_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sim_cancellation_requests" ADD CONSTRAINT "sim_cancellation_requests_account_id_organization_id_sim_accounts_id_organization_id_fk" FOREIGN KEY ("account_id","organization_id") REFERENCES "public"."sim_accounts"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sim_charges" ADD CONSTRAINT "sim_charges_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sim_charges" ADD CONSTRAINT "sim_charges_account_id_organization_id_sim_accounts_id_organization_id_fk" FOREIGN KEY ("account_id","organization_id") REFERENCES "public"."sim_accounts"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sim_operations" ADD CONSTRAINT "sim_operations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD CONSTRAINT "workflow_definitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_case_id_organization_id_resolution_cases_id_organization_id_fk" FOREIGN KEY ("case_id","organization_id") REFERENCES "public"."resolution_cases"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workflow_version_id_organization_id_workflow_versions_id_organization_id_fk" FOREIGN KEY ("workflow_version_id","organization_id") REFERENCES "public"."workflow_versions"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_step_executions" ADD CONSTRAINT "workflow_step_executions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_step_executions" ADD CONSTRAINT "workflow_step_executions_execution_id_organization_id_workflow_executions_id_organization_id_fk" FOREIGN KEY ("execution_id","organization_id") REFERENCES "public"."workflow_executions"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_definition_id_organization_id_workflow_definitions_id_organization_id_fk" FOREIGN KEY ("definition_id","organization_id") REFERENCES "public"."workflow_definitions"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "action_approvals_req_idx" ON "action_approvals" USING btree ("action_request_id");--> statement-breakpoint
CREATE INDEX "action_requests_case_idx" ON "action_requests" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "api_keys_org_idx" ON "api_keys" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assignments_one_active_uq" ON "assignments" USING btree ("case_id") WHERE "assignments"."active" = true;--> statement-breakpoint
CREATE INDEX "audit_org_time_idx" ON "audit_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_target_idx" ON "audit_events" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "case_events_case_idx" ON "case_events" USING btree ("case_id","seq");--> statement-breakpoint
CREATE INDEX "customers_user_idx" ON "customers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "customers_email_idx" ON "customers" USING btree ("organization_id","email");--> statement-breakpoint
CREATE INDEX "escalations_org_status_idx" ON "escalations" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "escalations_case_idx" ON "escalations" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "integration_events_org_idx" ON "integration_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "invitations_org_idx" ON "invitations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "leads_email_idx" ON "leads" USING btree ("email");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("recipient_user_id","read_at");--> statement-breakpoint
CREATE INDEX "notifications_customer_idx" ON "notifications" USING btree ("recipient_customer_id","read_at");--> statement-breakpoint
CREATE INDEX "ledger_case_idx" ON "outcome_ledger" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "policy_versions_one_approved_uq" ON "policy_versions" USING btree ("document_id") WHERE "policy_versions"."status" = 'APPROVED';--> statement-breakpoint
CREATE INDEX "policy_versions_org_status_idx" ON "policy_versions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limits_key_window_uq" ON "rate_limits" USING btree ("key","window_start");--> statement-breakpoint
CREATE INDEX "cases_org_state_idx" ON "resolution_cases" USING btree ("organization_id","state");--> statement-breakpoint
CREATE INDEX "cases_customer_idx" ON "resolution_cases" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "cases_assignee_idx" ON "resolution_cases" USING btree ("organization_id","assignee_user_id");--> statement-breakpoint
CREATE INDEX "cases_org_updated_idx" ON "resolution_cases" USING btree ("organization_id","updated_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sim_reviews_one_per_charge_uq" ON "sim_billing_reviews" USING btree ("charge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_dedupe_uq" ON "usage_records" USING btree ("organization_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "usage_org_metric_idx" ON "usage_records" USING btree ("organization_id","metric","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wf_exec_one_live_uq" ON "workflow_executions" USING btree ("case_id") WHERE "workflow_executions"."status" in ('RUNNING','WAITING');--> statement-breakpoint
CREATE INDEX "wf_step_exec_idx" ON "workflow_step_executions" USING btree ("execution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wf_ver_one_published_uq" ON "workflow_versions" USING btree ("definition_id") WHERE "workflow_versions"."status" = 'PUBLISHED';