import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { GovernorateRow, Pool } from "@/pipeline/types.ts";
import { buildFootballers } from "./attributes.ts";
import type { Footballers } from "./attributes.ts";

// The footballers' facts for the guess endpoint, read once per server
// instance from the committed data/pool.json and governorates file (traced
// into the function by next.config.ts, outputFileTracingIncludes). Server
// only: the answer's card leaves the server only when a game has ended.

let loaded: Promise<Footballers> | undefined;

async function load(): Promise<Footballers> {
  const data = path.join(process.cwd(), "data");
  const [pool, governorates] = await Promise.all([
    readFile(path.join(data, "pool.json"), "utf8").then(
      (text) => JSON.parse(text) as Pool,
    ),
    readFile(path.join(data, "curated", "governorates.json"), "utf8").then(
      (text) => JSON.parse(text) as GovernorateRow[],
    ),
  ]);
  return buildFootballers(pool, governorates);
}

export function getFootballers(): Promise<Footballers> {
  loaded ??= load().catch((error: unknown) => {
    loaded = undefined;
    throw error;
  });
  return loaded;
}
