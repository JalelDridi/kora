import type { PrismaClient } from "@/generated/prisma/client";
import { createClient } from "./client";
import { truncateAll } from "./truncate";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5434/kora_test";

// Database tests truncate tables. Refuse to run against anything but a
// local Postgres so a misconfigured environment cannot wipe a real database.
export function assertLocalDatabase(url: string): void {
  const { hostname } = new URL(url);
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    throw new Error(
      `Refusing to run database tests against non-local host "${hostname}"`,
    );
  }
}

export function createTestClient(): PrismaClient {
  assertLocalDatabase(TEST_DATABASE_URL);
  return createClient(TEST_DATABASE_URL);
}

export async function resetDatabase(db: PrismaClient): Promise<void> {
  await truncateAll(db);
}
