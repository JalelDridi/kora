import { defineConfig } from "@playwright/test";
import { assertLocalDatabase } from "./src/pipeline/database-url.ts";

const PORT = 3100;

// The server under test gets its settings from here. Values set in the
// environment win over .env files, so a test run can never reach a hosted
// database, Redis or error tracker. The admin password and the Chkoun? seed
// are test values, not secrets: they only work on this local server.
export const E2E_ENV: Record<string, string> = {
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5434/kora_test",
  UPSTASH_REDIS_REST_URL: "",
  UPSTASH_REDIS_REST_TOKEN: "",
  SENTRY_DSN: "",
  ADMIN_PASSWORD: "e2e-only-admin-password",
  // A test value: it signs this server's Chkoun? tokens and nothing else.
  CHKOUN_SEED: "e2e-only-chkoun-seed",
};
assertLocalDatabase(E2E_ENV.DATABASE_URL);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    // CI downloads Chromium; locally, use the installed Chrome.
    channel: process.env.CI ? undefined : "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `pnpm exec next start --port ${PORT}`,
    url: `http://localhost:${PORT}/ar`,
    env: E2E_ENV,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
