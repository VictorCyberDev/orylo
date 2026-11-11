import { expect, test, type Browser, type Page } from "./test";
import { signIn, PASSWORD } from "./helpers";
import { newCustomer, latestResetToken, type Fixture } from "./fixtures";

/**
 * Account recovery, read-only access links, brute-force throttling, CSP and error screens — in a real browser,
 * against the production build.
 */
async function as(browser: Browser, email: string, landing: RegExp): Promise<Page> {
  const p = await (await browser.newContext()).newPage();
  await signIn(p, email);
  await expect(p).toHaveURL(landing, { timeout: 20_000 });
  return p;
}
const NEW_PASSWORD = "Fresh-Passphrase-2026!";

test.describe("password reset, end to end", () => {
  test("request → link → new password; old password and old sessions stop working; the link is single-use", async ({
    browser,
  }) => {
    const f = await newCustomer("reset");
    const session = await as(browser, f.email, /\/portal$/);

    const req = await (await browser.newContext()).newPage();
    await req.goto("/forgot-password");
    await req.getByLabel(/^Email/).fill(f.email);
    await req.getByRole("button", { name: "Send reset link" }).click();
    await expect(
      req.getByText(/if (an|that) account exists|check your email|reset link/i).first(),
    ).toBeVisible({
      timeout: 20_000,
    });

    let token: string | null = null;
    await expect
      .poll(async () => (token = await latestResetToken(f.email)), { timeout: 15_000 })
      .not.toBeNull();

    const reset = await (await browser.newContext()).newPage();
    await reset.goto(`/reset-password?token=${token}`);
    await reset.getByLabel("New password").fill("short");
    await reset.getByRole("button", { name: "Set new password" }).click();
    await expect(reset.getByText(/10 characters|too short|at least/i).first()).toBeVisible({
      timeout: 20_000,
    });

    await reset.getByLabel("New password").fill(NEW_PASSWORD);
    await reset.getByRole("button", { name: "Set new password" }).click();
    await expect(reset).toHaveURL(/\/sign-in/, { timeout: 20_000 });

    // old password no longer works; the new one does
    const oldTry = await (await browser.newContext()).newPage();
    await signIn(oldTry, f.email, PASSWORD);
    await expect(oldTry.locator("form [role=alert]")).toContainText("don't match", { timeout: 20_000 });
    await as(browser, f.email, /\/portal$/).catch(() => undefined); // default password must fail (above); ignore
    const fresh = await (await browser.newContext()).newPage();
    await signIn(fresh, f.email, NEW_PASSWORD);
    await expect(fresh).toHaveURL(/\/portal$/, { timeout: 20_000 });

    // the session that existed before the reset was revoked
    await session.goto("/portal");
    await expect(session).toHaveURL(/\/sign-in/);

    // the link cannot be replayed
    const replay = await (await browser.newContext()).newPage();
    await replay.goto(`/reset-password?token=${token}`);
    await replay.getByLabel("New password").fill("Another-Passphrase-2026!");
    await replay.getByRole("button", { name: "Set new password" }).click();
    await expect(replay.locator("[role=alert]").first()).toBeVisible({ timeout: 20_000 });
    const still = await (await browser.newContext()).newPage();
    await signIn(still, f.email, NEW_PASSWORD);
    await expect(still).toHaveURL(/\/portal$/, { timeout: 20_000 });
  });
});

test.describe("sign-in throttling", () => {
  test("repeated wrong passwords for one address are slowed with a clear message; other addresses are unaffected", async ({
    browser,
  }) => {
    const target = `throttle.${Date.now()}@customer.example`;
    const page = await (await browser.newContext()).newPage();
    let blocked = false;
    for (let i = 0; i < 12 && !blocked; i++) {
      await signIn(page, target, `wrong-password-${i}`);
      const alert = page.locator("form [role=alert]");
      await expect(alert).toBeVisible({ timeout: 20_000 });
      blocked = /too many/i.test((await alert.textContent()) ?? "");
    }
    expect(blocked).toBe(true);
    // somebody else (a different address) can still sign in from the same browser/IP
    const f = await newCustomer("unaffected");
    await signIn(page, f.email);
    await expect(page).toHaveURL(/\/portal$/, { timeout: 20_000 });
  });
});

test.describe("read-only access link", () => {
  async function linkFor(browser: Browser, f: Fixture) {
    const cust = await as(browser, f.email, /\/portal$/);
    await cust.goto("/portal/cases/new");
    await cust.getByRole("button", { name: "Open my case" }).click();
    await expect(cust).toHaveURL(/\/portal\/cases\/ORY-\d+/, { timeout: 20_000 });
    const ref = cust.url().match(/(ORY-\d+)/)![1];
    const ana = await as(browser, "ana@northfield.example", /\/app$/);
    await ana.goto(`/app/cases/${ref}`);
    await ana.getByRole("button", { name: "Create access link" }).click();
    const text = await ana
      .locator("p.t-code")
      .filter({ hasText: "/access/" })
      .textContent({ timeout: 20_000 });
    return { url: text!.trim(), ref };
  }

  test("opening the link does nothing until the person confirms; the resulting view is read-only", async ({
    browser,
  }) => {
    const f = await newCustomer("link");
    const { url, ref } = await linkFor(browser, f);
    const ctx = await browser.newContext();
    const visitor = await ctx.newPage();
    await visitor.goto(url);
    // a plain GET (e.g. a mail scanner prefetching the link) must not create a session
    expect((await ctx.cookies()).filter((c) => /grant|session/i.test(c.name))).toHaveLength(0);
    await visitor.getByRole("button", { name: "View my case (read-only)" }).click();
    await expect(visitor).toHaveURL(new RegExp(`/portal/cases/${ref}`), { timeout: 20_000 });
    await expect(visitor.getByText("You are viewing a read-only link")).toBeVisible();
    await expect(visitor.getByRole("button", { name: "Yes, go ahead" })).toHaveCount(0);
    await expect(visitor.getByRole("button", { name: "Upload" })).toHaveCount(0);
    // other cases and personal data stay out of reach
    const other = await visitor.request.get("/api/portal/export");
    expect([401, 403]).toContain(other.status());
    const profile = await visitor.goto("/portal/cases/ORY-1001");
    expect([403, 404]).toContain(profile?.status());
  });

  test("a bogus link gets the same neutral message as an expired one", async ({ page }) => {
    await page.goto("/access/this-token-does-not-exist-0123456789");
    await expect(page.getByText(/expired|no longer|not valid|invalid/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "View my case (read-only)" })).toHaveCount(0);
  });
});

test.describe("content security policy and error screens", () => {
  test("every public and signed-in page sends a nonce CSP without inline-script allowance and raises no violations", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const problems: string[] = [];
    page.on("console", (m) => {
      if (/content security policy|refused to (execute|load|apply)/i.test(m.text())) problems.push(m.text());
    });
    page.on("pageerror", (e) => problems.push(String(e)));
    const visit = async (path: string) => {
      const r = await page.goto(path);
      const csp = r?.headers()["content-security-policy"] ?? "";
      expect(csp, path).toMatch(/script-src[^;]*'nonce-[A-Za-z0-9+/=_-]+'/);
      const script = csp.split(";").find((d) => d.trim().startsWith("script-src")) ?? "";
      expect(script, path).not.toContain("'unsafe-inline'");
      expect(script, path).not.toContain("'unsafe-eval'");
      expect(csp, path).toContain("frame-ancestors 'none'");
      await page.waitForLoadState("networkidle");
    };
    for (const p of ["/", "/product", "/sign-in", "/forgot-password"]) await visit(p);
    await signIn(page, "jordan.reyes@customer.example");
    await expect(page).toHaveURL(/\/portal$/, { timeout: 20_000 });
    for (const p of ["/portal", "/portal/cases", "/portal/profile"]) await visit(p);
    const staff = await (await browser.newContext()).newPage();
    staff.on("console", (m) => {
      if (/content security policy|refused to (execute|load|apply)/i.test(m.text())) problems.push(m.text());
    });
    await signIn(staff, "owner@northfield.example");
    await expect(staff).toHaveURL(/\/app$/, { timeout: 20_000 });
    for (const p of ["/app", "/app/cases", "/app/admin", "/app/admin/policies", "/app/analytics"]) {
      await staff.goto(p);
      await staff.waitForLoadState("networkidle");
    }
    expect(problems).toEqual([]);
  });

  test("unknown pages and cases return a real 404 with a way back; an inline script cannot run", async ({
    page,
  }) => {
    const r = await page.goto("/definitely/not/a/page");
    expect(r?.status()).toBe(404);
    await expect(page.getByRole("link", { name: /home|back|orylo/i }).first()).toBeVisible();

    await signIn(page, "jordan.reyes@customer.example");
    await expect(page).toHaveURL(/\/portal$/, { timeout: 20_000 });
    const missing = await page.goto("/portal/cases/ORY-999999");
    expect(missing?.status()).toBe(404);

    // CSP in practice: the classic injection vector — an inline event handler inside injected markup — must not run
    // (a DOM-created <script> is not a valid probe: 'strict-dynamic' deliberately trusts scripts made by trusted code).
    await page.goto("/portal");
    const ran = await page.evaluate(async () => {
      const violated = new Promise<boolean>((resolve) => {
        document.addEventListener("securitypolicyviolation", () => resolve(true), { once: true });
        setTimeout(() => resolve(false), 1500);
      });
      const d = document.createElement("div");
      d.innerHTML = '<img src="/none.png" onerror="window.__csp_probe = true">';
      document.body.appendChild(d);
      const sawViolation = await violated;
      return {
        executed: (window as unknown as { __csp_probe?: boolean }).__csp_probe === true,
        sawViolation,
      };
    });
    expect(ran.executed).toBe(false);
    expect(ran.sawViolation).toBe(true);
  });
});
