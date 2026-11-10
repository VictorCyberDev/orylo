"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { ZodError } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, memberships, notifications, type CaseState, type OrgRole } from "@/db/schema";
import { getAuth } from "@/auth/auth";
import { getCustomer, getStaff } from "@/auth/session";
import { AppError, forbidden } from "@/domain/errors";
import type { Ctx } from "@/domain/context";
import { actorCustomerId } from "@/domain/context";
import {
  addNote,
  appendEvent,
  assignCase,
  findCase,
  lockCase,
  reopenCase,
  setPriority,
  transitionCase,
} from "@/domain/cases";
import { confirmAction, decideApproval, requestAction, submitAction } from "@/domain/actions";
import { advance, openWorkflowCase, provideInfo, sweepTimeouts } from "@/workflows/engine";
import { escalateCase, resolveEscalation, takeOwnership } from "@/domain/escalation";
import { addEvidence } from "@/domain/uploads";
import { submitLead } from "@/domain/leads";
import { markRead } from "@/domain/notifications";
import * as admin from "@/domain/admin";
import { changePlan, cancelSubscription } from "@/domain/billing";
import {
  answerFromPolicy,
  approvePolicyVersion,
  createPolicyVersion,
  rejectPolicyVersion,
  submitForReview,
} from "@/domain/policy";
import { audit } from "@/domain/audit";
import type { ActionResult } from "@/components/client";
import type { SimMode } from "@/adapters/subscription";

type R = Promise<ActionResult>;
type Out = { message?: string; redirectTo?: string; data?: unknown } | void;

async function guard(fn: () => Promise<Out>): R {
  try {
    const r = (await fn()) ?? {};
    revalidatePath("/", "layout");
    return { ok: true, ...r };
  } catch (e) {
    if (e instanceof AppError)
      return {
        ok: false,
        error: e.message,
        fieldErrors: e.details?.fields as Record<string, string> | undefined,
      };
    if (e instanceof ZodError)
      return {
        ok: false,
        error: e.issues.map((i) => `${i.path.join(".") || "value"}: ${i.message}`).join("; "),
      };
    if (
      typeof e === "object" &&
      e &&
      "digest" in e &&
      String((e as { digest: unknown }).digest).startsWith("NEXT_")
    )
      throw e;
    console.error("[action error]", e);
    return { ok: false, error: "Something went wrong on our side. Nothing was changed. Please try again." };
  }
}
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function staffCtx(): Promise<Ctx> {
  const s = await getStaff();
  if (!s) throw new AppError("UNAUTHENTICATED", "Please sign in again.");
  return { ...s.ctx, requestId: crypto.randomUUID() };
}
async function customerCtx(): Promise<Ctx> {
  const c = await getCustomer();
  if (!c) throw new AppError("UNAUTHENTICATED", "Please sign in again.");
  return { ...c.ctx, requestId: crypto.randomUUID() };
}
/** Whoever is signed in: staff or customer. Used for actions both audiences share (e.g. upload evidence). */
async function anyCtx(): Promise<Ctx> {
  return (await getStaff())?.ctx ?? (await customerCtx());
}

/* ===================================================== auth */
export async function signInAction(_p: ActionResult, fd: FormData): R {
  const email = str(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  const next = str(fd, "next");
  try {
    const res = await getAuth().api.signInEmail({ body: { email, password }, headers: await headers() });
    const uid = res.user.id;
    const [m] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.userId, uid), eq(memberships.status, "active")))
      .limit(1);
    const [c] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.userId, uid))
      .limit(1);
    const safeNext =
      next.startsWith("/") && !next.startsWith("//") && /^\/(app|portal|invite)(\/|$)/.test(next)
        ? next
        : null; // no open redirects
    const dest = safeNext?.startsWith("/invite")
      ? safeNext
      : m
        ? safeNext?.startsWith("/app")
          ? safeNext
          : "/app"
        : c
          ? safeNext?.startsWith("/portal")
            ? safeNext
            : "/portal"
          : "/";
    return { ok: true, redirectTo: dest };
  } catch (e) {
    const msg =
      (e as { body?: { message?: string }; status?: number }).status === 429
        ? "Too many attempts. Please wait a minute and try again."
        : "That email and password don't match. Check them and try again.";
    return { ok: false, error: msg };
  }
}
export async function signUpForInviteAction(_p: ActionResult, fd: FormData): R {
  return guard(async () => {
    const email = str(fd, "email").toLowerCase();
    const name = str(fd, "name");
    const token = str(fd, "token");
    const password = String(fd.get("password") ?? "");
    if (name.length < 2) throw new AppError("VALIDATION", "Please enter your name.");
    const res = await getAuth()
      .api.signUpEmail({ body: { email, password, name }, headers: await headers() })
      .catch(() => {
        throw new AppError(
          "VALIDATION",
          "We couldn't create that account. If you already have one, sign in instead. Passwords need 10+ characters.",
        );
      });
    await admin.acceptInvitation(db, token, { id: res.user.id, email });
    return { redirectTo: "/app", message: "Welcome aboard." };
  });
}
export async function acceptInviteSignedInAction(_p: ActionResult, fd: FormData): R {
  return guard(async () => {
    const s = await getAuth().api.getSession({ headers: await headers() });
    if (!s) throw new AppError("UNAUTHENTICATED", "Please sign in first.");
    await admin.acceptInvitation(db, str(fd, "token"), { id: s.user.id, email: s.user.email });
    return { redirectTo: "/app", message: "Invitation accepted." };
  });
}
export async function signOutAction() {
  await getAuth()
    .api.signOut({ headers: await headers() })
    .catch(() => undefined);
  revalidatePath("/", "layout");
}
export async function requestPasswordResetAction(_p: ActionResult, fd: FormData): R {
  // Always the same answer — never reveal whether an address has an account.
  await getAuth()
    .api.requestPasswordReset({
      body: { email: str(fd, "email").toLowerCase(), redirectTo: "/reset-password" },
      headers: await headers(),
    })
    .catch(() => undefined);
  return {
    ok: true,
    message:
      "If that address has an account, a reset link will be sent. (This demo environment has no email provider configured, so no email is sent.)",
  };
}
export async function resetPasswordAction(_p: ActionResult, fd: FormData): R {
  return guard(async () => {
    await getAuth()
      .api.resetPassword({ body: { newPassword: String(fd.get("password") ?? ""), token: str(fd, "token") } })
      .catch(() => {
        throw new AppError(
          "VALIDATION",
          "That reset link is invalid or has expired, or the password is too short (10+ characters).",
        );
      });
    return { redirectTo: "/sign-in", message: "Password updated. Sign in with your new password." };
  });
}

/* ===================================================== public */
export async function leadAction(_p: ActionResult, fd: FormData): R {
  return guard(async () => {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    await submitLead(db, Object.fromEntries(fd.entries()), { ip });
    return { message: "Thanks — we'll be in touch." };
  });
}
export async function policyQuestionAction(
  _p: ActionResult & { answer?: unknown },
  fd: FormData,
): Promise<ActionResult & { answer?: unknown }> {
  const s = await getStaff();
  if (!s) return { ok: false, error: "Please sign in." };
  const a = await answerFromPolicy(db, s.org.id, str(fd, "q"));
  return { ok: true, answer: a };
}

/* ===================================================== customer */
const WORKFLOWS: Record<string, { title: string; needsAccount: boolean }> = {
  "failed-cancellation-billing-recovery": { title: "I cancelled but was charged again", needsAccount: true },
  "missed-appointment-recovery": { title: "My service appointment was missed", needsAccount: false },
  "warranty-claim-readiness": {
    title: "My device is faulty and I want to make a warranty claim",
    needsAccount: false,
  },
};
export async function openCaseAction(_p: ActionResult, fd: FormData): R {
  return guard(async () => {
    const ctx = await customerCtx();
    const key = str(fd, "workflowKey");
    const wf = WORKFLOWS[key];
    if (!wf) throw new AppError("VALIDATION", "Please choose what happened.");
    const cid = actorCustomerId(ctx.actor)!;
    const row = await openWorkflowCase(db, ctx, {
      workflowKey: key,
      customerId: cid,
      title: wf.title,
      description: str(fd, "description").slice(0, 2000),
      source: "portal",
      accountNumber: str(fd, "accountNumber") || undefined,
    });
    return { redirectTo: `/portal/cases/${row.reference}`, message: `Case ${row.reference} opened.` };
  });
}
export async function confirmActionAction(_p: ActionResult, fd: FormData): R {
  return guard(async () => {
    const ctx = await customerCtx();
    const consent = str(fd, "consent") === "yes";
    const r = await confirmAction(db, ctx, str(fd, "requestId"), consent);
    await advance(db, ctx, str(fd, "caseRef"));
    if (r.status === "DECLINED")
      return { message: "Okay — nothing was changed. You can still ask for a person." };
    if (r.status === "AWAITING_APPROVAL")
      return {
        message:
          "Thanks. This amount needs a team member's approval first; we'll tell you as soon as it's reviewed.",
      };
    if (r.status === "FAILED")
      throw new AppError(
        "ADAPTER_FAILURE",
        `We couldn't complete that (${r.failure?.code}). Nothing was reported as done${r.failure?.retriable ? " — it's safe to try again" : "; a person will review it"}.`,
      );
    if (r.status === "EXECUTED" && r.verification && !r.verification.verified)
      return {
        message:
          "The step ran but we couldn't confirm the result, so we're not calling it done. A person will check.",
      };
    return {
      message: r.status === "DUPLICATE" ? "Already done — here is the same receipt." : "Done and verified.",
    };
  });
}
export async function provideInfoAction(_p: ActionResult, fd: FormData): R {
  return guard(async () => {
    const ctx = await anyCtx();
    const answers = Object.fromEntries(
      [...fd.entries()]
        .filter(([k]) => !k.startsWith("$") && k !== "caseRef")
        .map(([k, v]) => [k, String(v)]),
    );
    await provideInfo(db, ctx, str(fd, "caseRef"), answers);
    return { message: "Thanks — we've got that." };
  });
}
export async function uploadEvidenceAction(_p: ActionResult, fd: FormData): R {
  return guard(async () => {
    const ctx = await anyCtx();
    const f = fd.get("file");
    if (!(f instanceof File) || f.size === 0) throw new AppError("VALIDATION", "Choose a file to upload.");
    if (f.size > 2 * 1024 * 1024) throw new AppError("VALIDATION", "That file is larger than 2 MB.");
    await addEvidence(
      db,
      ctx,
      str(fd, "caseRef"),
      { filename: f.name, contentType: f.type, bytes: Buffer.from(await f.arrayBuffer()) },
      str(fd, "note"),
    );
    await advance(db, ctx, str(fd, "caseRef")).catch(() => undefined);
    return { message: "Uploaded." };
  });
}
export async function escalateAction(_p: ActionResult, fd: FormData): R {
  return guard(async () => {
    const ctx = await anyCtx();
    const channel =
      str(fd, "channel") === "email_request"
        ? "email_request"
        : str(fd, "channel") === "queue"
          ? "queue"
          : "callback_request";
    await escalateCase(db, ctx, str(fd, "caseRef"), {
      reason: str(fd, "reason") || "Customer asked to speak to a person",
      reasonCode: ctx.actor.type === "operator" ? "OPERATOR_ESCALATION" : "CUSTOMER_REQUEST",
      channel,
    });
    return { message: "A person now has your case, with everything we know." };
  });
}
export async function reopenAction(_p: ActionResult, fd: FormData): R {
  return guard(async () => {
    const ctx = await anyCtx();
    await reopenCase(db, ctx, str(fd, "caseRef"), str(fd, "reason"));
    return { message: "Case reopened. Nothing was lost." };
  });
}
export async function cancelCaseAction(_p: ActionResult, fd: FormData): R {
  return guard(async () => {
    const ctx = await anyCtx();
    await transitionCase(db, ctx, str(fd, "caseRef"), { to: "CANCELLED", message: "Case cancelled." });
    return { message: "Case cancelled." };
  });
}
export async function feedbackAction(_p: ActionResult, fd: FormData): R {
  return guard(async () => {
    const ctx = await customerCtx();
    const rating = Number(str(fd, "rating"));
    if (!(rating >= 1 && rating <= 5)) throw new AppError("VALIDATION", "Choose a rating from 1 to 5.");
    await db.transaction(async (tx) => {
      const row = await lockCase(tx, ctx, str(fd, "caseRef"));
      if (row.customerId !== actorCustomerId(ctx.actor) || row.state !== "VERIFIED_RESOLVED")
        throw new AppError("CONFLICT", "Feedback opens once the outcome is verified.");
      await appendEvent(tx, ctx, row.id, {
        type: "customer.feedback",
        message: `Feedback: ${rating}/5${str(fd, "comment") ? ` — ${str(fd, "comment").slice(0, 500)}` : ""}`,
        payload: { rating },
      });
    });
    return { message: "Thank you for the feedback." };
  });
}
export async function savePrefsAction(_p: ActionResult, fd: FormData): R {
  return guard(async () => {
    const c = await getCustomer();
    if (!c) throw new AppError("UNAUTHENTICATED", "Please sign in again.");
    await db
      .update(customers)
      .set({
        preferences: {
          notifyEmail: fd.get("notifyEmail") === "on",
          notifyInApp: fd.get("notifyInApp") === "on",
        },
      })
      .where(and(eq(customers.id, c.customer.id), eq(customers.organizationId, c.org.id)));
    await audit(db, c.ctx, { action: "customer.prefs", targetType: "customer", targetId: c.customer.id });
    return { message: "Preferences saved." };
  });
}
export async function markReadAction(fd: FormData) {
  "use server";
  const s = await getStaff();
  const c = s ? null : await getCustomer();
  const id = str(fd, "id");
  if (s) await markRead(db, s.org.id, id, { userId: s.user.id });
  else if (c) await markRead(db, c.org.id, id, { customerId: c.customer.id });
  revalidatePath("/", "layout");
}
export async function markAllReadAction() {
  const s = await getStaff();
  const c = s ? null : await getCustomer();
  if (s)
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.organizationId, s.org.id), eq(notifications.recipientUserId, s.user.id)));
  else if (c)
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(eq(notifications.organizationId, c.org.id), eq(notifications.recipientCustomerId, c.customer.id)),
      );
  revalidatePath("/", "layout");
}

/* ===================================================== operator */
export async function transitionAction(_p: ActionResult, fd: FormData): R {
  return guard(async () => {
    const ctx = await staffCtx();
    await transitionCase(db, ctx, str(fd, "caseRef"), {
      to: str(fd, "to") as CaseState,
      message: str(fd, "message") || undefined,
      expectedVersion: fd.get("version") ? Number(fd.get("version")) : undefined,
    });
    return { message: "Case updated." };
  });
}
export async function assignAction(_p: ActionResult, fd: FormData): R {
  return guard(async () => {
    const ctx = await staffCtx();
    const to = str(fd, "assignee");
    await assignCase(db, ctx, str(fd, "caseId"), to === "" || to === "none" ? null : to);
    return { message: "Assignment saved." };
  });
}
export async function priorityAction(_p: ActionResult, fd: FormData): R {
  return guard(async () => {
    const ctx = await staffCtx();
    await setPriority(db, ctx, str(fd, "caseId"), str(fd, "priority") as "low");
    return { message: "Priority updated." };
  });
}
export async function noteAction(_p: ActionResult, fd: FormData): R {
  return guard(async () => {
    const ctx = await staffCtx();
    const msg = str(fd, "message");
    if (!msg) throw new AppError("VALIDATION", "Write a note first.");
    await addNote(
      db,
      ctx,
      str(fd, "caseId"),
      msg,
      str(fd, "visibility") === "customer" ? "customer" : "internal",
    );
    return { message: "Note added." };
  });
}
export async function approvalAction(_p: ActionResult, fd: FormData): R {
  return guard(async () => {
    const ctx = await staffCtx();
    const granted = str(fd, "decision") === "approve";
    await decideApproval(db, ctx, str(fd, "requestId"), granted, str(fd, "reason") || undefined);
    await advance(db, ctx, str(fd, "caseRef")).catch(() => undefined);
    return {
      message: granted ? "Approved. The customer's step can now run." : "Declined. Nothing will run.",
    };
  });
}
export async function operatorRunAction(_p: ActionResult, fd: FormData): R {
  return guard(async () => {
    const ctx = await staffCtx();
    const op = str(fd, "operation");
    const input = JSON.parse(str(fd, "input") || "{}");
    // Staff operations run from READY_FOR_ACTION; if the case is waiting on this very decision, ready it first (audited transition).
    const cur = await findCase(db, ctx, str(fd, "caseId"));
    if (cur.state === "ESCALATED")
      await transitionCase(db, ctx, cur.id, {
        to: "INVESTIGATING",
        message: "Taken back from escalation for a staff step.",
      });
    if (["ESCALATED", "OUTCOME_PENDING_VERIFICATION", "INVESTIGATING"].includes(cur.state))
      await transitionCase(db, ctx, cur.id, { to: "READY_FOR_ACTION", message: "Readied for a staff step." });
    const r = await submitAction(db, ctx, {
      caseId: str(fd, "caseId"),
      operation: op,
      input,
      idempotencyKey: str(fd, "idempotencyKey") || `op:${crypto.randomUUID()}`,
    });
    await advance(db, ctx, str(fd, "caseId")).catch(() => undefined);
    if (r.status === "FAILED")
      throw new AppError(
        "ADAPTER_FAILURE",
        `Action failed (${r.failure?.code}). Nothing was reported as done.`,
      );
    return {
      message: r.verification?.verified ? "Executed and verified." : "Executed; verification pending.",
    };
  });
}
export async function proposeAction(_p: ActionResult, fd: FormData): R {
  return guard(async () => {
    const ctx = await staffCtx();
    await requestAction(db, ctx, {
      caseId: str(fd, "caseId"),
      operation: str(fd, "operation"),
      input: JSON.parse(str(fd, "input") || "{}"),
      idempotencyKey: `op:${crypto.randomUUID()}`,
    });
    return { message: "Proposed to the customer for confirmation." };
  });
}
export async function takeEscalationAction(_p: ActionResult, fd: FormData): R {
  return guard(async () => {
    await takeOwnership(db, await staffCtx(), str(fd, "id"));
    return { message: "You now own this escalation." };
  });
}
export async function resolveEscalationAction(_p: ActionResult, fd: FormData): R {
  return guard(async () => {
    const note = str(fd, "note");
    if (!note) throw new AppError("VALIDATION", "Add a short note about what was done.");
    await resolveEscalation(db, await staffCtx(), str(fd, "id"), note, fd.get("returnToAutomation") === "on");
    return { message: "Escalation closed." };
  });
}
export async function advanceAction(_p: ActionResult, fd: FormData): R {
  return guard(async () => {
    const ctx = await staffCtx();
    if (ctx.actor.type !== "operator") throw forbidden();
    const r = await advance(db, ctx, str(fd, "caseRef"));
    return { message: `Workflow: ${r.status}` };
  });
}
export async function sweepAction(_p: ActionResult, _fd: FormData): R {
  return guard(async () => {
    const ctx = await staffCtx();
    if (ctx.actor.type !== "operator" || !["owner", "admin", "approver"].includes(ctx.actor.role))
      throw forbidden();
    const r = await sweepTimeouts(db, ctx.orgId);
    return { message: `Checked ${r.checked} waiting workflows.` };
  });
}
export async function issuePortalLinkAction(
  _p: ActionResult & { link?: string },
  fd: FormData,
): Promise<ActionResult & { link?: string }> {
  const r = await guard(async () => {
    const ctx = await staffCtx();
    if (ctx.actor.type !== "operator") throw forbidden();
    const { requirePermission } = await import("@/domain/rbac");
    requirePermission(ctx.actor.role, "case.write");
    const { issueAccessGrant } = await import("@/domain/channel");
    const { findCase } = await import("@/domain/cases");
    const c = await findCase(db, ctx, str(fd, "caseId"));
    const { token } = await issueAccessGrant(db, {
      orgId: ctx.orgId,
      customerId: c.customerId,
      caseId: c.id,
      via: "operator",
      ttlMinutes: 60 * 24,
    });
    await audit(db, ctx, { action: "grant.issue", targetType: "case", targetId: c.id });
    return {
      data: `/portal/access/${token}`,
      message: "Approved case-access link created (valid 24 hours).",
    };
  });
  return { ...r, link: (r as { data?: string }).data };
}

/* ===================================================== admin */
export async function updateOrgAction(_p: ActionResult, fd: FormData): R {
  return guard(async () => {
    const ctx = await staffCtx();
    const accent = str(fd, "accent");
    await admin.updateOrganization(db, ctx, {
      name: str(fd, "name"),
      branding: {
        displayName: str(fd, "displayName") || undefined,
        supportEmail: str(fd, "supportEmail") || undefined,
        accent: accent || undefined,
      },
      settings: {
        retentionDays: Number(fd.get("retentionDays")),
        approvalThresholdCents: Math.round(Number(fd.get("approvalThreshold")) * 100),
        emailNotifications: fd.get("emailNotifications") === "on",
        auditRetentionDays: Number(fd.get("auditRetentionDays")),
      },
    });
    return { message: "Organization settings saved." };
  });
}
export async function inviteAction(
  _p: ActionResult & { link?: string },
  fd: FormData,
): Promise<ActionResult & { link?: string }> {
  const r = await guard(async () => {
    const { token } = await admin.createInvitation(
      db,
      await staffCtx(),
      str(fd, "email"),
      str(fd, "role") as OrgRole,
    );
    return { data: `/invite/${token}`, message: "Invitation created. Copy the link now — it is shown once." };
  });
  return { ...r, link: (r as { data?: string }).data };
}
export async function roleAction(_p: ActionResult, fd: FormData): R {
  return guard(async () => {
    await admin.changeMemberRole(db, await staffCtx(), str(fd, "userId"), str(fd, "role") as OrgRole);
    return { message: "Role updated." };
  });
}
export async function deactivateAction(_p: ActionResult, fd: FormData): R {
  return guard(async () => {
    await admin.deactivateMember(db, await staffCtx(), str(fd, "userId"));
    return { message: "Member deactivated." };
  });
}
export async function createKeyAction(
  _p: ActionResult & { secret?: string },
  fd: FormData,
): Promise<ActionResult & { secret?: string }> {
  const r = await guard(async () => {
    const out = await admin.createApiKey(
      db,
      await staffCtx(),
      str(fd, "name") || "API key",
      fd.getAll("scopes").map(String),
    );
    return {
      data: out.secret,
      message: "Key created. Copy it now — it is shown once and cannot be recovered.",
    };
  });
  return { ...r, secret: (r as { data?: string }).data };
}
export async function revokeKeyAction(_p: ActionResult, fd: FormData): R {
  return guard(async () => {
    await admin.revokeApiKey(db, await staffCtx(), str(fd, "id"));
    return { message: "Key revoked." };
  });
}
export async function simModeAction(_p: ActionResult, fd: FormData): R {
  return guard(async () => {
    await admin.setSimulatorMode(
      db,
      await staffCtx(),
      str(fd, "mode") as SimMode,
      Number(fd.get("delayMs") ?? 400),
    );
    return { message: "Simulator mode updated." };
  });
}
export async function policyDraftAction(_p: ActionResult, fd: FormData): R {
  return guard(async () => {
    let rules: Record<string, string | number | boolean> = {};
    try {
      rules = JSON.parse(str(fd, "rules") || "{}");
    } catch {
      throw new AppError("VALIDATION", 'Rules must be valid JSON, e.g. {"billing.review_window_days": 60}');
    }
    const r = await createPolicyVersion(db, await staffCtx(), {
      documentKey: str(fd, "documentKey"),
      title: str(fd, "title") || undefined,
      body: str(fd, "body"),
      rules,
      topics: str(fd, "topics")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
    return {
      message: r.quarantinedSections.length
        ? `Draft saved, but ${r.quarantinedSections.length} section(s) look like instructions to an AI system and are quarantined. It cannot be approved until they are rewritten.`
        : `Draft v${r.version.version} saved.`,
    };
  });
}
export async function policyStepAction(_p: ActionResult, fd: FormData): R {
  return guard(async () => {
    const ctx = await staffCtx();
    const id = str(fd, "id");
    const step = str(fd, "step");
    if (step === "submit") await submitForReview(db, ctx, id);
    else if (step === "approve") await approvePolicyVersion(db, ctx, id, str(fd, "comment") || undefined);
    else if (step === "reject")
      await rejectPolicyVersion(db, ctx, id, str(fd, "comment") || "Changes requested");
    return {
      message:
        step === "approve"
          ? "Approved and live. The previous version is superseded."
          : step === "submit"
            ? "Submitted for review."
            : "Sent back for changes.",
    };
  });
}
export async function workflowSaveAction(_p: ActionResult, fd: FormData): R {
  return guard(async () => {
    let spec: unknown;
    try {
      spec = JSON.parse(str(fd, "spec"));
    } catch {
      throw new AppError("VALIDATION", "The workflow definition is not valid JSON.");
    }
    const v = await admin.saveWorkflowDraft(db, await staffCtx(), spec);
    return { message: `Draft v${v.version} saved and validated. A different person must publish it.` };
  });
}
export async function workflowPublishAction(_p: ActionResult, fd: FormData): R {
  return guard(async () => {
    await admin.publishWorkflowVersion(db, await staffCtx(), str(fd, "id"));
    return { message: "Published. New cases use this version; running cases keep theirs." };
  });
}
export async function changePlanAction(_p: ActionResult, fd: FormData): R {
  return guard(async () => {
    await changePlan(db, await staffCtx(), str(fd, "plan"));
    return { message: "Plan changed (TEST billing — no card, no charge)." };
  });
}
export async function cancelSubscriptionAction(_p: ActionResult, _fd: FormData): R {
  return guard(async () => {
    await cancelSubscription(db, await staffCtx());
    return { message: "Subscription cancelled (test mode)." };
  });
}
