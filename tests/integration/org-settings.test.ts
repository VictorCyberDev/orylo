import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, freshWorld, op } from "../helpers";
import type { World } from "@/seed/world";
import { organizations } from "@/db/schema";
import { updateOrganization } from "@/domain/admin";

let w: World;
beforeEach(async () => {
  w = await freshWorld();
});
const org = async () => (await db.select().from(organizations).where(eq(organizations.id, w.orgs.nf)))[0];

describe("organization settings on a plan without custom branding (found by browser journey)", () => {
  it("saving other settings works when branding is posted back unchanged", async () => {
    const o = await org();
    const settings = { ...o.settings, approvalThresholdCents: 6000 };
    await updateOrganization(db, op(w, "nfOwner"), { name: o.name, branding: o.branding, settings });
    expect((await org()).settings.approvalThresholdCents).toBe(6000);
  });
  it("actually changing the accent colour or display name still requires the entitlement", async () => {
    const o = await org();
    await expect(
      updateOrganization(db, op(w, "nfOwner"), {
        name: o.name,
        branding: { ...o.branding, accent: "#123456" },
        settings: o.settings,
      }),
    ).rejects.toThrow(/custom branding/);
    await expect(
      updateOrganization(db, op(w, "nfOwner"), {
        name: o.name,
        branding: { ...o.branding, displayName: "Sneaky Co" },
        settings: o.settings,
      }),
    ).rejects.toThrow(/custom branding/);
    expect((await org()).branding).toEqual(o.branding);
  });
  it("only roles with org.manage can change settings at all", async () => {
    const o = await org();
    await expect(
      updateOrganization(db, op(w, "nfOperator"), {
        name: o.name,
        branding: o.branding,
        settings: o.settings,
      }),
    ).rejects.toThrow();
  });
});
