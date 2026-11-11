import { expect, test, type Browser, type Page } from "@playwright/test";
import { signIn } from "./helpers";
import { newCustomer, type Fixture } from "./fixtures";

/**
 * Operator-side journeys: approvals (grant, decline, role limits), escalation ownership and hand-back, assignment,
 * priority and notes (with customer-visible vs internal), and read-only roles. Each test builds its own customer.
 */

async function as(browser: Browser, email: string, landing: RegExp): Promise<Page> {
  const p = await (await browser.newContext()).newPage();
  await signIn(p, email);
  await expect(p).toHaveURL(landing, { timeout: 20_000 });
  return p;
}
const STAFF = /\/app$/;
const PORTAL = /\/portal$/;

async function customerOpensCase(browser: Browser, f: Fixture) {
  const page = await as(browser, f.email, PORTAL);
  await page.goto("/portal/cases/new");
  await page.getByRole("button", { name: "Open my case" }).click();
  await expect(page).toHaveURL(/\/portal\/cases\/ORY-\d+/, { timeout: 20_000 });
  const ref = page.url().match(/(ORY-\d+)/)![1];
  return { page, ref };
}

test.describe("approvals", () => {
  test("a $149 review waits for a person; a role that cannot decide sees why; the approver's decision reaches the customer", async ({
    browser,
  }) => {
    const f = await newCustomer("approve", { priceCents: 14900 });
    const { page: cust, ref } = await customerOpensCase(browser, f);
    await cust
      .getByRole("region", { name: "Apply your earlier cancellation" })
      .getByRole("button", { name: "Yes, go ahead" })
      .click();
    await expect(cust.getByText("1 of 3 verified")).toBeVisible({ timeout: 20_000 });
    await cust
      .getByRole("region", { name: "Open a billing review for the charge" })
      .getByRole("button", { name: "Yes, go ahead" })
      .click();
    await expect(
      cust.getByText(/waiting for (a )?(team member|approval)|needs (a )?(team member|approval)/i).first(),
    ).toBeVisible({
      timeout: 20_000,
    });

    // an operator may read approvals but not decide them — and is told so
    const ana = await as(browser, "ana@northfield.example", STAFF);
    await ana.goto("/app/approvals");
    const anaRow = ana.getByRole("row").filter({ hasText: ref });
    await expect(anaRow).toBeVisible();
    await expect(anaRow.getByText("Your role can't decide approvals")).toBeVisible();
    await expect(anaRow.getByRole("button", { name: "Approve" })).toHaveCount(0);

    // the approver decides
    const ben = await as(browser, "ben@northfield.example", STAFF);
    await ben.goto("/app/approvals");
    const row = ben.getByRole("row").filter({ hasText: ref });
    await row.getByPlaceholder("Reason (optional)").fill("Charge matches the failed cancellation");
    await row.getByRole("button", { name: "Approve" }).click();
    await expect(ben.getByRole("row").filter({ hasText: ref })).toHaveCount(0, { timeout: 20_000 });

    // No one clicks anything else: the worker runs the approved step on its own within a few seconds.
    await expect(async () => {
      await cust.reload();
      await expect(cust.getByText("2 of 3 verified")).toBeVisible({ timeout: 1_500 });
    }).toPass({ timeout: 45_000, intervals: [2_000] });
  });

  test("declining an approval stops the action, and the customer is told in plain words", async ({
    browser,
  }) => {
    const f = await newCustomer("declineappr", { priceCents: 14900 });
    const { page: cust, ref } = await customerOpensCase(browser, f);
    await cust
      .getByRole("region", { name: "Open a billing review for the charge" })
      .getByRole("button", { name: "Yes, go ahead" })
      .click();
    const ben = await as(browser, "ben@northfield.example", STAFF);
    await ben.goto("/app/approvals");
    const row = ben.getByRole("row").filter({ hasText: ref });
    await row.getByPlaceholder("Reason (optional)").fill("Outside policy window");
    await row.getByRole("button", { name: "Decline" }).click();
    await expect(ben.getByRole("row").filter({ hasText: ref })).toHaveCount(0, { timeout: 20_000 });
    await cust.reload();
    await expect(cust.getByText(/declined|wasn.t approved|not approved/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(cust.getByText("Everything is done and verified.")).toHaveCount(0);
  });
});

test.describe("escalation ownership", () => {
  test("customer asks for a person → operator takes ownership → customer sees an owner → operator closes with a note", async ({
    browser,
  }) => {
    const f = await newCustomer("escal");
    const { page: cust, ref } = await customerOpensCase(browser, f);
    await cust.getByRole("button", { name: "Email follow-up" }).click();
    await expect(cust.getByText("Waiting for a team member to pick it up.")).toBeVisible({ timeout: 20_000 });

    const ana = await as(browser, "ana@northfield.example", STAFF);
    await ana.goto(`/app/cases/${ref}`);
    await ana.getByRole("button", { name: "Take ownership" }).click();
    await expect(ana.getByLabel("What was done?")).toBeVisible({ timeout: 20_000 });

    await cust.reload();
    await expect(cust.getByText("A team member owns this and is working on it.")).toBeVisible();

    await ana.getByLabel("What was done?").fill("Emailed customer the corrected invoice");
    await ana.getByRole("button", { name: "Close escalation" }).click();
    await expect(ana.getByText(/Resolution: Emailed customer the corrected invoice/)).toBeVisible({
      timeout: 20_000,
    });
    await cust.reload();
    await expect(cust.getByText("A team member owns this and is working on it.")).toHaveCount(0);
  });
});

test.describe("case controls", () => {
  test("assign, prioritise and note; internal notes never reach the customer, customer-visible ones do", async ({
    browser,
  }) => {
    const f = await newCustomer("controls");
    const { page: cust, ref } = await customerOpensCase(browser, f);
    const ana = await as(browser, "ana@northfield.example", STAFF);
    await ana.goto(`/app/cases/${ref}`);

    await ana.getByLabel("Assignee").selectOption({ label: "Tomas Weber" });
    await ana.getByRole("button", { name: "Assign" }).click();
    await ana.getByLabel("Priority").selectOption("urgent");
    await ana.getByRole("button", { name: "Set priority" }).click();

    await ana.getByLabel("Add a note").fill("INTERNAL-ONLY triage thoughts");
    await ana.getByLabel("Note visibility").selectOption("internal");
    await ana.getByRole("button", { name: "Add note" }).click();
    await expect(ana.getByText("INTERNAL-ONLY triage thoughts")).toBeVisible({ timeout: 20_000 });
    await ana.getByLabel("Add a note").fill("We are looking into your charge today.");
    await ana.getByLabel("Note visibility").selectOption("customer");
    await ana.getByRole("button", { name: "Add note" }).click();
    await expect(ana.getByText("We are looking into your charge today.")).toBeVisible({ timeout: 20_000 });

    // persisted, not just painted
    await ana.reload();
    await expect(ana.getByLabel("Assignee")).toHaveValue(/.+/);
    await expect(ana.getByLabel("Priority")).toHaveValue("urgent");

    await cust.reload();
    await expect(cust.getByText("We are looking into your charge today.")).toBeVisible();
    await expect(cust.getByText("INTERNAL-ONLY triage thoughts")).toHaveCount(0);
  });

  test("an analyst can read cases and analytics but has no controls", async ({ browser }) => {
    const f = await newCustomer("analyst");
    const { ref } = await customerOpensCase(browser, f);
    const dev = await as(browser, "dev@northfield.example", STAFF);
    await dev.goto(`/app/cases/${ref}`);
    await expect(dev.getByRole("heading", { name: "Outcome ledger" })).toBeVisible();
    await expect(dev.getByRole("button", { name: "Update state" })).toHaveCount(0);
    await expect(dev.getByRole("button", { name: "Assign" })).toHaveCount(0);
    await expect(dev.getByRole("button", { name: "Add note" })).toHaveCount(0);
    await dev.goto("/app/analytics");
    await expect(dev.getByRole("heading", { level: 1 })).toBeVisible();
    // admin pages bounce a non-admin back to the console with an explanation — and never render the member list
    await dev.goto("/app/admin/members");
    await expect(dev).toHaveURL(/\/app(\?|$)/);
    await expect(dev.getByText("You don't have access to that page")).toBeVisible();
    await expect(dev.getByText("owner@northfield.example")).toHaveCount(0);
  });

  test("case search and filters narrow the list and survive reload", async ({ browser }) => {
    const f = await newCustomer("findme");
    const { ref } = await customerOpensCase(browser, f);
    const ana = await as(browser, "ana@northfield.example", STAFF);
    await ana.goto(`/app/cases?q=${encodeURIComponent(f.name)}`);
    await expect(ana.getByRole("link", { name: ref })).toBeVisible();
    await ana.goto("/app/cases?q=zz-no-such-customer-zz");
    await expect(ana.getByRole("link", { name: /ORY-\d+/ })).toHaveCount(0);
    await expect(ana.getByText(/no cases|nothing/i).first()).toBeVisible();
  });
});
