import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

export function createClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const globalForDb = globalThis as { db?: PrismaClient };

// Created on first use so that importing this module never needs a database,
// and reused across hot reloads and warm serverless invocations.
export function getDb(): PrismaClient {
  if (!globalForDb.db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb.db = createClient(url);
  }
  return globalForDb.db;
}
