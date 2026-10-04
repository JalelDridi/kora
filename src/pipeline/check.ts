import { readFile } from "node:fs/promises";
import path from "node:path";
import { validateOverrides } from "./overrides.ts";
import type { KnownIds } from "./overrides.ts";
import { competitions, regions } from "./types.ts";
import type { IdRegistry, Pool } from "./types.ts";
import { validateIdRegistry, validatePool } from "./validate.ts";

// Every file in data/ that people edit or the job writes, checked in CI.

const QID = /^Q\d+$/;
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Pool shape good enough to read its ids from (validatePool says the rest). */
function usablePool(json: unknown): json is Pool {
  return (
    isRecord(json) &&
    json.version === 1 &&
    Array.isArray(json.players) &&
    Array.isArray(json.clubs)
  );
}

/**
 * Who the overrides may name. With a pool: its footballers and clubs, plus
 * footballers the overrides exclude (an excluded footballer is never in the
 * pool). Without a usable pool there is nothing to check them against, so
 * every id the file names counts as known and only its shape is checked.
 */
export function knownIds(pool: unknown, overrides: unknown): KnownIds {
  const players =
    isRecord(overrides) && isRecord(overrides.players) ? overrides.players : {};
  if (usablePool(pool)) {
    const excluded = Object.entries(players)
      .filter(
        ([, o]) =>
          isRecord(o) && isRecord(o.exclude) && o.exclude.value === true,
      )
      .map(([qid]) => qid);
    return {
      players: new Set([...pool.players.map((p) => p.wikidataId), ...excluded]),
      clubs: new Set(pool.clubs.map((c) => c.wikidataId)),
    };
  }
  const clubs = Object.values(players)
    .map((o) => (isRecord(o) && isRecord(o.club) ? o.club.value : null))
    .concat(
      isRecord(overrides) && isRecord(overrides.clubTitles)
        ? Object.values(overrides.clubTitles)
        : [],
    );
  return {
    players: new Set(Object.keys(players)),
    clubs: new Set(clubs.filter((q): q is string => typeof q === "string")),
  };
}

export async function checkData(root: string): Promise<string[]> {
  const errors: string[] = [];
  const read = async (name: string): Promise<unknown> => {
    try {
      return JSON.parse(await readFile(path.join(root, "data", name), "utf8"));
    } catch (error) {
      if ((error as { code?: string }).code !== "ENOENT")
        errors.push(`data/${name}: ${(error as Error).message}`);
      return undefined;
    }
  };

  const governorates = await read("curated/governorates.json");
  const ids = new Set<string>();
  if (!Array.isArray(governorates) || governorates.length !== 24) {
    errors.push(
      "data/curated/governorates.json: must list the 24 governorates",
    );
  } else {
    for (const row of governorates) {
      const at = `data/curated/governorates.json: governorate ${isRecord(row) ? String(row.id) : JSON.stringify(row)}`;
      if (!isRecord(row)) {
        errors.push(`${at}: not an object`);
        continue;
      }
      if (
        typeof row.id !== "string" ||
        !/^[a-z]+(?:-[a-z]+)*$/.test(row.id) ||
        ids.has(row.id)
      )
        errors.push(`${at}: bad or duplicate id`);
      if (typeof row.id === "string") ids.add(row.id);
      if (!(regions as readonly unknown[]).includes(row.region))
        errors.push(`${at}: unknown region ${String(row.region)}`);
      if (!row.nameLatin || !row.nameArabic || !row.nameFrench)
        errors.push(`${at}: a name is missing`);
    }
  }

  const pool = await read("pool.json");
  const overrides = await read("overrides.json");
  const checked = validateOverrides(
    overrides ?? null,
    ids,
    knownIds(pool, overrides),
  );
  if (!checked.ok)
    errors.push(...checked.errors.map((e) => `data/overrides.json: ${e}`));

  const ligue1 = await read("curated/ligue1-clubs.json");
  if (
    ligue1 !== undefined &&
    (!isRecord(ligue1) ||
      typeof ligue1.season !== "string" ||
      !Array.isArray(ligue1.clubs) ||
      ligue1.clubs.length > 20 ||
      !ligue1.clubs.every((c) => typeof c === "string" && c !== ""))
  ) {
    errors.push(
      "data/curated/ligue1-clubs.json: must be { season, clubs: [up to 20 English titles] }",
    );
  }

  const honours = await read("curated/honours.json");
  if (honours !== undefined) {
    if (!Array.isArray(honours)) {
      errors.push("data/curated/honours.json: must be a list");
    } else {
      // An edition ends the year it starts or the next one, as the database checks.
      const editions = new Set<string>();
      for (const h of honours) {
        const ok =
          isRecord(h) &&
          (competitions as readonly unknown[]).includes(h.competition) &&
          Number.isInteger(h.seasonStart) &&
          Number.isInteger(h.seasonEnd) &&
          (h.seasonEnd === h.seasonStart ||
            h.seasonEnd === (h.seasonStart as number) + 1) &&
          typeof h.clubWikidataId === "string" &&
          QID.test(h.clubWikidataId) &&
          typeof h.by === "string" &&
          h.by !== "" &&
          typeof h.at === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(h.at);
        if (!ok) {
          errors.push(
            `data/curated/honours.json: invalid entry ${JSON.stringify(h)}`,
          );
          continue;
        }
        const key = `${String(h.competition)}|${String(h.seasonStart)}|${String(h.seasonEnd)}`;
        if (editions.has(key))
          errors.push(
            `data/curated/honours.json: edition ${String(h.competition)} ${String(h.seasonStart)}–${String(h.seasonEnd)} twice`,
          );
        editions.add(key);
      }
    }
  }

  // data/ids.json is written by the first build; before it, there is no registry to check.
  const registry = await read("ids.json");
  const registryErrors =
    registry === undefined ? [] : validateIdRegistry(registry);
  errors.push(...registryErrors.map((e) => `data/ids.json: ${e}`));
  // Its well-formed entries still check the pool, even when others are wrong.
  const usableRegistry: IdRegistry | undefined = isRecord(registry)
    ? Object.fromEntries(
        Object.entries(registry).filter(
          (e): e is [string, string] => typeof e[1] === "string",
        ),
      )
    : undefined;

  if (pool !== undefined)
    errors.push(
      ...validatePool(pool, ids, usableRegistry).map(
        (e) => `data/pool.json: ${e}`,
      ),
    );
  return errors;
}
