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

export function validateOverrides(
  json: unknown,
  governorates: Set<string>,
): { overrides: Overrides; errors: string[] } {
  const overrides: Overrides = { players: {}, clubTitles: {} };
  if (json === null || json === undefined) return { overrides, errors: [] };
  if (
    !isRecord(json) ||
    !isRecord(json.players) ||
    !isRecord(json.clubTitles)
  ) {
    return {
      overrides,
      errors: ["overrides.json must be { players: {}, clubTitles: {} }"],
    };
  }
  const errors: string[] = [];
  for (const [qid, entry] of Object.entries(json.players)) {
    if (!QID.test(qid) || !isRecord(entry)) {
      errors.push(`players.${qid}: not a Wikidata id with an object`);
      continue;
    }
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
      } else if (!check(raw.value, governorates)) {
        errors.push(`${at}: invalid value ${JSON.stringify(raw.value)}`);
      } else {
        clean[field] = raw;
      }
    }
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
    overrides.clubTitles[key] = qid;
  }
  return { overrides, errors };
}
