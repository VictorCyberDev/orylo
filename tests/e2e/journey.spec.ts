import { expect, test } from "@playwright/test";
import { login, logout } from "./helpers";

const shot = (n: string) => `docs/evidence/screenshots/${n}.png`;

test.describe.serial("Scenario A+B+G — failed cancellation, end to end in a real browser", () => {
  test("customer: finds the facts, consents, sees verified vs pending, never 'resolved' early", async ({
    page,
  }) => {
    await login(page, "jordan.reyes@customer.example", /\/portal$/);
    await page.waitForTimeout(900); // let the verified seal finish drawing
    await page.screenshot({ path: shot("portal-dashboard"), fullPage: true });
    await page.getByRole("link", { name: "Start a case" }).first().click();
    await expect(page.getByRole("heading", { name: "Tell us what happened" })).toBeVisible();
    await page.getByRole("button", { name: "Open my case" }).click();
    await expect(page).toHaveURL(/\/portal\/cases\/ORY-\d+/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "What we know" })).toBeVisible();
    await expect(page.getByText("Found — received")).toBeVisible();
    await expect(page.getByText("What we don't know:")).toBeVisible();
    // nothing has changed yet, and nothing is claimed as verified
    await expect(page.getByText("0 of 3 verified")).toBeVisible();
    await page.waitForTimeout(900); // let the verified seal finish drawing
    await page.screenshot({ path: shot("portal-case-awaiting-consent"), fullPage: true });

    // 1) cancellation correction: exact consent wording shown, then verified by read-back
    const cancelCard = page.getByRole("region", { name: "Apply your earlier cancellation" });
    await expect(cancelCard.getByText(/I confirm I asked to cancel account NF-100234/)).toBeVisible();
    await cancelCard.getByRole("button", { name: "Yes, go ahead" }).click();
    await expect(page.getByText("1 of 3 verified")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("img", { name: "Verified" }).first()).toBeVisible();
    await expect(page.getByText(/Verified by read-back/)).toBeVisible();

    // 2) billing review → partial resolution, NOT resolved
    const reviewCard = page.getByRole("region", { name: "Open a billing review for the charge" });
    await reviewCard.getByRole("button", { name: "Yes, go ahead" }).click();
    await expect(page.getByText("2 of 3 verified")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/No money has moved/).first()).toBeVisible();
    await expect(page.getByText("Verifying outcome").first()).toBeVisible();
    await expect(page.getByText("Everything is done and verified.")).toHaveCount(0);
    await page.waitForTimeout(900); // let the verified seal finish drawing
    await page.screenshot({ path: shot("portal-case-partial-resolution"), fullPage: true });
    await expect(page.getByRole("heading", { name: "Talk to a person" })).toBeVisible();
    await logout(page);
  });

  test("operator: sees the same state, evidence first; records the human decision; case becomes verified-resolved", async ({
    page,
  }) => {
    await login(page, "ana@northfield.example", /\/app$/);
    await page.waitForTimeout(900); // let the verified seal finish drawing
    await page.screenshot({ path: shot("operator-dashboard"), fullPage: true });
    await page.goto("/app/cases?q=Jordan");
    await page.getByRole("link", { name: /ORY-/ }).first().click();
    await expect(page.getByText(/Recommended: Record the billing team's decision/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Outcome ledger" })).toBeVisible();
    await expect(page.getByText(/stop_future_billing|Future billing stopped/).first()).toBeVisible();
    await page.waitForTimeout(900); // let the verified seal finish drawing
    await page.screenshot({ path: shot("operator-case-detail"), fullPage: true });
    await page.getByRole("button", { name: "Record decision" }).click();
    await expect(page.getByText("Verified resolved").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("3 of 3 verified")).toBeVisible();
    await page.waitForTimeout(900); // let the verified seal finish drawing
    await page.screenshot({ path: shot("operator-case-resolved"), fullPage: true });
    await logout(page);
  });

  test("customer sees the verified resolution and can leave feedback or reopen", async ({ page }) => {
    await login(page, "jordan.reyes@customer.example", /\/portal$/);
    await page.goto("/portal/cases");
    await page.getByRole("link", { name: /ORY-/ }).first().click();
    await expect(page.getByText("Everything is done and verified.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reopen case" })).toBeVisible();
    await page.waitForTimeout(900); // let the verified seal finish drawing
    await page.screenshot({ path: shot("portal-case-verified"), fullPage: true });
  });
});

test.describe("Scenario C/F in the browser", () => {
  test("a customer cannot open another customer's case; signed-out users are redirected", async ({
    page,
    context,
  }) => {
    await login(page, "marcus.bell@customer.example", /\/portal$/);
    const res = await page.goto("/portal/cases/ORY-1001");
    expect(res?.status()).toBe(404);
    await expect(page.getByText("We can't find that page")).toBeVisible();
    await expect(page.getByText("I cancelled but was charged again")).toHaveCount(0); // no data from the other customer's case
    await context.clearCookies();
    await page.goto("/app");
    await expect(page).toHaveURL(/\/sign-in/);
  });
  test("a customer cannot reach the operator console", async ({ page }) => {
    await login(page, "elena.rossi@customer.example", /\/portal$/);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/sign-in/);
  });
  test("an unsafe 'next' redirect is ignored after sign-in", async ({ page }) => {
    await page.goto("/sign-in?next=//evil.example/phish");
    await page.getByLabel(/^Email/).fill("elena.rossi@customer.example");
    await page.getByLabel(/^Password/).fill("OryloDemo!2026");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/localhost:3000\/portal$/, { timeout: 20_000 });
  });
  test("wrong password shows a clear, non-leaky error", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel(/^Email/).fill("jordan.reyes@customer.example");
    await page.getByLabel(/^Password/).fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("form [role=alert]")).toContainText("don't match");
  });
});

test.describe("Lead capture", () => {
  test("validates, persists and shows an accessible success state", async ({ page }) => {
    await page.goto("/contact");
    await page.getByRole("button", { name: "Request early access" }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await page.getByLabel(/^Your name/).fill("Riley Chen");
    await page.getByLabel(/^Work email/).fill("riley@example.com");
    await page.getByRole("button", { name: "Request early access" }).click();
    await expect(page.getByRole("status").filter({ hasText: "your request is in" })).toBeVisible({
      timeout: 15_000,
    });
  });
});
