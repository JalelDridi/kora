import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { validateOverrides } from "./overrides.ts";
import type { KnownIds } from "./overrides.ts";
import { competitions, regions } from "./types.ts";
import type { IdRegistry, Pool } from "./types.ts";
import { validateIdRegistry, validatePool } from "./validate.ts";
import { validateWitness } from "./witness/verdicts.ts";

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
 * What the last build knew, for checking overrides in "check" mode (the build
 * itself is the authority, see validateOverrides). With a pool: its
 * footballers (plus those it excluded, since an excluded footballer is never
 * in the pool) and its clubs; `leftOut` names the others it left out, with
 * the reason; `seen` adds the id registry. Without a usable pool there is
 * nothing to compare with, so every id the file names counts as known and
 * only its shape is checked. run.ts uses the no-pool form for its first,
 * shape-only pass.
 */
export function knownIds(
  pool: unknown,
  overrides: unknown,
  registry: unknown = undefined,
): KnownIds {
  const players =
    isRecord(overrides) && isRecord(overrides.players) ? overrides.players : {};
  if (usablePool(pool)) {
    const dropped = (Array.isArray(pool.dropped) ? pool.dropped : []).filter(
      (d) => isRecord(d) && typeof d.wikidataId === "string",
    );
    return {
      players: new Set([
        ...pool.players.map((p) => p.wikidataId),
        ...dropped
          .filter((d) => d.reason === "excluded")
          .map((d) => d.wikidataId),
      ]),
      clubs: new Set(pool.clubs.map((c) => c.wikidataId)),
      seen: new Set([
        ...(isRecord(registry) && isRecord(registry.players)
          ? Object.keys(registry.players)
          : []),
        ...dropped.map((d) => d.wikidataId),
      ]),
      leftOut: new Map(
        dropped
          .filter((d) => d.reason !== "excluded")
          .map((d) => [d.wikidataId, String(d.reason)]),
      ),
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
    seen: new Set(),
  };
}

/** data/curated/ligue1-strength.json: each Ligue 1 club's strength this season (30–0). */
export type StrengthFile = {
  season: string;
  by: string;
  at: string;
  note: string;
  clubs: Record<string, number>;
};

/** data/curated/afcon-2004.json: the AFCON 2004 winners, by Wikidata id (30–0). */
export type AfconFile = {
  by: string;
  at: string | null;
  footballers: string[];
};

/** Every Ligue 1 club of the pool once, nothing else, a whole number from 55 to 90. */
export function validateStrength(
  json: unknown,
  ligue1ClubIds: string[],
): string[] {
  const at = "ligue1-strength.json";
  if (!isRecord(json) || !isRecord(json.clubs))
    return [`${at}: must be { season, by, at, note, clubs }`];
  const errors: string[] = [];
  for (const key of ["season", "by", "at", "note"])
    if (typeof json[key] !== "string" || json[key] === "")
      errors.push(`${at}: ${key} must be a string`);
  for (const id of ligue1ClubIds)
    if (!(id in json.clubs)) errors.push(`${at}: no strength for ${id}`);
  for (const [id, value] of Object.entries(json.clubs)) {
    if (!ligue1ClubIds.includes(id))
      errors.push(`${at}: ${id} is not a Ligue 1 club`);
    else if (
      !Number.isInteger(value) ||
      (value as number) < 55 ||
      (value as number) > 90
    )
      errors.push(
        `${at}: ${id}: strength must be a whole number from 55 to 90, not ${String(value)}`,
      );
  }
  return errors;
}

/** Wikidata ids, each once, at most 23 (a tournament squad). */
export function validateAfcon(json: unknown): string[] {
  const at = "afcon-2004.json";
  if (
    !isRecord(json) ||
    typeof json.by !== "string" ||
    json.by === "" ||
    !(json.at === null || typeof json.at === "string") ||
    !Array.isArray(json.footballers)
  )
    return [`${at}: must be { by, at, footballers: [Wikidata ids] }`];
  const errors: string[] = [];
  if (json.footballers.length > 23)
    errors.push(
      `${at}: at most 23 footballers, not ${json.footballers.length}`,
    );
  const seen = new Set<unknown>();
  for (const q of json.footballers as unknown[]) {
    if (typeof q !== "string" || !QID.test(q))
      errors.push(`${at}: ${String(q)} is not a Wikidata id`);
    else if (seen.has(q)) errors.push(`${at}: ${q} is listed twice`);
    seen.add(q);
  }
  return errors;
}

/** The errors of checkData. */
export async function checkData(root: string): Promise<string[]> {
  return (await inspectData(root)).errors;
}

/** Errors fail data:check; warnings (overrides the next build will decide) are printed and pass. */
export async function inspectData(
  root: string,
): Promise<{ errors: string[]; warnings: string[] }> {
  const warnings: string[] = [];
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
  // data/ids.json is written by the first build; before it, there is no registry to check.
  const registry = await read("ids.json");
  const overrides = await read("overrides.json");
  const checked = validateOverrides(
    overrides ?? null,
    ids,
    knownIds(pool, overrides, registry),
    "check",
  );
  if (!checked.ok)
    errors.push(...checked.errors.map((e) => `data/overrides.json: ${e}`));
  else
    warnings.push(...checked.warnings.map((w) => `data/overrides.json: ${w}`));

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

  // 30–0 (Sprint 3). The strength file is required once there is a pool to
  // read the Ligue 1 clubs from; the AFCON 2004 file is checked when present.
  const strength = await read("curated/ligue1-strength.json");
  if (usablePool(pool)) {
    if (strength === undefined) {
      // read() has already named a file that is there but not JSON.
      if (!errors.some((e) => e.startsWith("data/curated/ligue1-strength")))
        errors.push("data/curated/ligue1-strength.json: missing");
    } else
      errors.push(
        ...validateStrength(
          strength,
          pool.clubs.filter((c) => isRecord(c) && c.ligue1).map((c) => c.id),
        ).map((e) => `data/curated/${e}`),
      );
  }
  const afcon = await read("curated/afcon-2004.json");
  if (afcon !== undefined)
    errors.push(...validateAfcon(afcon).map((e) => `data/curated/${e}`));

  const registryErrors =
    registry === undefined ? [] : validateIdRegistry(registry);
  errors.push(...registryErrors.map((e) => `data/ids.json: ${e}`));
  // Its well-formed entries still check the pool, even when others are wrong.
  const strings = (v: unknown) =>
    Object.fromEntries(
      Object.entries(isRecord(v) ? v : {}).filter(
        (e): e is [string, string] => typeof e[1] === "string",
      ),
    );
  const usableRegistry: IdRegistry | undefined = isRecord(registry)
    ? { players: strings(registry.players), clubs: strings(registry.clubs) }
    : undefined;

  if (pool !== undefined)
    errors.push(
      ...validatePool(pool, ids, usableRegistry).map(
        (e) => `data/pool.json: ${e}`,
      ),
    );

  // A photo path must name a file in public/ (review 1, L6): a pool
  // committed without its photos would show a broken image with a credit.
  if (usablePool(pool))
    for (const p of pool.players) {
      const photoPath = isRecord(p) && isRecord(p.photo) ? p.photo.path : null;
      if (typeof photoPath !== "string" || !photoPath.startsWith("/photos/"))
        continue;
      try {
        await access(path.join(root, "public", ...photoPath.split("/")));
      } catch {
        errors.push(
          `data/pool.json: ${String(p.id)}: photo ${photoPath} is not in public/`,
        );
      }
    }

  // P48 (B6): the private witness's verdicts. A footballer the pool no longer
  // holds is a warning: the next build simply does not use his verdicts.
  const witness = await read("witness.json");
  if (witness !== undefined) {
    const witnessErrors = validateWitness(witness);
    errors.push(...witnessErrors.map((e) => `data/witness.json: ${e}`));
    if (witnessErrors.length === 0 && usablePool(pool)) {
      const held = new Set(pool.players.map((p) => p.wikidataId));
      for (const qid of Object.keys((witness as { checks: object }).checks))
        if (!held.has(qid))
          warnings.push(
            `data/witness.json: ${qid} is not in the pool; his verdicts are not used`,
          );
    }
  }
  return { errors, warnings };
}
