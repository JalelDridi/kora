import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Locale } from "@/i18n/locales";
import type { GovernorateRow, Pool } from "@/pipeline/types.ts";
import arLatnTNCountries from "../../messages/countries/ar-Latn-TN.json";
import arTNCountries from "../../messages/countries/ar-TN.json";
import { buildLabels, type Labels } from "./labels";
import { packNames, type PackedName } from "./search-index";

// What the game page loads after its first paint (/chkoun-data/<locale>.json,
// built at build time from the committed data/pool.json and governorates):
// the names every visitor may guess and the label tables. Never the puzzle, never the database: the
// day's answer stays on the server until a game ends (plan Task 12).

const derjaCountries: Record<Locale, Record<string, string> | null> = {
  "ar-TN": arTNCountries,
  "ar-Latn-TN": arLatnTNCountries,
  fr: null,
};

async function readJson<T>(...parts: string[]): Promise<T> {
  const file = path.join(process.cwd(), "data", ...parts);
  return JSON.parse(await readFile(file, "utf8")) as T;
}

let cached: Promise<{ pool: Pool; governorates: GovernorateRow[] }> | undefined;

/** The pool and governorates, read once per build or server. */
export function readGameFiles(): Promise<{
  pool: Pool;
  governorates: GovernorateRow[];
}> {
  cached ??= Promise.all([
    readJson<Pool>("pool.json"),
    readJson<GovernorateRow[]>("curated", "governorates.json"),
  ])
    .then(([pool, governorates]) => ({ pool, governorates }))
    .catch((error: unknown) => {
      cached = undefined;
      throw error;
    });
  return cached;
}

export async function gamePageData(
  locale: Locale,
): Promise<{ names: PackedName[]; labels: Labels }> {
  const { pool, governorates } = await readGameFiles();
  return {
    names: packNames(pool),
    labels: buildLabels(pool, governorates, locale, derjaCountries[locale]),
  };
}
