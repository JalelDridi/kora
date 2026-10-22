import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { tunisDay } from "@/engine/chkoun/day.ts";
import { buildSeasonData } from "@/engine/season/data.ts";
import type { SeasonFiles } from "@/engine/season/data.ts";
import type { SeasonData } from "@/engine/season/types.ts";
import type { Pool } from "@/pipeline/types.ts";

// The 30–0 candidates for the draft endpoint, read once per server instance
// from the committed data/pool.json and the two curated files (traced into
// the function by next.config.ts, outputFileTracingIncludes).

let loaded: Promise<SeasonData> | undefined;

async function load(): Promise<SeasonData> {
  const data = path.join(process.cwd(), "data");
  const json = async <T>(...parts: string[]) =>
    JSON.parse(await readFile(path.join(data, ...parts), "utf8")) as T;
  const [pool, strength, afcon] = await Promise.all([
    json<Pool>("pool.json"),
    json<SeasonFiles["strength"]>("curated", "ligue1-strength.json"),
    json<SeasonFiles["afcon"]>("curated", "afcon-2004.json"),
  ]);
  const currentYear = Number(tunisDay(new Date()).slice(0, 4));
  return buildSeasonData(pool, { strength, afcon }, currentYear);
}

export function getSeasonData(): Promise<SeasonData> {
  loaded ??= load().catch((error: unknown) => {
    loaded = undefined;
    throw error;
  });
  return loaded;
}
