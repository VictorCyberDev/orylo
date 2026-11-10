import { expect, type Page } from "@playwright/test";
export const PASSWORD = "OryloDemo!2026";
export async function login(page: Page, email: string, expectUrl: RegExp) {
  await page.goto("/sign-in");
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(expectUrl, { timeout: 20_000 });
}
export async function logout(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForLoadState("networkidle");
}
