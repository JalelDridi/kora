import pg from "pg";
import { withConnectionRetry } from "@/pipeline/wake.ts";

// One plain pg connection for server code that needs a transaction or the
// pipeline's SqlClient (the calendar, the nightly copy): Prisma's raw
// queries may each take another pooled connection. Waits for a suspended
// Neon compute like the build does. The URL is never printed.

async function connect(url: string): Promise<pg.Client> {
  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: 10_000,
  });
  // A dropped idle connection must not crash the function; queries still fail.
  client.on("error", () => {});
  try {
    await client.connect();
    return client;
  } catch (error) {
    await client.end().catch(() => {});
    throw error;
  }
}

/** A fresh connection to this environment's database; the caller ends it. */
export async function openPg(): Promise<pg.Client> {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return withConnectionRetry(() => connect(url), {
    attempts: 3,
    delayMs: 3000,
  });
}

/** Runs `work` on a fresh connection, then closes it. */
export async function withPg<T>(
  work: (client: pg.Client) => Promise<T>,
): Promise<T> {
  const client = await openPg();
  try {
    return await work(client);
  } finally {
    await client.end().catch(() => {});
  }
}
