import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { AGENT_ID } from "./agent";

/**
 * Smoke + acceptance tests against the DEPLOYED public site (never localhost): LIVE_PUBLIC_URL=https://orylo-demo.vercel.app
 * Optional: REVIEWER_CODE (to exercise reviewer access), CRON_SECRET_PUBLIC (to exercise the worker tick).
 * These tests change demo data (they run the customer journey once). Reset afterwards with a DEMO_RESET_ON_BUILD=1 redeploy.
 */
const BASE = process.env.LIVE_PUBLIC_URL;
const REVIEWER = process.env.REVIEWER_CODE;
const CRON = process.env.CRON_SECRET_PUBLIC;
test.skip(!BASE, "set LIVE_PUBLIC_URL to the deployed site");
const KNOWN_EGAIN_NOISE = /clickstack\.aiagent-dev\.egain\.cloud|apps\.egain\.services\/.*\/custom\.js/;
const DEFAULT_PASSWORD = "OryloDemo!2026"; // the repository's public default — must NOT work on the public site

function save(name: string, body: object) {
  mkdirSync("docs/evidence/public", { recursive: true });
  writeFileSync(
    `docs/evidence/public/${name}.json`,
    JSON.stringify({ ranAt: new Date().toISOString(), site: BASE, ...body }, null, 2),
  );
}
async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/sign-in`);
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}
async function revealPassword(page: Page): Promise<string> {
  await page.goto(`${BASE}/demo`);
  await page.getByLabel("Reviewer code").fill(REVIEWER!);
  await page.getByRole("button", { name: "Show reviewer sign-in details" }).click();
  const pw = page.locator("span.t-code").first();
  await expect(pw).toBeVisible({ timeout: 20_000 });
  return (await pw.textContent())!.trim();
}

test.describe("public site: availability, headers, exposure", () => {
  test("pages, health, headers and the cron tick", async ({ request }) => {
    const rows: Record<string, unknown> = {};
    for (const p of ["/", "/demo", "/product", "/security", "/pricing", "/sign-in"]) {
      const r = await request.get(`${BASE}${p}`);
      rows[p] = r.status();
      expect(r.status(), p).toBe(200);
    }
    const h = await request.get(`${BASE}/api/health`);
    const hj = await h.json();
    expect(hj.status).toBe("ok");
    expect(hj.db).toBe("up");
    const home = await request.get(`${BASE}/demo`);
    const hd = home.headers();
    const csp = hd["content-security-policy"] ?? "";
    expect(csp).toMatch(/script-src[^;]*'nonce-/);
    expect(csp.split(";").find((d) => d.trim().startsWith("script-src"))).not.toContain("'unsafe-inline'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(hd["strict-transport-security"]).toMatch(/max-age=\d+/);
    expect(hd["x-content-type-options"]).toBe("nosniff");
    expect(hd["x-frame-options"]).toBe("DENY");
    const t = await request.post(`${BASE}/api/internal/jobs/tick`);
    expect(t.status()).toBe(401);
    let tickWith: unknown = "not exercised (CRON_SECRET_PUBLIC not provided)";
    if (CRON) {
      const ok = await request.get(`${BASE}/api/internal/jobs/tick`, {
        headers: { Authorization: `Bearer ${CRON}` },
      });
      expect(ok.status()).toBe(200);
      tickWith = await ok.json();
    }
    save("smoke", { pages: rows, health: hj, csp, tickWithoutSecret: t.status(), tickWithSecret: tickWith });
  });

  test("no demo password or credentials are exposed anywhere public; the repository's default password does not work", async ({
    page,
    request,
  }) => {
    for (const p of ["/", "/demo", "/sign-in", "/product", "/security"]) {
      const body = await (await request.get(`${BASE}${p}`)).text();
      expect(body, p).not.toContain(DEFAULT_PASSWORD);
      expect(body, p).not.toMatch(/customer\.example|northfield\.example/); // synthetic accounts are listed only after reviewer access
    }
    await signIn(page, "jordan.reyes@customer.example", DEFAULT_PASSWORD);
    await expect(page.locator("form [role=alert]")).toContainText("don't match", { timeout: 20_000 });
    await signIn(page, "owner@northfield.example", DEFAULT_PASSWORD);
    await expect(page.locator("form [role=alert]")).toContainText("don't match", { timeout: 20_000 });
  });

  test("the action API refuses unauthenticated and wrongly-keyed callers with the documented envelope", async ({
    request,
  }) => {
    for (const headers of [{} as Record<string, string>, { Authorization: "Bearer oryk_not-a-real-key" }]) {
      const r = await request.post(`${BASE}/api/v1/egain/sessions`, {
        headers,
        data: { fullName: "x", email: "a@b.example", accountNumber: "NF-100234", issue: "x" },
      });
      expect(r.status()).toBe(401);
      expect((await r.json()).error.code).toBe("UNAUTHENTICATED");
    }
    const bad = await request.get(`${BASE}/api/v1/receipts/not-a-receipt/verify`);
    expect(bad.status()).toBe(404);
  });
});

test.describe("public site: reviewer access and the customer journey", () => {
  test.skip(!REVIEWER, "set REVIEWER_CODE");

  test("a wrong reviewer code reveals nothing; the right one reveals the sign-in details", async ({
    page,
  }) => {
    await page.goto(`${BASE}/demo`);
    await page.getByLabel("Reviewer code").fill("wrong-code-123");
    await page.getByRole("button", { name: "Show reviewer sign-in details" }).click();
    await expect(page.getByText("That code isn't valid.")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Jordan Reyes")).toHaveCount(0);
    const pw = await revealPassword(page);
    expect(pw.length).toBeGreaterThanOrEqual(16);
    expect(pw).not.toBe(DEFAULT_PASSWORD);
    await expect(page.getByText("Jordan Reyes").first()).toBeVisible();
  });

  test("customer: cancellation corrected and VERIFIED, billing review PENDING (not a refund), receipt verifies; unauthorized access is refused", async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000);
    const pw = await revealPassword(page);
    await signIn(page, "jordan.reyes@customer.example", pw);
    await expect(page).toHaveURL(/\/portal$/, { timeout: 30_000 });
    await page.goto(`${BASE}/portal/cases/new`);
    await page.getByRole("button", { name: "Open my case" }).click();
    await expect(page).toHaveURL(/\/portal\/cases\/ORY-\d+/, { timeout: 30_000 });
    const ref = page.url().match(/(ORY-\d+)/)![1];
    await expect(page.getByText("0 of 3 verified")).toBeVisible();
    const cancel = page.getByRole("region", { name: "Apply your earlier cancellation" });
    await cancel.getByRole("button", { name: "Yes, go ahead" }).click();
    await expect(page.getByText("1 of 3 verified")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByText(/Verified by read-back/)).toBeVisible();
    const review = page.getByRole("region", { name: "Open a billing review for the charge" });
    await review.getByRole("button", { name: "Yes, go ahead" }).click();
    await expect(page.getByText("2 of 3 verified")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByText(/No money has moved/).first()).toBeVisible();
    await expect(page.getByText("Everything is done and verified.")).toHaveCount(0);
    const text = await page.locator("main").innerText();
    const receipt = text.match(/RCPT-\d{8}-[A-F0-9]{16}/)?.[0];
    expect(receipt, "a receipt number is shown after execution").toBeTruthy();
    await page.screenshot({
      path: "docs/evidence/screenshots/public-customer-case-partial.png",
      fullPage: true,
    });

    // backend receipt verification through the public check on /demo
    await page.goto(`${BASE}/demo`);
    await page.getByLabel("Receipt number").fill(receipt!);
    await page.getByRole("button", { name: "Verify receipt" }).click();
    await expect(page.getByText("Genuine receipt")).toBeVisible({ timeout: 20_000 });
    const tampered = receipt!.slice(0, -1) + (receipt!.endsWith("0") ? "1" : "0");
    await page.getByLabel("Receipt number").fill(tampered);
    await page.getByRole("button", { name: "Verify receipt" }).click();
    await expect(page.getByText("Not a valid receipt")).toBeVisible({ timeout: 20_000 });

    // unauthorized: signed-out visitor, other customer, customer → operator console
    const anon = await (await browser.newContext()).newPage();
    await anon.goto(`${BASE}/portal/cases/${ref}`);
    await expect(anon).toHaveURL(/\/sign-in/);
    const priya = await (await browser.newContext()).newPage();
    await signIn(priya, "priya.nair@customer.example", pw);
    await expect(priya).toHaveURL(/\/portal$/, { timeout: 30_000 });
    const other = await priya.goto(`${BASE}/portal/cases/${ref}`);
    expect(other?.status()).toBe(404);
    await priya.goto(`${BASE}/app`);
    await expect(priya).toHaveURL(/\/sign-in\?next=/); // redirected away; no operator data is ever rendered for a customer
    await expect(priya.getByText("Command center")).toHaveCount(0);

    // operator sees the same state
    const ana = await (await browser.newContext()).newPage();
    await signIn(ana, "ana@northfield.example", pw);
    await expect(ana).toHaveURL(/\/app$/, { timeout: 30_000 });
    await ana.goto(`${BASE}/app/cases/${ref}`);
    await expect(ana.getByRole("heading", { name: "Outcome ledger" })).toBeVisible();
    save("customer-journey", {
      caseRef: ref,
      receiptVerified: true,
      tamperedReceiptRejected: true,
      billingReviewState: "pending (2 of 3 verified), no refund",
      crossCustomerStatus: other?.status(),
    });
  });

  test("admin pages load for the owner with no server errors", async ({ page }) => {
    const pw = await revealPassword(page);
    await signIn(page, "owner@northfield.example", pw);
    await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
    for (const p of [
      "/app",
      "/app/cases",
      "/app/approvals",
      "/app/analytics",
      "/app/admin",
      "/app/admin/members",
      "/app/admin/policies",
      "/app/admin/jobs",
      "/app/admin/privacy",
      "/app/admin/billing",
      "/app/admin/audit",
    ]) {
      const r = await page.goto(`${BASE}${p}`);
      expect(r?.status(), p).toBeLessThan(400);
    }
  });
});

test.describe("public site: the real eGain widget on the real origin", () => {
  for (const vp of [
    { name: "desktop", width: 1280, height: 860 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    test(`widget loads, opens, no unexpected console errors, no overflow (${vp.name}, clean session)`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      const log: string[] = [];
      page.on("console", (m) => {
        if (["error", "warning"].includes(m.type())) log.push(`${m.type()}: ${m.text().slice(0, 240)}`);
      });
      page.on("pageerror", (e) => log.push(`pageerror: ${String(e).slice(0, 240)}`));
      page.on("requestfailed", (r) => {
        if (/egain/.test(r.url())) log.push(`requestfailed: ${r.url().slice(0, 140)}`);
      });
      await page.goto(`${BASE}/demo`);
      await expect(page.locator("script#_egainallowdockchat")).toHaveAttribute("data-agent-id", AGENT_ID);
      await expect(page.locator("#egain-chat-floating-launch-button-frame")).toBeAttached({
        timeout: 45_000,
      });
      await expect(page.getByTestId("egain-launch")).toBeEnabled({ timeout: 20_000 });
      await page.getByTestId("egain-launch").click();
      const chat = page.frameLocator("iframe#egain-chat-iframe");
      await expect(chat.locator(".eg-message-bubble:visible").first()).toBeVisible({ timeout: 45_000 });
      await expect(chat.locator("#eg-chat-message-input-textarea")).toBeEnabled({ timeout: 45_000 });
      await page.screenshot({ path: `docs/evidence/screenshots/public-demo-${vp.name}-open.png` });
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(over).toBeLessThanOrEqual(1);
      const unexpected = log.filter((l) => !KNOWN_EGAIN_NOISE.test(l));
      save(`widget-${vp.name}`, { viewport: vp, console: log, unexpected });
      expect(unexpected).toEqual([]);
      await context.close();
    });
  }
});
