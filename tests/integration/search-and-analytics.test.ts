import { beforeEach, describe, expect, it } from "vitest";
import { db, freshWorld, op, cust, openRecoveryCase } from "../helpers";
import type { World } from "@/seed/world";
import { assignCase, listCases, setPriority, transitionCase } from "@/domain/cases";
import { computeAnalytics } from "@/domain/analytics";
import { openWorkflowCase } from "@/workflows/engine";

let w: World;
beforeEach(async () => {
  w = await freshWorld();
});

describe("search and filtering (operator list)", () => {
  async function setup() {
    const a = await openRecoveryCase(w, "jordan"); // READY_FOR_ACTION
    const b = await openRecoveryCase(w, "elena"); // ESCALATED
    const c = await openRecoveryCase(w, "marcus"); // READY_FOR_ACTION
    await setPriority(db, op(w), a.row.id, "urgent");
    await assignCase(db, op(w), c.row.id, w.users.nfOperator.id);
    return { a, b, c };
  }

  it("filters by text (reference, title, customer name, email), state, priority, assignee and category", async () => {
    const { a, b, c } = await setup();
    const q = async (f: Parameters<typeof listCases>[2]) =>
      (await listCases(db, op(w), f)).rows.map((r) => r.reference).sort();
    expect(await q({})).toEqual([a.row.reference, b.row.reference, c.row.reference].sort());
    expect(await q({ q: "jordan" })).toEqual([a.row.reference]);
    expect(await q({ q: "ELENA.ROSSI@customer" })).toEqual([b.row.reference]); // case-insensitive, email
    expect(await q({ q: a.row.reference })).toEqual([a.row.reference]);
    expect(await q({ states: ["ESCALATED"] })).toEqual([b.row.reference]);
    expect(await q({ states: ["ESCALATED", "READY_FOR_ACTION"] })).toHaveLength(3);
    expect(await q({ priority: ["urgent"] })).toEqual([a.row.reference]);
    expect(await q({ assigneeUserId: w.users.nfOperator.id })).toEqual([c.row.reference]);
    expect(await q({ assigneeUserId: "unassigned" })).toHaveLength(2);
    expect(await q({ category: "failed_cancellation" })).toHaveLength(3);
    expect(await q({ category: "warranty_claim" })).toEqual([]);
    expect(await q({ q: "nobody-by-this-name" })).toEqual([]);
  });

  it("treats LIKE wildcards in the search box literally (no accidental match-all)", async () => {
    await setup();
    expect((await listCases(db, op(w), { q: "%" })).total).toBe(0);
    expect((await listCases(db, op(w), { q: "_" })).total).toBe(0);
  });

  it("filters by opened date range and paginates with stable totals", async () => {
    await setup();
    const future = new Date(Date.now() + 86_400_000);
    expect((await listCases(db, op(w), { from: future })).total).toBe(0);
    expect((await listCases(db, op(w), { to: new Date(Date.now() - 86_400_000) })).total).toBe(0);
    const p1 = await listCases(db, op(w), { limit: 2, offset: 0, sort: "opened" });
    const p2 = await listCases(db, op(w), { limit: 2, offset: 2, sort: "opened" });
    expect(p1.total).toBe(3);
    expect(p1.rows).toHaveLength(2);
    expect(p2.rows).toHaveLength(1);
    expect(new Set([...p1.rows, ...p2.rows].map((r) => r.id)).size).toBe(3);
  });

  it("sorts by priority (urgent first)", async () => {
    const { a } = await setup();
    expect((await listCases(db, op(w), { sort: "priority" })).rows[0].reference).toBe(a.row.reference);
  });

  it("customers are always scoped to themselves regardless of filters", async () => {
    await setup();
    const r = await listCases(db, cust(w, "jordan"), { q: "elena", category: "failed_cancellation" });
    expect(r.total).toBe(0);
    expect((await listCases(db, cust(w, "jordan"), {})).total).toBe(1);
  });
});

describe("analytics: repeat contact, reopen, partial, aging, by-category — from stored rows", () => {
  it("computes repeat-contact, reopened and category/aging figures exactly", async () => {
    const j1 = await openRecoveryCase(w, "jordan");
    await openWorkflowCase(db, cust(w, "jordan"), {
      workflowKey: "missed-appointment-recovery",
      customerId: w.customers.jordan.id,
      title: "second contact",
    });
    await openRecoveryCase(w, "marcus");
    await transitionCase(db, j1.ctx, j1.row.id, { to: "CANCELLED" });
    await transitionCase(db, j1.ctx, j1.row.id, { to: "REOPENED", message: "again" });
    const a = (await computeAnalytics(db, op(w, "nfAnalyst"))).measured;
    expect(a.cases.total).toBe(3);
    expect(a.repeatContact).toMatchObject({ customersWithMultipleCases: 1, customers: 2 });
    expect(a.repeatContact.ratePct).toBe(50);
    expect(a.reopenedCases).toBe(1);
    expect(a.reopenRatePct).toBeCloseTo(33.3, 1);
    expect(a.byCategory.map((c) => [c.category, c.total]).sort()).toEqual([
      ["failed_cancellation", 2],
      ["missed_appointment", 1],
    ]);
    expect(a.aging.find((x) => x.bucket === "< 1 day")?.count).toBe(3);
    expect(a.cases.open).toBe(3);
    expect(a.timeToVerifiedResolutionHours).toBeNull(); // no resolved cases → no invented number
  });
});
