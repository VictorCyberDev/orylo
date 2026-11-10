import type { CaseState } from "@/db/schema";

export const CASE_STATES = [
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
] as const satisfies readonly CaseState[];

export type ActorKind = "customer" | "operator" | "system";
const C: ActorKind = "customer";
const O: ActorKind = "operator";
const S: ActorKind = "system";

/**
 * Legal transitions and which actor kinds may perform them.
 * Anything not listed is illegal. VERIFIED_RESOLVED is reachable only by `system` and is additionally
 * guarded by a database trigger requiring verified ledger evidence + verified required objectives.
 */
export const TRANSITIONS: Record<CaseState, Partial<Record<CaseState, ActorKind[]>>> = {
  OPEN: {
    INVESTIGATING: [S, O],
    AWAITING_CUSTOMER_INFORMATION: [S, O],
    BLOCKED: [S, O],
    ESCALATED: [C, O, S],
    CANCELLED: [C, O],
  },
  INVESTIGATING: {
    READY_FOR_ACTION: [S, O],
    AWAITING_CUSTOMER_INFORMATION: [S, O],
    BLOCKED: [S, O],
    ESCALATED: [C, O, S],
    FAILED: [S, O],
    CANCELLED: [C, O],
  },
  AWAITING_CUSTOMER_INFORMATION: { INVESTIGATING: [C, S, O], ESCALATED: [C, O, S], CANCELLED: [C, O] },
  READY_FOR_ACTION: {
    AWAITING_APPROVAL: [S, O],
    ACTION_PENDING: [C, O, S],
    INVESTIGATING: [S, O],
    ESCALATED: [C, O, S],
    CANCELLED: [C, O],
  },
  AWAITING_APPROVAL: {
    ACTION_PENDING: [O, S],
    READY_FOR_ACTION: [C, O, S],
    ESCALATED: [C, O, S],
    CANCELLED: [C, O],
  },
  ACTION_PENDING: { ACTION_EXECUTED: [S], READY_FOR_ACTION: [S, O], BLOCKED: [S], ESCALATED: [C, O, S] },
  ACTION_EXECUTED: { OUTCOME_PENDING_VERIFICATION: [S], ESCALATED: [C, O, S] },
  OUTCOME_PENDING_VERIFICATION: {
    VERIFIED_RESOLVED: [S],
    READY_FOR_ACTION: [S, O],
    FAILED: [S, O],
    ESCALATED: [C, O, S],
  },
  VERIFIED_RESOLVED: { REOPENED: [C, O] },
  BLOCKED: { INVESTIGATING: [S, O], ESCALATED: [C, O, S], CANCELLED: [C, O] },
  ESCALATED: {
    INVESTIGATING: [O, S],
    OUTCOME_PENDING_VERIFICATION: [O, S],
    BLOCKED: [O, S],
    CANCELLED: [C, O],
  },
  FAILED: { REOPENED: [C, O], ESCALATED: [C, O, S] },
  CANCELLED: { REOPENED: [C, O] },
  REOPENED: {
    INVESTIGATING: [S, O],
    AWAITING_CUSTOMER_INFORMATION: [S, O],
    ESCALATED: [C, O, S],
    CANCELLED: [C, O],
  },
};

export function allowedTargets(from: CaseState, actor: ActorKind): CaseState[] {
  return (Object.entries(TRANSITIONS[from]) as [CaseState, ActorKind[]][])
    .filter(([, kinds]) => kinds.includes(actor))
    .map(([to]) => to);
}

export function canTransition(from: CaseState, to: CaseState, actor: ActorKind): boolean {
  return !!TRANSITIONS[from]?.[to]?.includes(actor);
}

export const isTerminal = (s: CaseState) => s === "VERIFIED_RESOLVED" || s === "CANCELLED" || s === "FAILED";
export const isOpenState = (s: CaseState) => !isTerminal(s);
/** States where something is waiting on a human (operator or customer). */
export const NEEDS_ATTENTION: CaseState[] = [
  "ESCALATED",
  "AWAITING_APPROVAL",
  "BLOCKED",
  "FAILED",
  "REOPENED",
  "AWAITING_CUSTOMER_INFORMATION",
];

export const STATE_LABEL: Record<CaseState, string> = {
  OPEN: "Open",
  INVESTIGATING: "Investigating",
  AWAITING_CUSTOMER_INFORMATION: "Needs your information",
  READY_FOR_ACTION: "Ready for action",
  AWAITING_APPROVAL: "Awaiting approval",
  ACTION_PENDING: "Action in progress",
  ACTION_EXECUTED: "Action done, verifying",
  OUTCOME_PENDING_VERIFICATION: "Verifying outcome",
  VERIFIED_RESOLVED: "Verified resolved",
  BLOCKED: "Blocked",
  ESCALATED: "With a human",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  REOPENED: "Reopened",
};
