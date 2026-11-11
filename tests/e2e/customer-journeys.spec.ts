import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";
import { newCustomer, accountRow, db, type Fixture } from "./fixtures";
import { eq } from "drizzle-orm";
import { customers, dataRequests, users } from "@/db/schema";

/**
 * Customer journeys that the happy-path spec does not cover. Every test creates its own synthetic customer (see
 * fixtures.ts) so it never depends on, or disturbs, the shared seed. All assertions are made through the real UI
 * and, where a persisted outcome matters, re-checked against the database.
 */

async function openCase(page: Page, f: Fixture) {
  await signIn(page, f.email);
  await expect(page).toHaveURL(/\/portal$/, { timeout: 20_000 });
  await page.goto("/portal/cases/new");
  await page.getByRole("button", { name: "Open my case" }).click();
  await expect(page).toHaveURL(/\/portal\/cases\/ORY-\d+/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "What we know" })).toBeVisible();
}

test.describe("customer: declining, human support, cancel and reopen", () => {
  test("declining a proposed action changes nothing and the case keeps its history", async ({ page }) => {
    const f = await newCustomer("decline");
    await openCase(page, f);
    const card = page.getByRole("region", { name: "Apply your earlier cancellation" });
    await card.getByRole("button", { name: "No, don't do this" }).click();
    // The provider account is untouched and nothing is shown as verified.
    await expect(page.getByText("0 of 3 verified")).toBeVisible();
    const a = await accountRow(f);
    expect(a.billingActive).toBe(true);
    expect(a.status).toBe("ACTIVE");
    await expect(page.getByText("Everything is done and verified.")).toHaveCount(0);
  });

  test("asking for a person creates a tracked request that the customer can see", async ({ page }) => {
    const f = await newCustomer("human");
    await openCase(page, f);
    await page.getByLabel("Anything to add? (optional)").first().fill("Please call after 5pm");
    await page.getByRole("button", { name: "Request a callback" }).click();
    await expect(page.getByText(/Request open|Request in progress|Request waiting/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Waiting for a team member to pick it up.")).toBeVisible();
  });

  test("cancel a case, then reopen it without starting over", async ({ page }) => {
    const f = await newCustomer("reopen");
    await openCase(page, f);
    const url = page.url();
    await page.getByRole("button", { name: "Cancel this case" }).click();
    await expect(page.getByLabel("Reopen this case")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Cancel this case" })).toHaveCount(0);
    await page.getByLabel("Reopen this case").fill("I still need this fixed");
    await page.getByRole("button", { name: "Reopen", exact: true }).click();
    await expect(page.getByRole("button", { name: "Cancel this case" })).toBeVisible({ timeout: 20_000 });
    expect(page.url()).toBe(url); // same case, same reference — history kept
  });
});

test.describe("customer: evidence", () => {
  test("a valid file is stored, listed and downloads byte-for-byte; a disguised file is refused", async ({
    page,
  }) => {
    const f = await newCustomer("evidence");
    await openCase(page, f);
    const body = "Receipt 2026-10-02\nNorthfield Plus monthly 29.99\n";
    await page.setInputFiles("#file", {
      name: "receipt.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(body),
    });
    await page.getByRole("button", { name: "Upload" }).click();
    const link = page.getByRole("link", { name: "receipt.txt" });
    await expect(link).toBeVisible({ timeout: 20_000 });
    const res = await page.request.get((await link.getAttribute("href"))!);
    expect(res.status()).toBe(200);
    expect(await res.text()).toBe(body);

    // a text file pretending to be a PNG must be rejected by structural validation, with a visible reason
    await page.setInputFiles("#file", {
      name: "fake.png",
      mimeType: "image/png",
      buffer: Buffer.from("not an image"),
    });
    await page.getByRole("button", { name: "Upload" }).click();
    await expect(page.getByText("That didn't work")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("link", { name: "fake.png" })).toHaveCount(0);
  });

  test("another customer cannot download this customer's file", async ({ page, browser }) => {
    const owner = await newCustomer("evowner");
    const other = await newCustomer("evother");
    await openCase(page, owner);
    await page.setInputFiles("#file", {
      name: "private.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("secret"),
    });
    await page.getByRole("button", { name: "Upload" }).click();
    const href = await page
      .getByRole("link", { name: "private.txt" })
      .getAttribute("href", { timeout: 20_000 });
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await signIn(p2, other.email);
    await expect(p2).toHaveURL(/\/portal$/, { timeout: 20_000 });
    const res = await p2.request.get(href!);
    expect([403, 404]).toContain(res.status());
    await ctx.close();
  });
});

test.describe("customer: data rights", () => {
  test("export downloads the customer's own data as JSON", async ({ page }) => {
    const f = await newCustomer("export");
    await signIn(page, f.email);
    await expect(page).toHaveURL(/\/portal$/, { timeout: 20_000 });
    await page.goto("/portal/profile");
    const res = await page.request.get("/api/portal/export");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-disposition"]).toMatch(/attachment/);
    const json = await res.json();
    expect(JSON.stringify(json)).toContain(f.email);
    expect(JSON.stringify(json)).not.toContain("password");
  });

  test("erasure: customer requests, admin approves, the account and personal data are gone", async ({
    page,
    browser,
  }) => {
    const f = await newCustomer("erase", { priorRequest: false, charge: false });
    await signIn(page, f.email);
    await expect(page).toHaveURL(/\/portal$/, { timeout: 20_000 });
    await page.goto("/portal/profile");
    await page.getByLabel(/Anything you'd like us to know/).fill("Please erase my data");
    await page.getByRole("button", { name: "Request erasure of my data" }).click();
    await expect(page.getByText("Your erasure request is waiting for review.")).toBeVisible({
      timeout: 20_000,
    });

    const admin = await (await browser.newContext()).newPage();
    await signIn(admin, "admin@northfield.example");
    await expect(admin).toHaveURL(/\/app$/, { timeout: 20_000 });
    await admin.goto("/app/admin/privacy");
    const row = admin.getByRole("row").filter({ hasText: f.email });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Erase data" }).click();
    await expect(admin.getByRole("row").filter({ hasText: "completed" }).first()).toBeVisible({
      timeout: 20_000,
    });

    const [c] = await db.select().from(customers).where(eq(customers.id, f.customerId));
    expect(c.anonymizedAt).not.toBeNull();
    expect(c.email).not.toBe(f.email);
    expect(c.name).not.toBe(f.name);
    const u = await db.select().from(users).where(eq(users.email, f.email));
    expect(u).toHaveLength(0);
    const [r] = await db.select().from(dataRequests).where(eq(dataRequests.customerId, f.customerId));
    expect(r.status).toBe("COMPLETED");

    // the erased customer can no longer sign in
    const p3 = await (await browser.newContext()).newPage();
    await signIn(p3, f.email);
    await expect(p3.locator("form [role=alert]")).toContainText("don't match", { timeout: 20_000 });
    await expect(p3).toHaveURL(/\/sign-in/);
  });

  test("erasure is refused while a case is open, with an explanation, and nothing is erased", async ({
    page,
    browser,
  }) => {
    const f = await newCustomer("erasebusy");
    await openCase(page, f);
    await page.goto("/portal/profile");
    await page.getByRole("button", { name: "Request erasure of my data" }).click();
    await expect(page.getByText(/waiting for review/)).toBeVisible({ timeout: 20_000 });

    const admin = await (await browser.newContext()).newPage();
    await signIn(admin, "admin@northfield.example");
    await expect(admin).toHaveURL(/\/app$/, { timeout: 20_000 });
    await admin.goto("/app/admin/privacy");
    const row = admin.getByRole("row").filter({ hasText: f.email });
    await row.getByRole("button", { name: "Erase data" }).click();
    await expect(admin.getByText(/still has open cases/)).toBeVisible({ timeout: 20_000 });
    const [c] = await db.select().from(customers).where(eq(customers.id, f.customerId));
    expect(c.anonymizedAt).toBeNull();
    expect(c.email).toBe(f.email);
  });
});
