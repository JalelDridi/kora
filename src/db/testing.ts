import type { PrismaClient } from "@/generated/prisma/client";
import { assertLocalDatabase } from "@/pipeline/database-url.ts";
import { createClient } from "./client";

// The guard lives beside the sync, which Node runs without a bundler.
export { assertLocalDatabase };

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5434/kora_test";

// Only clients made here have passed the check above, so only they may be
// truncated.
const testClients = new WeakSet<PrismaClient>();

export function createTestClient(): PrismaClient {
  assertLocalDatabase(TEST_DATABASE_URL);
  const db = createClient(TEST_DATABASE_URL);
  testClients.add(db);
  return db;
}

/** Every table, in an order TRUNCATE ... CASCADE accepts. */
export const resetTables = [
  "results",
  "reports",
  "puzzles",
  "player_clubs",
  "honours",
  "players",
  "clubs",
  "governorates",
] as const;

/** Empties every table. Only accepts a client from createTestClient. */
export async function resetDatabase(db: PrismaClient): Promise<void> {
  if (!testClients.has(db)) {
    throw new Error(
      "resetDatabase only accepts a client made by createTestClient",
    );
  }
  const tables = resetTables.map((table) => `"${table}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}
