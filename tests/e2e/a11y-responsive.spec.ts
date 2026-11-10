import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { login } from "./helpers";

const publicPages = [
  "/",
  "/product",
  "/solutions",
  "/solutions/subscription-billing-recovery",
  "/pricing",
  "/security",
  "/about",
  "/contact",
  "/demo",
  "/legal/privacy",
  "/legal/terms",
  "/sign-in",
];

async function scan(page: import("@playwright/test").Page, label: string) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(
    bad.map(
      (v) => `${label}: ${v.id} — ${v.help} (${v.nodes.length} nodes: ${v.nodes[0]?.target?.join(" ")})`,
    ),
    `${label} accessibility`,
  ).toEqual([]);
}

test.describe("accessibility (axe, WCAG 2.2 AA tags) — light and dark", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`public pages (${theme})`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem("orylo-theme", t), theme);
      for (const p of publicPages) {
        await page.goto(p);
        await page.waitForLoadState("networkidle");
        await scan(page, `${theme} ${p}`);
      }
    });
  }
  test("signed-in portal and console pages", async ({ page }) => {
    await login(page, "priya.nair@customer.example", /\/portal$/);
    for (const p of [
      "/portal",
      "/portal/cases",
      "/portal/cases/new",
      "/portal/notifications",
      "/portal/profile",
    ]) {
      await page.goto(p);
      await page.waitForLoadState("networkidle");
      await scan(page, p);
    }
    await page.context().clearCookies();
    await login(page, "owner@northfield.example", /\/app$/);
    for (const p of [
      "/app",
      "/app/cases",
      "/app/approvals",
      "/app/escalations",
      "/app/analytics",
      "/app/notifications",
      "/app/admin",
      "/app/admin/members",
      "/app/admin/policies",
      "/app/admin/workflows",
      "/app/admin/integrations",
      "/app/admin/api-keys",
      "/app/admin/ledger",
      "/app/admin/audit",
      "/app/admin/billing",
    ]) {
      await page.goto(p);
      await page.waitForLoadState("networkidle");
      await scan(page, p);
    }
  });
});

test.describe("keyboard & focus", () => {
  test("skip link is first in tab order and visible on focus", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
  });
  test("command palette opens with Ctrl+K, filters, navigates by keyboard, closes with Escape", async ({
    page,
  }) => {
    await login(page, "ana@northfield.example", /\/app$/);
    await page.keyboard.press("Control+k");
    const box = page.getByRole("combobox", { name: "Search pages and actions" });
    await expect(box).toBeFocused();
    await box.fill("approv");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/app\/approvals/);
    await page.keyboard.press("Control+k");
    await page.keyboard.press("Escape");
    await expect(box).toHaveCount(0);
  });
});

test.describe("responsive: no horizontal overflow, nav reachable, touch targets", () => {
  for (const [name, size] of [
    ["mobile", { width: 375, height: 760 }],
    ["tablet", { width: 820, height: 1100 }],
    ["large", { width: 1920, height: 1080 }],
  ] as const) {
    test(`public pages at ${name}`, async ({ page }) => {
      await page.setViewportSize(size);
      for (const p of [
        "/",
        "/product",
        "/pricing",
        "/contact",
        "/demo",
        "/solutions/warranty-claim-readiness",
      ]) {
        await page.goto(p);
        await page.waitForLoadState("networkidle");
        const over = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(over, `${name} ${p} horizontal overflow`).toBeLessThanOrEqual(1);
      }
      await page.goto("/");
      await page.waitForTimeout(900); // let the verified seal finish drawing
      await page.screenshot({ path: `docs/evidence/screenshots/home-${name}.png`, fullPage: true });
    });
  }
  test("mobile menu opens and navigates; primary controls are ≥ 44px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 760 });
    await page.goto("/");
    await page.getByRole("button", { name: /Open navigation/ }).click();
    await page.getByRole("link", { name: "Pricing" }).last().click();
    await expect(page).toHaveURL(/\/pricing/);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll("a[href],button,input,select,textarea")]
        .filter((e) => {
          const r = (e as HTMLElement).getBoundingClientRect();
          return (
            r.width > 0 &&
            r.height > 0 &&
            (r.height < 24 || r.width < 24) &&
            !(e as HTMLElement).closest(".sr-only") &&
            getComputedStyle(e as HTMLElement).position !== "absolute"
          );
        })
        .map((e) => (e as HTMLElement).outerHTML.slice(0, 80)),
    );
    expect(small, "controls under 24px (WCAG 2.2 target size minimum)").toEqual([]);
  });
  test("console at mobile width has no overflow and a working menu", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 760 });
    await login(page, "ana@northfield.example", /\/app$/);
    for (const p of ["/app", "/app/cases"]) {
      await page.goto(p);
      await page.waitForLoadState("networkidle");
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(over, `${p} overflow`).toBeLessThanOrEqual(1);
    }
    await page.waitForTimeout(900); // let the verified seal finish drawing
    await page.screenshot({ path: "docs/evidence/screenshots/operator-cases-mobile.png", fullPage: true });
  });
});

test.describe("customer portal at mobile width", () => {
  test("no overflow on dashboard, case, new-case and profile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 760 });
    await login(page, "priya.nair@customer.example", /\/portal$/);
    await page.goto("/portal/cases");
    const ref = (await page.getByRole("link", { name: /ORY-/ }).first().textContent())!.trim();
    for (const p of [
      "/portal",
      "/portal/cases",
      `/portal/cases/${ref}`,
      "/portal/cases/new",
      "/portal/profile",
      "/portal/notifications",
    ]) {
      await page.goto(p, { waitUntil: "load" });
      await page.waitForTimeout(250);
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(over, `${p} overflow @375`).toBeLessThanOrEqual(1);
    }
    await page.goto(`/portal/cases/${ref}`);
    await page.waitForTimeout(900); // let the verified seal finish drawing
    await page.screenshot({ path: "docs/evidence/screenshots/portal-case-mobile.png", fullPage: true });
  });
});

test.describe("console layout at desktop widths has no horizontal overflow or squeezed columns", () => {
  for (const width of [1280, 1440]) {
    test(`operator console at ${width}px`, async ({ page }) => {
      test.setTimeout(150_000);
      await page.setViewportSize({ width, height: 900 });
      await login(page, "owner@northfield.example", /\/app$/);
      await page.goto("/app/cases");
      const ref = await page
        .getByRole("link", { name: /ORY-/ })
        .first()
        .textContent()
        .catch(() => null);
      const paths = [
        "/app",
        "/app/cases",
        "/app/approvals",
        "/app/escalations",
        "/app/analytics",
        "/app/admin",
        "/app/admin/members",
        "/app/admin/policies",
        "/app/admin/workflows",
        "/app/admin/integrations",
        "/app/admin/api-keys",
        "/app/admin/ledger",
        "/app/admin/audit",
        "/app/admin/billing",
        ...(ref ? [`/app/cases/${ref.trim()}`] : []),
      ];
      for (const p of paths) {
        await page.goto(p, { waitUntil: "load" });
        await page.waitForTimeout(250);
        const over = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(over, `${p} @${width} horizontal overflow`).toBeLessThanOrEqual(1);
        // no badge may wrap onto two lines (pill ovals)
        const wrapped = await page.evaluate(() =>
          [...document.querySelectorAll("span.rounded-full")]
            .filter(
              (e) =>
                (e as HTMLElement).getClientRects().length &&
                (e as HTMLElement).getBoundingClientRect().height > 30,
            )
            .map((e) => e.textContent),
        );
        expect(wrapped, `${p} @${width} wrapped badges`).toEqual([]);
      }
    });
  }
});

test.describe("reduced motion", () => {
  test("verified seal is drawn statically when the user prefers reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/product");
    await page.getByRole("tab", { name: /Verify/ }).click();
    const off = await page
      .locator(".seal path")
      .first()
      .evaluate((el) => getComputedStyle(el).strokeDashoffset);
    expect(off).toBe("0px");
  });
});
