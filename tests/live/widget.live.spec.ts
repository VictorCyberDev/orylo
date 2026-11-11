import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { AGENT_ID, SERVER_URL } from "./agent";

/**
 * The REAL eGain widget running inside the REAL Orylo pages under Orylo's REAL CSP.
 *
 * eGain's API rejects loopback origins by CORS (observed 2026-11-11: the widget never starts on http://localhost:3000 or
 * 127.0.0.1), so this test serves the locally running Orylo (LIVE_BASE_URL) under a non-loopback origin
 * (https://orylo-live.example) via request interception. Orylo's own response headers — including the CSP — pass through
 * untouched. Against a deployed https site set LIVE_PUBLIC_URL to test it directly with no interception.
 */
const FAKE_ORIGIN = "https://orylo-live.example";
const LOCAL = process.env.LIVE_BASE_URL ?? "http://localhost:3000";
const PUBLIC = process.env.LIVE_PUBLIC_URL; // e.g. https://orylo-demo.vercel.app
const ORIGIN = PUBLIC ?? FAKE_ORIGIN;
// eGain's widget posts telemetry to a *-dev.egain.cloud host that Orylo's CSP deliberately does not allow.
// eGain also tries an optional per-tenant `custom.js` hook from apps.egain.services; for this tenant it returns a non-script
// (404) response and the browser blocks it (ORB). Harmless and not a CSP matter: it is the widget's own optional customization.
const KNOWN_TELEMETRY = /clickstack\.aiagent-dev\.egain\.cloud|apps\.egain\.services\/.*\/custom\.js/;

async function serveLocalAsPublic(context: BrowserContext) {
  if (PUBLIC) return;
  await context.route(`${FAKE_ORIGIN}/**`, async (route) => {
    const u = new URL(route.request().url());
    const res = await route.fetch({ url: `${LOCAL}${u.pathname}${u.search}`, maxRedirects: 0 });
    await route.fulfill({ response: res });
  });
}

function collect(page: Page) {
  const log: { kind: string; text: string }[] = [];
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type()))
      log.push({ kind: `console.${m.type()}`, text: m.text().slice(0, 300) });
  });
  page.on("pageerror", (e) => log.push({ kind: "pageerror", text: String(e).slice(0, 300) }));
  page.on("requestfailed", (r) => {
    const u = r.url();
    if (/egain/.test(u))
      log.push({ kind: "requestfailed", text: `${u.slice(0, 160)} ${r.failure()?.errorText ?? ""}` });
  });
  return log;
}

function save(name: string, body: object) {
  mkdirSync("docs/evidence/egain-live", { recursive: true });
  writeFileSync(
    `docs/evidence/egain-live/${name}.json`,
    JSON.stringify({ ranAt: new Date().toISOString(), origin: ORIGIN, ...body }, null, 2),
  );
}

test("loader drift check: the live loader still contains the two inline snippets Orylo's CSP hashes allow", async ({
  request,
}) => {
  const r = await request.get(`${SERVER_URL}/system/templates/chat/egain-chat.js`);
  expect(r.status()).toBe(200);
  const js = await r.text();
  expect(js).toContain('<body onload="document._l();">');
  expect(js).toContain('iframe.src="javascript:false"');
  const version = js.match(/\/\*! ([^ *]+) \*\//)?.[1];
  save("loader-version", { loaderVersion: version, bytes: js.length });
});

for (const vp of [
  { name: "desktop", width: 1280, height: 860 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`real widget on /demo (${vp.name}): loads, is visible, opens from Orylo's button, no unexpected console errors`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    await serveLocalAsPublic(context);
    const page = await context.newPage();
    const log = collect(page);
    await page.goto(`${ORIGIN}/demo`);
    await expect(page.locator("script#_egainallowdockchat")).toHaveCount(1);
    await expect(page.locator("script#_egainallowdockchat")).toHaveAttribute("data-agent-id", AGENT_ID);
    await expect(page.locator("#egain-chat-floating-launch-button-frame")).toBeAttached({ timeout: 45_000 });
    const launch = page.getByTestId("egain-launch");
    await expect(launch).toBeEnabled({ timeout: 15_000 });
    await page.screenshot({
      path: `docs/evidence/screenshots/egain-demo-${vp.name}-closed.png`,
      fullPage: false,
    });
    await launch.click();
    const chat = page.frameLocator("iframe#egain-chat-iframe");
    await expect(chat.locator(".eg-message-bubble:visible").first()).toBeVisible({
      timeout: 45_000,
    });
    await expect(chat.locator("#eg-chat-message-input-textarea")).toBeEnabled({ timeout: 45_000 });
    await page.screenshot({
      path: `docs/evidence/screenshots/egain-demo-${vp.name}-open.png`,
      fullPage: false,
    });
    // exactly one widget; the page itself is not horizontally broken
    expect(await page.locator("script#_egainallowdockchat").count()).toBe(1);
    expect(await page.locator("iframe#egain-chat-iframe").count()).toBe(1);
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(over).toBeLessThanOrEqual(1);
    const unexpected = log.filter((l) => !KNOWN_TELEMETRY.test(l.text) && !/Failed to fetch/.test(l.text));
    save(`widget-console-${vp.name}`, { viewport: vp, entries: log, unexpected });
    expect(unexpected, "console/network errors other than the known blocked telemetry").toEqual([]);
    await context.close();
  });
}

test("widget survives client-side navigation between /demo and the customer portal and is gone from operator pages", async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await serveLocalAsPublic(context);
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/demo`);
  await expect(page.locator("#egain-chat-floating-launch-button-frame")).toBeAttached({ timeout: 45_000 });
  await page.getByRole("link", { name: "Product", exact: true }).first().click();
  await expect(page.locator("script#_egainallowdockchat")).toHaveCount(0);
  await page.goBack();
  await expect(page.locator("#egain-chat-floating-launch-button-frame")).toBeAttached({ timeout: 45_000 });
  expect(await page.locator("script#_egainallowdockchat").count()).toBe(1);
  await context.close();
});
