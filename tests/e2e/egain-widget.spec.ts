import { EGAIN_SCRIPT, EGAIN_SERVER, STAND_IN, expect, test, type Page } from "./test";
import { signIn } from "./helpers";
import { newCustomer } from "./fixtures";

/**
 * Widget integration, tested offline and deterministically. eGain's host is STAND-IN here (page.route): a ~20-line
 * loader that reproduces the two inline patterns of the real loader (a `javascript:false` iframe and
 * `<body onload="document._l();">`), so Orylo's real CSP is exercised for real. These tests prove OUR side
 * (CSP, one script, route scoping, states, retry). They do not prove anything about eGain's agent:
 * that is tests/live (run against the real published agent).
 */
const SERVER = EGAIN_SERVER;
const SCRIPT = EGAIN_SCRIPT;
const AGENT = "015f4f90-8772-4065-9e64-894b3615c5d3";

async function standIn(page: Page, mode: "ok" | "fail" = "ok") {
  const seen: string[] = [];
  await page.route("https://ai.egain.cloud/**", async (r) => {
    seen.push(r.request().url());
    if (mode === "fail") return r.abort("failed");
    if (r.request().url() === SCRIPT)
      return r.fulfill({ status: 200, contentType: "application/javascript", body: STAND_IN });
    return r.fulfill({ status: 404, body: "" });
  });
  return seen;
}
const csp = async (page: Page, path: string) =>
  (await page.goto(path))?.headers()["content-security-policy"] ?? "";
function watch(page: Page) {
  const bad: string[] = [];
  page.on("console", (m) => {
    if (/content security policy|refused to/i.test(m.text())) bad.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => bad.push(String(e).slice(0, 200)));
  return bad;
}
const scripts = (page: Page) => page.locator("script#_egainallowdockchat").count();

test.describe("eGain widget: embedding and CSP", () => {
  test("/demo loads the official script once, with exact attributes, under the strict CSP, and becomes ready", async ({
    page,
  }) => {
    const bad = watch(page);
    await standIn(page);
    await page.goto("/demo");
    await expect(page.locator("script#_egainallowdockchat")).toHaveCount(1);
    const el = page.locator("script#_egainallowdockchat");
    await expect(el).toHaveAttribute("src", SCRIPT);
    await expect(el).toHaveAttribute("data-agent-id", AGENT);
    await expect(el).toHaveAttribute("data-server-url", SERVER);
    await expect(page.locator("#egain-chat-floating-launch-button-frame")).toBeAttached({ timeout: 15_000 });
    const launch = page.getByTestId("egain-launch");
    await expect(launch).toBeEnabled({ timeout: 15_000 });
    await launch.click();
    await expect(page.locator("html")).toHaveAttribute("data-standin-chat", "open");
    expect(bad, "CSP violations or page errors").toEqual([]);
  });

  test("the CSP on /demo is minimal and exact; on /app it contains nothing from eGain", async ({ page }) => {
    const c = await csp(page, "/demo");
    const dir = (n: string) =>
      c
        .split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith(n + " ")) ?? "";
    const script = dir("script-src");
    expect(script).toMatch(/'nonce-[A-Za-z0-9+/=_-]+'/);
    expect(script).toContain("'strict-dynamic'");
    expect(script).toContain("'unsafe-hashes'");
    expect(script.match(/'sha256-[A-Za-z0-9+/=]+'/g) ?? []).toHaveLength(2);
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
    expect(dir("connect-src")).toBe(
      "connect-src 'self' https://ai.egain.cloud https://api.ai.egain.cloud https://cdn.aiagent.egain.cloud",
    );
    expect(dir("frame-src")).toBe("frame-src 'self' https://ai.egain.cloud");
    expect(c).toContain("frame-ancestors 'none'");
    expect(c).not.toMatch(/\*/);
    expect(c).not.toContain("clickstack");

    await signIn(page, "ana@northfield.example");
    await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
    const staff = (await page.goto("/app/admin"))?.headers()["content-security-policy"] ?? "";
    expect(staff).not.toContain("egain");
    expect(staff).not.toContain("unsafe-hashes");
    expect(staff).toContain("frame-ancestors 'none'");
  });

  test("operator pages never load or request the widget", async ({ page }) => {
    const seen = await standIn(page);
    await signIn(page, "ana@northfield.example");
    await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
    for (const p of ["/app", "/app/cases", "/app/approvals", "/app/admin"]) {
      await page.goto(p);
      await page.waitForLoadState("networkidle");
      expect(await scripts(page), p).toBe(0);
      await expect(page.locator("#egain-chat-floating-launch-button-frame")).toHaveCount(0);
    }
    expect(seen).toEqual([]);
  });

  test("one script across client-side navigation; the widget is removed off widget routes and comes back", async ({
    page,
  }) => {
    await standIn(page);
    await page.goto("/demo");
    await expect(page.locator("#egain-chat-floating-launch-button-frame")).toBeAttached({ timeout: 15_000 });
    expect(await scripts(page)).toBe(1);
    // client-side navigation to a non-widget page (header link), then back
    await page.getByRole("link", { name: "Product", exact: true }).first().click();
    await expect(page).toHaveURL(/\/product$/);
    await expect(page.locator("script#_egainallowdockchat")).toHaveCount(0);
    await expect(page.locator("#egain-chat-floating-launch-button-frame")).toHaveCount(0);
    expect(await page.evaluate(() => "egainDockAi" in window)).toBe(false);
    await page.goBack();
    await expect(page).toHaveURL(/\/demo$/);
    await expect(page.locator("#egain-chat-floating-launch-button-frame")).toBeAttached({ timeout: 15_000 });
    expect(await scripts(page)).toBe(1);
    expect(await page.locator("#egain-chat-floating-launch-button-frame").count()).toBe(1);
    // reload: still exactly one
    await page.reload();
    await expect(page.locator("#egain-chat-floating-launch-button-frame")).toBeAttached({ timeout: 15_000 });
    expect(await scripts(page)).toBe(1);
  });

  test("customer portal hosts the widget too; signing in from the (widget-allowed) sign-in page by client navigation works", async ({
    page,
  }) => {
    await standIn(page);
    const f = await newCustomer("egwidget");
    const bad = watch(page);
    await signIn(page, f.email);
    await expect(page).toHaveURL(/\/portal$/, { timeout: 20_000 });
    await expect(page.locator("#egain-chat-floating-launch-button-frame")).toBeAttached({ timeout: 15_000 });
    expect(await scripts(page)).toBe(1);
    expect(bad).toEqual([]);
  });
});

test.describe("eGain widget: negative control", () => {
  test("remove the two hashes from the CSP and the loader cannot run — so the hashes are what makes it work", async ({
    page,
  }) => {
    await standIn(page);
    await page.route("**/demo", async (route) => {
      const res = await route.fetch();
      const stripped = (res.headers()["content-security-policy"] ?? "")
        .replace(/ 'unsafe-hashes'/, "")
        .replace(/ 'sha256-[A-Za-z0-9+/=]+'/g, "");
      await route.fulfill({
        response: res,
        headers: { ...res.headers(), "content-security-policy": stripped },
      });
    });
    await page.goto("/demo");
    await expect(page.getByTestId("egain-status")).toHaveAttribute("data-state", "unavailable", {
      timeout: 30_000,
    });
    await expect(page.locator("#egain-chat-floating-launch-button-frame")).toHaveCount(0);
  });
});

test.describe("eGain widget: unavailable and retry", () => {
  test("when eGain cannot be reached the page says so, stays usable, and Try again recovers", async ({
    page,
  }) => {
    await standIn(page, "fail");
    await page.goto("/demo");
    const status = page.getByTestId("egain-status");
    await expect(status).toHaveAttribute("data-state", "unavailable", { timeout: 15_000 });
    await expect(status.getByText("The assistant couldn't load.")).toBeVisible();
    await expect(status.getByRole("link", { name: "Contact a person" })).toBeVisible();
    await expect(page.getByTestId("egain-launch")).toContainText("unavailable");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible(); // the page itself is unaffected

    await page.unroute("https://ai.egain.cloud/**");
    await standIn(page, "ok");
    await status.getByRole("button", { name: "Try again" }).click();
    await expect(page.locator("#egain-chat-floating-launch-button-frame")).toBeAttached({ timeout: 15_000 });
    await expect(page.getByTestId("egain-launch")).toBeEnabled();
    expect(await scripts(page)).toBe(1);
  });
});

test.describe("eGain widget: mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("status chip and launch button do not cause overflow or cover the mobile menu", async ({ page }) => {
    await standIn(page, "fail");
    await page.goto("/demo");
    const chip = page.getByTestId("egain-status");
    await expect(chip).toBeVisible({ timeout: 15_000 });
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(over).toBeLessThanOrEqual(1);
    const cb = (await chip.boundingBox())!;
    const hb = (await page.locator("header").first().boundingBox())!;
    expect(cb.y).toBeGreaterThan(hb.y + hb.height); // chip sits below the header, never over the menu button
    const lb = (await page.getByTestId("egain-launch").boundingBox())!;
    expect(lb.height).toBeGreaterThanOrEqual(44);
  });
});
