import { execSync } from "node:child_process";
import { assertLocalDatabase, TEST_DATABASE_URL } from "./testing";

// Runs once before the database tests: bring the local test database up to
// the latest migration.
export default function setup(): void {
  assertLocalDatabase(TEST_DATABASE_URL);
  execSync("pnpm exec prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL_UNPOOLED: TEST_DATABASE_URL },
  });
}
