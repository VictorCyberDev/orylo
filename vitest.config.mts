import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts", "tests/security/**/*.test.ts"],
    environment: "node",
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://orylo:orylo@localhost:5432/orylo_test",
      NODE_ENV: "test",
      ACTION_TIMEOUT_MS: "150",
    },
    // Integration tests share one Postgres database; run files serially and reset in setup.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    globalSetup: ["tests/global-setup.ts"],
  },
});
