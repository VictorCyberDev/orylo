import { WorkflowSpecSchema, type WorkflowSpec } from "./spec";

/** Built-in, versioned workflow definitions seeded as PUBLISHED v1. Edit via Admin → Workflows (creates a new version). */
const raw: unknown[] = [
  {
    key: "failed-cancellation-billing-recovery",
    name: "Failed Cancellation & Billing Recovery",
    category: "failed_cancellation",
    description: "Customer asked to cancel, was charged again. Discover the earlier request, check account state, apply governed correction with consent, open a billing review, verify each outcome independently.",
    trigger: { event: "case.opened", category: "failed_cancellation" },
    policyAuthority: ["cancellation.correction_allowed", "cancellation.correction_window_days", "billing.review_allowed", "billing.review_window_days", "refund.automatic_refund_allowed"],
    objectives: [
      { key: "stop_future_billing", label: "Future billing stopped (cancellation applied)" },
      { key: "billing_review_submitted", label: "Billing review opened for the charge" },
      { key: "charge_disposition", label: "Billing team decision on the charge" },
    ],
    start: "diagnose",
    nodes: [
      { id: "diagnose", type: "lookup", label: "Check account, earlier cancellation and charges", source: "subscription_diagnosis", next: "triage", retry: { maxAttempts: 2 }, onError: "esc_lookup_failed" },
      {
        id: "triage", type: "decision", label: "Is a safe, permitted correction available?",
        branches: [
          { when: [{ path: "$.findings.accountFound", op: "eq", value: false }], next: "esc_no_account" },
          { when: [{ path: "$.findings.disputedCharge", op: "falsy" }], next: "esc_no_charge" },
          { when: [{ path: "$.findings.priorCancellationFound", op: "eq", value: true }, { path: "$.findings.accountStillActive", op: "eq", value: true }], next: "propose_both" },
          { when: [{ path: "$.findings.accountStillActive", op: "eq", value: false }], next: "na_cancel" },
        ],
        default: "esc_no_safe_action",
      },
      { id: "na_cancel", type: "set_objective", label: "Account already cancelled", objectiveKey: "stop_future_billing", status: "NOT_APPLICABLE", detail: "Account was already cancelled; only the charge needs review.", next: "propose_review" },
      {
        id: "propose_both", type: "propose_actions", label: "Propose cancellation correction and billing review",
        actions: [
          { operation: "subscription.correct_cancellation", input: { accountNumber: "$.accountNumber" } },
          { operation: "subscription.create_billing_review", input: { accountNumber: "$.accountNumber", chargeId: "$.findings.disputedCharge.id" } },
        ],
        next: "wait_outcomes",
      },
      {
        id: "propose_review", type: "propose_actions", label: "Propose billing review",
        actions: [{ operation: "subscription.create_billing_review", input: { accountNumber: "$.accountNumber", chargeId: "$.findings.disputedCharge.id" } }],
        next: "wait_outcomes",
      },
      { id: "wait_outcomes", type: "await_objectives", label: "Wait for verified outcomes", objectives: ["stop_future_billing", "billing_review_submitted", "charge_disposition"], timeoutHours: 168, onTimeout: "esc_timeout", next: "done" },
      { id: "done", type: "end", label: "Resolved with verified outcomes", outcome: "RESOLVED" },
      { id: "esc_no_account", type: "escalate", label: "Account not found", reasonCode: "ACCOUNT_NOT_FOUND", reason: "We could not find a matching subscription account for this customer.", queueKey: "escalations", next: "handed" },
      { id: "esc_no_charge", type: "escalate", label: "No disputed charge found", reasonCode: "NO_CHARGE_FOUND", reason: "No recent charge was found to dispute; a person should confirm what happened.", queueKey: "escalations", next: "handed" },
      { id: "esc_no_safe_action", type: "escalate", label: "No safe automatic action", reasonCode: "NO_SAFE_ACTION", reason: "The account state does not match a pattern we are allowed to fix automatically.", queueKey: "escalations", next: "handed" },
      { id: "esc_lookup_failed", type: "escalate", label: "Provider lookup failed", reasonCode: "LOOKUP_FAILED", reason: "The subscription provider could not be read after retries.", queueKey: "escalations", next: "handed" },
      { id: "esc_timeout", type: "escalate", label: "Outcomes not confirmed in time", reasonCode: "TIMEOUT", reason: "Verified outcomes were not reached within the allowed time.", queueKey: "escalations", next: "handed" },
      { id: "handed", type: "end", label: "Handed to a person", outcome: "HANDED_OFF" },
    ],
  },
  {
    key: "missed-appointment-recovery",
    name: "Missed Service Appointment Recovery",
    category: "missed_appointment",
    description: "A technician or service visit did not happen. Collect details, confirm it was missed, hand a structured reschedule request to the scheduling team, and track a human-confirmed new slot. No external scheduling system is integrated.",
    trigger: { event: "case.opened", category: "missed_appointment" },
    policyAuthority: ["service.reschedule_allowed"],
    objectives: [
      { key: "reschedule_requested", label: "Scheduling team has your request" },
      { key: "new_appointment_confirmed", label: "New appointment confirmed by a person" },
    ],
    start: "collect",
    nodes: [
      { id: "collect", type: "collect_info", label: "Appointment details", fields: [
        { key: "appointmentDate", label: "Date of the missed appointment", type: "date", required: true },
        { key: "preferredWindows", label: "When could we come instead? (one per line)", type: "text_list", required: true },
        { key: "contactMethod", label: "How should the scheduling team contact you?", type: "choice", options: ["email", "phone"], required: true },
      ], next: "check_missed" },
      { id: "check_missed", type: "decision", label: "Was the appointment in the past?", branches: [{ when: [{ path: "$.answers.appointmentIsPast", op: "eq", value: true }], next: "propose" }], default: "esc_not_missed" },
      { id: "propose", type: "propose_actions", label: "Propose a reschedule request", actions: [{ operation: "internal.create_reschedule_request", input: { preferredWindows: "$.answers.preferredWindows", contactMethod: "$.answers.contactMethod" } }], next: "wait" },
      { id: "wait", type: "await_objectives", label: "Wait for a confirmed slot", objectives: ["reschedule_requested", "new_appointment_confirmed"], timeoutHours: 72, onTimeout: "esc_timeout", next: "done" },
      { id: "done", type: "end", label: "New appointment confirmed", outcome: "RESOLVED" },
      { id: "esc_not_missed", type: "escalate", label: "Appointment is not in the past", reasonCode: "NOT_MISSED", reason: "The appointment date is not in the past; a person should check the booking.", queueKey: "field-scheduling", next: "handed" },
      { id: "esc_timeout", type: "escalate", label: "No slot confirmed in time", reasonCode: "TIMEOUT", reason: "No new appointment was confirmed in time.", queueKey: "field-scheduling", next: "handed" },
      { id: "handed", type: "end", label: "Handed to a person", outcome: "HANDED_OFF" },
    ],
  },
  {
    key: "warranty-claim-readiness",
    name: "Warranty Claim Readiness",
    category: "warranty_claim",
    description: "Collect device details and proof of purchase, check the warranty window from approved policy, assemble a complete claim packet and hand it to the claims team. Orylo does not submit to a manufacturer or insurer system.",
    trigger: { event: "case.opened", category: "warranty_claim" },
    policyAuthority: ["warranty.coverage_months"],
    objectives: [
      { key: "claim_packet_ready", label: "Claim packet complete and with the claims team" },
      { key: "external_claim_submission", label: "Submitted to external claims system", required: false },
    ],
    start: "na_external",
    nodes: [
      { id: "na_external", type: "set_objective", label: "No external claims system connected", objectiveKey: "external_claim_submission", status: "NOT_APPLICABLE", detail: "No external claims system is connected; the claims team submits manually.", next: "collect" },
      { id: "collect", type: "collect_info", label: "Device and purchase details", fields: [
        { key: "serialNumber", label: "Device serial number", type: "text", required: true },
        { key: "purchaseDate", label: "Purchase date", type: "date", required: true },
        { key: "issue", label: "What is wrong? (at least 10 characters)", type: "text", required: true },
        { key: "proof", label: "Proof of purchase (upload on this page)", type: "evidence", required: true },
      ], next: "propose" },
      { id: "propose", type: "propose_actions", label: "Propose assembling the claim packet", actions: [{ operation: "internal.assemble_claim_packet", input: { serialNumber: "$.answers.serialNumber", purchaseDate: "$.answers.purchaseDate", issue: "$.answers.issue" } }], next: "wait" },
      { id: "wait", type: "await_objectives", label: "Wait for verified packet", objectives: ["claim_packet_ready"], timeoutHours: 72, onTimeout: "esc_timeout", next: "done" },
      { id: "done", type: "end", label: "Claim packet verified and handed over", outcome: "RESOLVED" },
      { id: "esc_timeout", type: "escalate", label: "Packet not completed in time", reasonCode: "TIMEOUT", reason: "The claim packet was not completed in time.", queueKey: "claims-review", next: "handed" },
      { id: "handed", type: "end", label: "Handed to a person", outcome: "HANDED_OFF" },
    ],
  },
];

export const BUILTIN_WORKFLOWS: WorkflowSpec[] = raw.map((r) => WorkflowSpecSchema.parse(r));
