import { defineConfig, devices } from "@playwright/test";

/**
 * LIVE tests: they talk to the REAL eGain agent over the public internet. They are not part of `npm run test:e2e`
 * (that suite is deterministic and offline). Run:  npm run test:live
 * Env: LIVE_BASE_URL (default http://localhost:3000, must already be running), PW_CHROMIUM_PATH (optional).
 * Results are written to docs/evidence/egain-live/. A failure here is a real finding about the eGain configuration.
 */
const exe = process.env.PW_CHROMIUM_PATH;
export default defineConfig({
  testDir: "tests/live",
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.LIVE_BASE_URL ?? "http://localhost:3000",
    trace: "off",
    launchOptions: exe ? { executablePath: exe, args: ["--no-sandbox"] } : { args: ["--no-sandbox"] },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } } },
  ],
});
