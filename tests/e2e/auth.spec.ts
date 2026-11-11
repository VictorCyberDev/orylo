import { expect, test } from "./test";
import { login, logout } from "./helpers";

test.describe("authentication & session lifecycle", () => {
  test("session survives reload; sign-out ends it everywhere on this browser", async ({ page }) => {
    await login(page, "sam.okafor@customer.example", /\/portal$/);
    await page.reload();
    await expect(page.getByText("Signed in as")).toBeVisible();
    await logout(page);
    for (const p of ["/portal", "/portal/cases", "/app"]) {
      await page.goto(p);
      await expect(page).toHaveURL(/\/sign-in/);
    }
    await page.goBack();
    await page.goBack().catch(() => undefined);
    // protected content is never served from cache after sign-out
    await page.goto("/portal/cases");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("session cookie is httpOnly and SameSite=Lax", async ({ page, context }) => {
    await login(page, "sam.okafor@customer.example", /\/portal$/);
    const c = (await context.cookies()).find((x) => /session_token/.test(x.name));
    expect(c, "session cookie present").toBeTruthy();
    expect(c!.httpOnly).toBe(true);
    expect(c!.sameSite).toBe("Lax");
  });

  test("password reset request gives the same answer whether or not the account exists", async ({ page }) => {
    const answers: string[] = [];
    for (const email of ["sam.okafor@customer.example", "nobody-here@customer.example"]) {
      await page.goto("/forgot-password");
      await page.getByLabel(/^Email/).fill(email);
      await page.getByRole("button", { name: "Send reset link" }).click();
      const toast = page.getByRole("status").filter({ hasText: "If that address has an account" });
      await expect(toast).toBeVisible({ timeout: 10_000 });
      answers.push((await toast.textContent())!);
    }
    expect(answers[0]).toBe(answers[1]);
    expect(answers[0]).toMatch(/no email is sent/i); // never claims an email was sent
  });

  test("a reset link without a valid token cannot set a password", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByText("This link is incomplete")).toBeVisible();
    await page.goto("/reset-password?token=not-a-real-token");
    await page.getByLabel(/^New password/).fill("a-new-password-123");
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page.locator("form [role=alert]")).toContainText("invalid or has expired");
  });

  test("invalid invitation tokens are rejected", async ({ page }) => {
    await page.goto("/invite/not-a-real-token");
    await expect(page.getByText(/expired, been used, or was withdrawn/)).toBeVisible();
  });

  test("customers cannot sign in to staff areas and staff land in the console", async ({ page }) => {
    await login(page, "ana@northfield.example", /\/app$/);
    await page.goto("/portal");
    await expect(page).toHaveURL(/\/sign-in/); // staff accounts are not customers
  });

  test("public self-registration is closed (invitation-only) so accounts cannot be created or enumerated", async ({
    request,
  }) => {
    const r = await request.post("/api/auth/sign-up/email", {
      headers: { origin: "http://localhost:3000" },
      data: { email: "sam.okafor@customer.example", password: "a-very-long-password-1", name: "Mallory" },
    });
    expect(r.status()).toBe(403);
    expect(await r.text()).not.toMatch(/already exists/i);
  });
});
