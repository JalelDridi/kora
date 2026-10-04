import type { PrismaClient } from "@/generated/prisma/client";
import { createClient } from "./client";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5434/kora_test";

// Database tests truncate tables. Refuse to run against anything but a
// local Postgres so a misconfigured environment cannot wipe a real database.
export function assertLocalDatabase(url: string): void {
  const { hostname, search } = new URL(url);
  // The pg driver copies query parameters into its config, and ?host= or
  // ?hostaddr= override the hostname checked below. Allow none at all.
  if (search !== "") {
    throw new Error(
      "Refusing to run database tests against a URL with a query string",
    );
  }
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    throw new Error(
      `Refusing to run database tests against non-local host "${hostname}"`,
    );
  }
}

// Only clients made here have passed the check above, so only they may be
// truncated.
const testClients = new WeakSet<PrismaClient>();

export function createTestClient(): PrismaClient {
  assertLocalDatabase(TEST_DATABASE_URL);
  const db = createClient(TEST_DATABASE_URL);
  testClients.add(db);
  return db;
}

/** Empties every table. Only accepts a client from createTestClient. */
export async function resetDatabase(db: PrismaClient): Promise<void> {
  if (!testClients.has(db)) {
    throw new Error(
      "resetDatabase only accepts a client made by createTestClient",
    );
  }
  await db.$executeRawUnsafe(
    `TRUNCATE "results", "reports", "puzzles", "players", "clubs"
     RESTART IDENTITY CASCADE`,
  );
}
