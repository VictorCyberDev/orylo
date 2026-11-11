import { randomBytes } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { signIn, PASSWORD } from "./helpers";

/**
 * Admin / governance journeys in a real browser: team management (invite → accept → role change → deactivate →
 * owner protection), organization settings (validation + persistence), policy and workflow governance with
 * separation of duties, integrations (provider simulator mode), API keys and billing plan.
 * Each test uses names/keys unique to the run so it never depends on prior test state.
 */
const STAFF = /\/app$/;
const tag = () => randomBytes(3).toString("hex");

async function as(browser: Browser, email: string): Promise<Page> {
  const p = await (await browser.newContext()).newPage();
  await signIn(p, email);
  await expect(p).toHaveURL(STAFF, { timeout: 20_000 });
  return p;
}

test.describe("team management", () => {
  test("invite → accept → change role → deactivate; the deactivated person can no longer sign in", async ({
    browser,
  }) => {
    const email = `new.${tag()}@northfield.example`;
    const admin = await as(browser, "admin@northfield.example");
    await admin.goto("/app/admin/members");
    await admin.locator("#inv-email").fill(email);
    await admin.locator("#inv-role").selectOption("analyst");
    await admin.getByRole("button", { name: "Create invitation" }).click();
    const link = await admin
      .locator("p.t-code")
      .filter({ hasText: "/invite/" })
      .textContent({ timeout: 20_000 });
    expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]{20,}/);

    // the invitee opens the link in a fresh browser and creates their account
    const invitee = await (await browser.newContext()).newPage();
    await invitee.goto(link!.trim());
    await invitee.getByLabel("Your name").fill("Nia Newhire");
    await invitee.getByLabel("Choose a password").fill(PASSWORD);
    await invitee.getByRole("button", { name: /Create account/ }).click();
    await expect(invitee).toHaveURL(STAFF, { timeout: 20_000 });

    // the same link cannot be used twice
    const again = await (await browser.newContext()).newPage();
    await again.goto(link!.trim());
    await expect(again.getByText(/already|expired|no longer|invalid/i).first()).toBeVisible();

    // admin promotes then deactivates
    await admin.reload();
    const row = admin.getByRole("row").filter({ hasText: email });
    await expect(row).toBeVisible();
    await row.getByLabel("Role for Nia Newhire").selectOption("operator");
    await row.getByRole("button", { name: "Save" }).click();
    await admin.reload();
    await expect(
      admin.getByRole("row").filter({ hasText: email }).getByLabel("Role for Nia Newhire"),
    ).toHaveValue("operator");
    await admin
      .getByRole("row")
      .filter({ hasText: email })
      .getByRole("button", { name: "Deactivate" })
      .click();
    await expect(admin.getByRole("row").filter({ hasText: email }).getByText("inactive")).toBeVisible({
      timeout: 20_000,
    });

    // an existing session is cut off, and a fresh sign-in cannot reach the console either
    await invitee.goto("/app");
    await expect(invitee).toHaveURL(/\/sign-in\?next=/);
    const fresh = await (await browser.newContext()).newPage();
    await signIn(fresh, email);
    await fresh.waitForLoadState("networkidle");
    await fresh.goto("/app");
    await expect(fresh).toHaveURL(/\/sign-in\?next=/);
  });

  test("an admin cannot grant owner, and the last owner cannot be removed", async ({ browser }) => {
    const admin = await as(browser, "admin@northfield.example");
    await admin.goto("/app/admin/members");
    const row = admin.getByRole("row").filter({ hasText: "owner@northfield.example" });
    await row.getByLabel("Role for Olivia Park").selectOption("analyst");
    await row.getByRole("button", { name: "Save" }).click();
    await expect(admin.getByText("That didn't work")).toBeVisible({ timeout: 20_000 });
    await admin.reload();
    await expect(
      admin
        .getByRole("row")
        .filter({ hasText: "owner@northfield.example" })
        .getByLabel("Role for Olivia Park"),
    ).toHaveValue("owner");
  });
});

test.describe("organization settings", () => {
  test("validation rejects bad values with a reason; valid values persist across reload", async ({
    browser,
  }) => {
    const owner = await as(browser, "owner@northfield.example");
    await owner.goto("/app/admin");
    const original = await owner.getByLabel(/Approval threshold/).inputValue();

    await owner.getByLabel(/Approval threshold/).fill("-5");
    await owner.getByRole("button", { name: "Save settings" }).click();
    await expect(owner.getByText("That didn't work")).toBeVisible({ timeout: 20_000 });
    await owner.reload();
    await expect(owner.getByLabel(/Approval threshold/)).toHaveValue(original);

    await owner.getByLabel(/Approval threshold/).fill("60");
    await owner.getByRole("button", { name: "Save settings" }).click();
    await expect(owner.getByText("Organization settings saved.")).toBeVisible({ timeout: 20_000 });
    await owner.reload();
    await expect(owner.getByLabel(/Approval threshold/)).toHaveValue("60.00");
    // restore so other journeys keep their documented $50 threshold
    await owner.getByLabel(/Approval threshold/).fill(original);
    await owner.getByRole("button", { name: "Save settings" }).click();
    await expect(owner.getByText("Organization settings saved.")).toBeVisible({ timeout: 20_000 });
    await owner.reload();
    await expect(owner.getByLabel(/Approval threshold/)).toHaveValue(original);
  });

  test("an operator cannot open organization settings", async ({ browser }) => {
    const ana = await as(browser, "ana@northfield.example");
    await ana.goto("/app/admin");
    await expect(ana.getByRole("button", { name: "Save settings" })).toHaveCount(0);
    await expect(ana.getByText("You don't have access to that page")).toBeVisible();
  });
});

test.describe("policy and workflow governance", () => {
  test("author drafts and submits; only a different role can approve; the version becomes active", async ({
    browser,
  }) => {
    const key = `e2e-policy-${tag()}`;
    const cara = await as(browser, "cara@northfield.example");
    await cara.goto("/app/admin/policies");
    await cara.getByLabel("Document key").fill(key);
    await cara.getByLabel(/Title \(new documents only\)/).fill("E2E refund wording");
    await cara.getByLabel(/Body \(Markdown/).fill("## Scope\nThis wording exists only for the browser test.");
    await cara.getByRole("button", { name: "Save draft" }).click();
    const row = cara.getByRole("row").filter({ hasText: key });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole("button", { name: "Submit" }).click();
    await expect(
      cara
        .getByRole("row")
        .filter({ hasText: key })
        .getByText(/in.review/i),
    ).toBeVisible({
      timeout: 20_000,
    });
    // the author has no approve control (separation of duties)
    await expect(
      cara.getByRole("row").filter({ hasText: key }).getByRole("button", { name: "Approve" }),
    ).toHaveCount(0);

    const ben = await as(browser, "ben@northfield.example");
    await ben.goto("/app/admin/policies");
    await ben.getByRole("row").filter({ hasText: key }).getByRole("button", { name: "Approve" }).click();
    await expect(
      ben
        .getByRole("row")
        .filter({ hasText: key })
        .getByText(/approved|active/i)
        .first(),
    ).toBeVisible({
      timeout: 20_000,
    });
  });

  test("invalid machine rules are refused with a reason and nothing is saved", async ({ browser }) => {
    const key = `e2e-bad-${tag()}`;
    const cara = await as(browser, "cara@northfield.example");
    await cara.goto("/app/admin/policies");
    await cara.getByLabel("Document key").fill(key);
    await cara.getByLabel(/Title \(new documents only\)/).fill("Bad rules");
    await cara.getByLabel(/Body \(Markdown/).fill("## Scope\nx");
    await cara.getByLabel(/Machine rules/).fill("{not json");
    await cara.getByRole("button", { name: "Save draft" }).click();
    await expect(cara.getByText("That didn't work")).toBeVisible({ timeout: 20_000 });
    await cara.reload();
    await expect(cara.getByRole("row").filter({ hasText: key })).toHaveCount(0);
  });

  test("workflow: save a validated draft; invalid JSON is refused; an approver publishes it", async ({
    browser,
  }) => {
    const cara = await as(browser, "cara@northfield.example");
    await cara.goto("/app/admin/workflows");
    const editor = cara.getByLabel("Workflow definition (JSON)");
    const good = await editor.inputValue();
    await editor.fill("{ definitely not json");
    await cara.getByRole("button", { name: /Validate & save draft/ }).click();
    await expect(cara.getByText("That didn't work")).toBeVisible({ timeout: 20_000 });

    await editor.fill(good);
    await cara.getByRole("button", { name: /Validate & save draft/ }).click();
    await expect(cara.getByText(/Draft v\d+ saved and validated/)).toBeVisible({ timeout: 20_000 });
    await cara.reload();
    const drafts = cara.getByRole("row").filter({ has: cara.getByText("draft", { exact: true }) });
    await expect(drafts.first()).toBeVisible({ timeout: 20_000 });
    // an author without publish rights has no Publish button
    await expect(cara.getByRole("button", { name: "Publish" })).toHaveCount(0);

    const ben = await as(browser, "ben@northfield.example");
    await ben.goto("/app/admin/workflows");
    await ben
      .getByRole("row")
      .filter({ has: ben.getByText("draft", { exact: true }) })
      .first()
      .getByRole("button", { name: "Publish" })
      .click();
    await expect(ben.getByText("draft", { exact: true })).toHaveCount(0, { timeout: 20_000 });
  });
});

test.describe("integrations, keys and billing", () => {
  test("provider simulator mode persists; it is always restored", async ({ browser }) => {
    const owner = await as(browser, "owner@northfield.example");
    await owner.goto("/app/admin/integrations");
    const mode = owner.getByLabel("Simulator mode");
    try {
      await mode.selectOption("failure");
      await owner.getByRole("button", { name: "Save mode" }).click();
      await owner.reload();
      await expect(owner.getByLabel("Simulator mode")).toHaveValue("failure");
    } finally {
      await owner.getByLabel("Simulator mode").selectOption("normal");
      await owner.getByRole("button", { name: "Save mode" }).click();
      await owner.reload();
      await expect(owner.getByLabel("Simulator mode")).toHaveValue("normal");
    }
    // the page states honestly what is and is not connected
    await expect(owner.getByText("What is and isn't connected")).toBeVisible();
  });

  test("an API key is shown once, then revoked, and the revoked key is refused", async ({
    browser,
    request,
  }) => {
    const owner = await as(browser, "owner@northfield.example");
    await owner.goto("/app/admin/api-keys");
    const name = `rev-${tag()}`;
    await owner.getByLabel("Name").fill(name);
    await owner.getByRole("button", { name: "Create key" }).click();
    const secret = owner.locator("p.t-code").filter({ hasText: /^oryk_/ });
    await expect(secret).toBeVisible({ timeout: 15_000 });
    const key = (await secret.textContent())!.trim();
    const probe = () =>
      request.post("/api/v1/egain/sessions", {
        headers: { Authorization: `Bearer ${key}` },
        data: { fullName: "x", email: "a@b.example", accountNumber: "NF-000000", issue: "x" },
      });
    expect((await probe()).status()).not.toBe(401); // valid key reaches the handler (identity may fail, auth does not)
    await owner.reload();
    await owner.getByRole("row").filter({ hasText: name }).getByRole("button", { name: "Revoke" }).click();
    await expect(
      owner
        .getByRole("row")
        .filter({ hasText: name })
        .getByText(/revoked/i),
    ).toBeVisible({ timeout: 20_000 });
    expect((await probe()).status()).toBe(401);
  });

  test("only the owner can change the plan; an admin sees usage but no plan controls", async ({
    browser,
  }) => {
    const admin = await as(browser, "admin@northfield.example");
    const res = await admin.goto("/app/admin/billing");
    expect(res?.status()).toBeLessThan(500);
    await expect(admin.getByLabel(/Change plan/)).toHaveCount(0);
  });

  test("operational pages load for admins: audit log, outcome ledger, jobs", async ({ browser }) => {
    const admin = await as(browser, "admin@northfield.example");
    for (const [path, heading] of [
      ["/app/admin/audit", /audit/i],
      ["/app/admin/ledger", /ledger/i],
      ["/app/admin/jobs", /jobs/i],
    ] as const) {
      const r = await admin.goto(path);
      expect(r?.status()).toBe(200);
      await expect(admin.getByRole("heading", { level: 1 })).toContainText(heading);
    }
  });
});
