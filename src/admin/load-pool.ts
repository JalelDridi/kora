import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Pool } from "@/pipeline/types.ts";

// The admin pages read the committed data/pool.json: the file the same
// build synced into the database, plus what the database does not hold
// (flags, the footballers left out). next.config.ts traces it into the admin
// routes' server bundle (outputFileTracingIncludes), so it exists on Vercel.

let cached: Promise<Pool> | undefined;

async function read(): Promise<Pool> {
  const file = path.join(process.cwd(), "data", "pool.json");
  return JSON.parse(await readFile(file, "utf8")) as Pool;
}

/** Read once per server in production (the file cannot change under a deployment); every time in development. */
export function loadPool(): Promise<Pool> {
  if (process.env.NODE_ENV !== "production") return read();
  cached ??= read().catch((error: unknown) => {
    cached = undefined;
    throw error;
  });
  return cached;
}
