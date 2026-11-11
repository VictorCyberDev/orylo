import { beforeEach, describe, expect, it } from "vitest";
import { db, freshWorld, op } from "../helpers";
import type { World } from "@/seed/world";
import { listAssignableMembers, listMembers } from "@/domain/admin";

let w: World;
beforeEach(async () => {
  w = await freshWorld();
});

describe("assignable members (found by browser journey: operators saw an empty Assignee list)", () => {
  it("an operator can list who a case can be assigned to — names only, own org only, active only", async () => {
    const list = await listAssignableMembers(db, op(w, "nfOperator"));
    const names = list.map((m) => m.name);
    expect(names).toContain("Tomas Weber");
    expect(names).not.toContain("Kira Voss"); // other organization
    expect(list.every((m) => Object.keys(m).sort().join() === "name,userId")).toBe(true); // no emails/roles leak
  });
  it("operators still cannot manage members, and roles without case.assign cannot list assignees", async () => {
    await expect(listMembers(db, op(w, "nfOperator"))).rejects.toThrow();
    await expect(listAssignableMembers(db, op(w, "nfAnalyst"))).rejects.toThrow();
    await expect(listAssignableMembers(db, op(w, "nfApprover"))).rejects.toThrow();
  });
});
