import { readFile } from "node:fs/promises";
import path from "node:path";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { adminAccess } from "@/admin/access";
import type { Pool } from "@/pipeline/types.ts";

// The admin pages read the committed data/pool.json: the file the same
// build synced into the database, plus what the database does not hold
// (flags, the footballers left out). next.config.ts traces it into the admin
// routes' server bundle (outputFileTracingIncludes), so it exists on Vercel.
//
// Every read checks the password again, with the same rule as the proxy
// (src/admin/access.ts): the pool never depends on the proxy's matcher
// alone. This check only answers 404; asking for the password (401) stays
// the proxy's job, so a request that skipped it learns nothing.

let cached: Promise<Pool> | undefined;

async function read(): Promise<Pool> {
  const file = path.join(process.cwd(), "data", "pool.json");
  return JSON.parse(await readFile(file, "utf8")) as Pool;
}

/**
 * The pool, for a request that carries the admin password; any other request
 * gets notFound(). Read once per server in production (the file cannot
 * change under a deployment), every time in development.
 */
export async function loadPool(): Promise<Pool> {
  const authorization = (await headers()).get("authorization");
  if (adminAccess(authorization, process.env.ADMIN_PASSWORD) !== "allow") {
    notFound();
  }
  if (process.env.NODE_ENV !== "production") return read();
  cached ??= read().catch((error: unknown) => {
    cached = undefined;
    throw error;
  });
  return cached;
}
