import { lines } from "./types.ts";
import type { Line } from "./types.ts";

// data/overrides.json: what Jalel decided, per footballer (by Wikidata id),
// each value with who decided and when. An override always wins; the nightly
// report flags sources that disagree with one.

export type OverrideValue<T> = {
  value: T;
  by: string;
  at: string;
  note?: string;
};

export type PlayerOverride = {
  /** A club's Wikidata id, or null for "no current club". */
  club?: OverrideValue<string | null>;
  position?: OverrideValue<Line>;
  positionDetail?: OverrideValue<string>;
  caps?: OverrideValue<number>;
  goals?: OverrideValue<number>;
  capsAsOf?: OverrideValue<string>;
  governorate?: OverrideValue<string | null>;
  birthCountry?: OverrideValue<string>;
  nameArabic?: OverrideValue<string>;
  aliases?: OverrideValue<string[]>;
  pools?: OverrideValue<{ active: boolean; legend: boolean }>;
  exclude?: OverrideValue<boolean>;
};

export type Overrides = {
  players: Record<string, PlayerOverride>;
  /** "en:Link title" or "fr:Link title" → club Wikidata id. */
  clubTitles: Record<string, string>;
};

const QID = /^Q\d+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Check = (value: unknown, governorates: Set<string>) => boolean;

const isCount: Check = (v) => Number.isInteger(v) && (v as number) >= 0;

const CHECKS: Record<keyof PlayerOverride, Check> = {
  club: (v) => v === null || (typeof v === "string" && QID.test(v)),
  position: (v) =>
    typeof v === "string" && (lines as readonly string[]).includes(v),
  positionDetail: (v) => typeof v === "string" && v.trim() !== "",
  caps: isCount,
  goals: isCount,
  capsAsOf: (v) => typeof v === "string" && ISO_DATE.test(v),
  governorate: (v, g) => v === null || (typeof v === "string" && g.has(v)),
  birthCountry: (v) => typeof v === "string" && /^[A-Z]{2}$/.test(v),
  nameArabic: (v) => typeof v === "string" && /\p{Script=Arabic}/u.test(v),
  aliases: (v) =>
    Array.isArray(v) &&
    v.every((a) => typeof a === "string" && a.trim() !== ""),
  pools: (v) =>
    isRecord(v) &&
    typeof v.active === "boolean" &&
    typeof v.legend === "boolean",
  exclude: (v) => typeof v === "boolean",
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * All or nothing: any error means none of the file may be applied (Task 8
 * stops the build), so an error result carries no overrides at all.
 */
export type OverridesResult =
  | { ok: true; overrides: Overrides; warnings: string[] }
  | { ok: false; errors: string[] };

/**
 * What the overrides may name: the pool's footballers and clubs (Wikidata
 * ids), and `seen`, footballers the pipeline has met (the id registry and the
 * pool's left-out list). In build mode an override for one seen but not in
 * `players` is stale: a warning, not applied; an id in neither is an error.
 * Check mode: see OverridesMode.
 */
export type KnownIds = {
  players: Set<string>;
  clubs: Set<string>;
  seen: Set<string>;
  /** Check mode: footballers the last build left out, with the reason. */
  leftOut?: Map<string, string>;
};

/**
 * "build" (run.ts, the authority: it has this run's Wikidata footballers and
 * clubs): an unknown id is an error, a known one outside `players` is stale.
 * "check" (data:check, which only has the last build): an id the last build
 * did not know, or a footballer it left out, is a warning; the next build
 * decides. Shape errors and conflicts are errors in both modes.
 */
export type OverridesMode = "build" | "check";

export function validateOverrides(
  json: unknown,
  governorates: Set<string>,
  known: KnownIds,
  mode: OverridesMode = "build",
): OverridesResult {
  const overrides: Overrides = { players: {}, clubTitles: {} };
  if (json === null || json === undefined)
    return { ok: true, overrides, warnings: [] };
  if (
    !isRecord(json) ||
    !isRecord(json.players) ||
    !isRecord(json.clubTitles)
  ) {
    return {
      ok: false,
      errors: ["overrides.json must be { players: {}, clubTitles: {} }"],
    };
  }
  const errors: string[] = [];
  const warnings: string[] = [];
  const checker = mode === "check";
  const notSeen = "not seen by the last build; the next build will decide";
  for (const [qid, entry] of Object.entries(json.players)) {
    if (!QID.test(qid) || !isRecord(entry)) {
      errors.push(`players.${qid}: not a Wikidata id with an object`);
      continue;
    }
    // Shape first, whoever the footballer is: shape errors are errors in
    // both modes.
    const before = errors.length;
    const clubWarnings: string[] = [];
    const clean: Record<string, unknown> = {};
    for (const [field, raw] of Object.entries(entry)) {
      const at = `players.${qid}.${field}`;
      // Own keys only: "toString" must not find Object.prototype.toString.
      const check = Object.hasOwn(CHECKS, field)
        ? CHECKS[field as keyof PlayerOverride]
        : undefined;
      if (!check) {
        errors.push(`${at}: unknown field`);
      } else if (
        !isRecord(raw) ||
        typeof raw.by !== "string" ||
        raw.by === "" ||
        typeof raw.at !== "string" ||
        !ISO_DATE.test(raw.at)
      ) {
        errors.push(`${at}: needs value, by and at (YYYY-MM-DD)`);
      } else if (
        field === "pools" &&
        isRecord(raw.value) &&
        raw.value.active === false &&
        raw.value.legend === false
      ) {
        errors.push(`${at}: in neither pool; use exclude`);
      } else if (!check(raw.value, governorates)) {
        errors.push(`${at}: invalid value ${JSON.stringify(raw.value)}`);
      } else if (
        field === "club" &&
        typeof raw.value === "string" &&
        !known.clubs.has(raw.value)
      ) {
        if (checker) {
          clubWarnings.push(`${at}: club "${raw.value}" ${notSeen}`);
          clean[field] = raw;
        } else {
          errors.push(`${at}: "${raw.value}" is not a club in the pool`);
        }
      } else {
        clean[field] = raw;
      }
    }
    if (errors.length > before) continue;
    // Exclusion would silently win over the rest: say so instead.
    if (
      isRecord(entry.exclude) &&
      entry.exclude.value === true &&
      Object.keys(entry).length > 1
    ) {
      errors.push(`players.${qid}: excluded and overridden at once`);
      continue;
    }
    if (!known.players.has(qid)) {
      if (checker) {
        // The build decides who exists; the checker only says what it saw.
        const reason = known.leftOut?.get(qid);
        warnings.push(
          reason
            ? `players.${qid}: left out by the last build (${reason}); this override will be applied by the next build`
            : `players.${qid}: ${notSeen}`,
        );
      } else if (known.seen.has(qid)) {
        warnings.push(
          `players.${qid}: stale override: seen by the pipeline but not in the current pool; not applied`,
        );
        continue;
      } else {
        errors.push(`players.${qid}: not a footballer in the pool`);
        continue;
      }
    }
    warnings.push(...clubWarnings);
    overrides.players[qid] = clean as PlayerOverride;
  }
  for (const [key, qid] of Object.entries(json.clubTitles)) {
    if (
      !/^(?:en|fr):.+/.test(key) ||
      typeof qid !== "string" ||
      !QID.test(qid)
    ) {
      errors.push(
        `clubTitles.${key}: must map "en:Title" or "fr:Title" to a Wikidata id`,
      );
      continue;
    }
    if (!known.clubs.has(qid)) {
      if (!checker) {
        errors.push(`clubTitles.${key}: "${qid}" is not a club in the pool`);
        continue;
      }
      warnings.push(`clubTitles.${key}: club "${qid}" ${notSeen}`);
    }
    overrides.clubTitles[key] = qid;
  }
  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, overrides, warnings };
}
