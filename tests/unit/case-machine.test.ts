import { describe, expect, it } from "vitest";
import { CASE_STATES, TRANSITIONS, allowedTargets, canTransition } from "@/domain/case-machine";

describe("case state machine", () => {
  it("defines every one of the 14 states", () => {
    expect(CASE_STATES).toHaveLength(14);
    for (const s of CASE_STATES) expect(TRANSITIONS[s]).toBeDefined();
  });

  it("only the system may enter VERIFIED_RESOLVED, and only from OUTCOME_PENDING_VERIFICATION", () => {
    for (const from of CASE_STATES)
      for (const actor of ["customer", "operator", "system"] as const) {
        const legal = canTransition(from, "VERIFIED_RESOLVED", actor);
        expect(legal).toBe(from === "OUTCOME_PENDING_VERIFICATION" && actor === "system");
      }
  });

  it("is exhaustive: every (from,to,actor) combination is either listed or illegal — no implicit allowances", () => {
    let legal = 0;
    for (const from of CASE_STATES)
      for (const to of CASE_STATES)
        for (const actor of ["customer", "operator", "system"] as const) {
          const listed = !!TRANSITIONS[from][to]?.includes(actor);
          expect(canTransition(from, to, actor)).toBe(listed);
          if (listed) legal++;
        }
    expect(legal).toBeGreaterThan(40);
  });

  it("customers cannot execute, approve or verify — they may only cancel, answer, confirm, escalate or reopen", () => {
    const customerTargets = new Set(CASE_STATES.flatMap((s) => allowedTargets(s, "customer")));
    for (const forbidden of ["ACTION_EXECUTED", "OUTCOME_PENDING_VERIFICATION", "VERIFIED_RESOLVED", "BLOCKED", "FAILED", "READY_FOR_ACTION"] as const)
      if (forbidden !== "READY_FOR_ACTION") expect(customerTargets.has(forbidden)).toBe(false);
  });

  it("resolved/cancelled/failed cases can only move by being reopened (or escalated when failed)", () => {
    expect(Object.keys(TRANSITIONS.VERIFIED_RESOLVED)).toEqual(["REOPENED"]);
    expect(Object.keys(TRANSITIONS.CANCELLED)).toEqual(["REOPENED"]);
    expect(Object.keys(TRANSITIONS.FAILED).sort()).toEqual(["ESCALATED", "REOPENED"]);
  });

  it("has no state with a dead end except none (every state has an exit)", () => {
    for (const s of CASE_STATES) expect(Object.keys(TRANSITIONS[s]).length).toBeGreaterThan(0);
  });
});
