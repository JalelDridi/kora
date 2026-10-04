import type { PrismaClient } from "@/generated/prisma/client";

/** Empties every table. Only tests call this. */
export async function truncateAll(db: PrismaClient): Promise<void> {
  await db.$executeRawUnsafe(
    `TRUNCATE "results", "reports", "puzzles", "players", "clubs"
     RESTART IDENTITY CASCADE`,
  );
}
