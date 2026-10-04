import { plainLatin } from "./places.ts";
import { latestPlayed } from "./results.ts";
import type {
  Confidence,
  FlagKind,
  Line,
  Match,
  Provenance,
  ProvenancedField,
  SourceId,
} from "./types.ts";

// Decision P26: every field carries high, medium or low, with the sources that
// give the chosen value. Pure; mergePlayer calls rateFields once per footballer.
// en, fr and Wikidata copy each other: "high" means consistent, not proven.
// martj42 never votes: a floor for goals, a ceiling for caps.

export const FRESH_DAYS = 365;
export const CLOSE_DAYS = 90;

export type Vote<T> = { source: SourceId; value: T; asOf: string | null };
export type Rating = {
  confidence: Confidence;
  agreeing: SourceId[];
  confidenceNote?: string;
};
type Found = { kind: FlagKind; detail: string };
type ProvenanceMap = Partial<Record<ProvenancedField, Provenance>>;

export const OVERRIDE_RATING: Rating = {
  confidence: "high",
  agreeing: ["override"],
  confidenceNote: "decided by Jalel",
};

/** Fields two sources can confirm in Sprint 1; the rest have one source. */
export const CROSS_CHECKED: readonly ProvenancedField[] = [
  "caps",
  "goals",
  "clubId",
  "birthDate",
  "position",
  "positionDetail",
  "history",
  "nameLatin",
];
export const SINGLE_SOURCE: readonly ProvenancedField[] = [
  "governorate",
  "birthPlace",
  "nameArabic",
  "photo",
];

/** Infobox fields whose skipped rows touch caps and goals (§8). */
export const NATIONAL_FIELD = /nationalteam|sélection nationale/i;

export function daysBetween(from: string, to: string): number {
  return Math.floor((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

const fresh = (asOf: string | null, today: string) =>
  asOf !== null && daysBetween(asOf, today) < FRESH_DAYS;
const shown = (value: unknown) =>
  value === null
    ? "none"
    : Array.isArray(value)
      ? `${value.length} clubs`
      : String(value);
const say = (v: Vote<unknown>) =>
  `${v.source} ${shown(v.value)} (${v.asOf ?? "undated"})`;
const withChosen = <T>(c: Vote<T>, votes: Vote<T>[]) =>
  votes.some((v) => v.source === c.source) ? votes : [c, ...votes];
const sourcesOf = <T>(votes: Vote<T>[]) => [
  ...new Set(votes.map((v) => v.source)),
];

function levels(
  c: Vote<unknown>,
  agreeing: SourceId[],
  others: number,
  conflicts: string[],
  today: string,
): Rating {
  if (conflicts.length > 0)
    return {
      confidence: "low",
      agreeing,
      confidenceNote: conflicts.join("; "),
    };
  if (agreeing.length >= 2) return { confidence: "high", agreeing };
  if (fresh(c.asOf, today))
    return {
      confidence: "medium",
      agreeing,
      confidenceNote:
        others > 0
          ? "one fresh source; the others are explained by their dates"
          : "one fresh source",
    };
  return {
    confidence: "low",
    agreeing,
    confidenceNote:
      c.asOf === null ? "one undated source" : `one source, as of ${c.asOf}`,
  };
}

/** Caps and goals: a count only grows, so an older, lower count is explained. */
export function rateCount(input: {
  chosen: Vote<number>;
  votes: Vote<number>[];
  today: string;
  floor?: number | null;
  ceiling?: number | null;
}): Rating {
  const c = input.chosen;
  const all = withChosen(c, input.votes);
  const agreeing = sourcesOf(all.filter((v) => v.value === c.value));
  const conflicts: string[] = [];
  for (const v of all) {
    if (v.value === c.value) continue;
    if (v.value > c.value) conflicts.push(`${say(v)} is higher`);
    else if (v.asOf === c.asOf) conflicts.push(`${say(v)} has the same date`);
    else if (v.asOf !== null && (c.asOf === null || v.asOf > c.asOf))
      conflicts.push(`${say(v)} is newer and lower`);
  }
  if (input.floor != null && c.value < input.floor)
    conflicts.push(`martj42 lists ${input.floor} goals by him`);
  if (input.ceiling != null && c.value > input.ceiling)
    conflicts.push(
      `Tunisia played ${input.ceiling} matches in his national years`,
    );
  return levels(
    c,
    agreeing,
    all.length - agreeing.length,
    conflicts,
    input.today,
  );
}

/** Club and history: an undated other value is stale; a dated one must be over 90 days older. */
export function rateDated<T>(input: {
  chosen: Vote<T>;
  votes: Vote<T>[];
  today: string;
  same: (a: T, b: T) => boolean;
  explained?: (older: T, newer: T) => boolean;
}): Rating {
  const { chosen: c, same } = input;
  const all = withChosen(c, input.votes);
  const agreeing = sourcesOf(all.filter((v) => same(v.value, c.value)));
  const conflicts: string[] = [];
  for (const v of all) {
    if (same(v.value, c.value) || v.asOf === null) continue;
    if (c.asOf === null)
      conflicts.push(`${say(v)} is dated, the chosen value is not`);
    else if (v.asOf > c.asOf) conflicts.push(`${say(v)} is newer`);
    else if (
      daysBetween(v.asOf, c.asOf) <= CLOSE_DAYS &&
      !input.explained?.(v.value, c.value)
    )
      conflicts.push(`${say(v)} is within ${CLOSE_DAYS} days`);
  }
  return levels(
    c,
    agreeing,
    all.length - agreeing.length,
    conflicts,
    input.today,
  );
}

/** Values without dates: agreement and majority only. */
export function rateUndated<T>(input: {
  chosen: Vote<T>;
  votes: Vote<T>[];
  same?: (a: T, b: T) => boolean;
}): Rating {
  const same = input.same ?? ((a: T, b: T) => a === b);
  const all = withChosen(input.chosen, input.votes);
  const agreeing = sourcesOf(
    all.filter((v) => same(v.value, input.chosen.value)),
  );
  const dissent = all.filter((v) => !same(v.value, input.chosen.value));
  const differs = dissent.map(say).join(", ");
  if (agreeing.length >= 2 && dissent.length === 0)
    return { confidence: "high", agreeing };
  if (agreeing.length >= 2 && agreeing.length > sourcesOf(dissent).length)
    return {
      confidence: "medium",
      agreeing,
      confidenceNote: `majority; ${differs} differs`,
    };
  return {
    confidence: "low",
    agreeing,
    confidenceNote: dissent.length === 0 ? "one source" : `${differs} differs`,
  };
}

/** §8: never high on the word of an infobox that skipped rows of this kind. */
export function capForSkipped(rating: Rating, tainted: SourceId[]): Rating {
  if (rating.confidence !== "high" || tainted.length === 0) return rating;
  if (rating.agreeing.filter((s) => !tainted.includes(s)).length >= 2)
    return rating;
  return {
    ...rating,
    confidence: "medium",
    confidenceNote: `${tainted.join(", ")} skipped rows of this field`,
  };
}

/** Tunisia matches played from 1 January of the first national year to the as-of date; null when unknowable. */
export function capsCeiling(
  matches: Match[],
  fromYear: number | null,
  toYear: number | null,
  asOf: string | null,
): number | null {
  const latest = latestPlayed(matches);
  const earliest = matches.map((m) => m.date).sort()[0];
  const start = `${fromYear}-01-01`;
  const end = toYear !== null ? `${toYear}-12-31` : asOf;
  // The file must cover the whole span, or the count is too low to be a ceiling.
  if (
    fromYear === null ||
    latest === null ||
    end === null ||
    end > latest ||
    earliest > start
  )
    return null;
  return matches.filter(
    (m) => m.homeScore !== null && m.date >= start && m.date <= end,
  ).length;
}

export const sameName = (a: string, b: string) =>
  plainLatin(a).trim() === plainLatin(b).trim();
export const titleName = (title: string) =>
  title.replace(/\s*\([^)]*\)\s*$/, "");
export const sameSet = (a: string[], b: string[]) =>
  a.length > 0 && a.length === b.length && a.every((q) => b.includes(q));
export const subset = (older: string[], newer: string[]) =>
  older.every((q) => newer.includes(q));

export type Evidence = {
  caps: Vote<number>[];
  goals: Vote<number>[];
  goalsFloor: number | null;
  capsCeiling: number | null;
  clubId: Vote<string | null>[];
  history: Vote<string[]>[];
  birthDate: Vote<string>[];
  position: Vote<Line>[];
  nameLatin: Vote<string>[];
  /** Sources whose infobox skipped rows (§8). */
  skipped: { national: SourceId[]; career: SourceId[] };
};

export type Chosen = {
  caps: number;
  goals: number;
  clubQid: string | null;
  history: string[];
  birthDate: string | null;
  position: Line | null;
  positionDetailLine: Line | null;
  nameLatin: string | null;
};

/** Rates every field that has provenance. Overrides are high; the rest follow §1. */
export function rateFields(
  provenance: ProvenanceMap,
  chosen: Chosen,
  ev: Evidence,
  today: string,
): { provenance: ProvenanceMap; flags: Found[] } {
  const out: ProvenanceMap = {};
  const flags: Found[] = [];
  for (const field of Object.keys(provenance) as ProvenancedField[]) {
    const p = provenance[field]!;
    if (p.source === "override") {
      out[field] = { ...p, ...OVERRIDE_RATING };
      continue;
    }
    const vote = <T>(value: T): Vote<T> => ({
      source: p.source,
      value,
      asOf: p.asOf ?? null,
    });
    let r: Rating;
    switch (field) {
      case "caps":
        r = capForSkipped(
          rateCount({
            chosen: vote(chosen.caps),
            votes: ev.caps,
            today,
            ceiling: ev.capsCeiling,
          }),
          ev.skipped.national,
        );
        if (ev.capsCeiling !== null && chosen.caps > ev.capsCeiling)
          flags.push({
            kind: "caps-above-ceiling",
            detail: `${chosen.caps} caps; Tunisia played ${ev.capsCeiling} matches in his national years`,
          });
        break;
      case "goals":
        r = capForSkipped(
          rateCount({
            chosen: vote(chosen.goals),
            votes: ev.goals,
            today,
            floor: ev.goalsFloor,
          }),
          ev.skipped.national,
        );
        if (ev.goalsFloor !== null && chosen.goals < ev.goalsFloor)
          flags.push({
            kind: "goals-below-floor",
            detail: `${chosen.goals} goals; martj42 lists ${ev.goalsFloor} goals by him`,
          });
        break;
      case "clubId":
        r = capForSkipped(
          rateDated({
            chosen: vote(chosen.clubQid),
            votes: ev.clubId,
            today,
            same: (a, b) => a === b,
          }),
          ev.skipped.career,
        );
        break;
      case "history":
        // sameSet never matches an empty set, so a history with no known club
        // would name no agreeing source, not even its own: low, on its source.
        if (chosen.history.length === 0) {
          r = {
            confidence: "low",
            agreeing: [p.source],
            confidenceNote: "no club in this history matches a known club",
          };
          break;
        }
        r = capForSkipped(
          rateDated({
            chosen: vote(chosen.history),
            votes: ev.history,
            today,
            same: sameSet,
            explained: subset,
          }),
          ev.skipped.career,
        );
        break;
      case "birthDate":
        r = rateUndated({
          chosen: vote(chosen.birthDate),
          votes: ev.birthDate,
        });
        break;
      case "position":
        r = rateUndated({ chosen: vote(chosen.position), votes: ev.position });
        break;
      case "positionDetail":
        r = rateUndated({
          chosen: vote(chosen.positionDetailLine),
          votes: chosen.positionDetailLine === null ? [] : ev.position,
        });
        break;
      case "nameLatin":
        r = rateUndated({
          chosen: vote(chosen.nameLatin ?? ""),
          votes: ev.nameLatin,
          same: sameName,
        });
        break;
      default:
        r = rateUndated({ chosen: vote(null), votes: [] }); // one source: low
    }
    out[field] = { ...p, ...r };
  }
  return { provenance: out, flags };
}

/** P27: what a Chkoun? puzzle shows (club and its country, position, age, caps), plus the governorate or, born abroad, the birthplace. */
export const CHKOUN_FIELDS: readonly ProvenancedField[] = [
  "clubId",
  "position",
  "birthDate",
  "caps",
];

/** Active footballers with no low field a Chkoun? puzzle shows. $1 = CHKOUN_FIELDS. Data for Sprint 2. */
export const ANSWER_READY_SQL = `
SELECT p.id FROM players p
WHERE p.pool_active AND NOT EXISTS (
  SELECT 1 FROM jsonb_each(p.provenance) AS e(field, entry)
  WHERE (e.field = ANY($1::text[]) OR e.field = CASE WHEN p.governorate IS NULL THEN 'birthPlace' ELSE 'governorate' END)
    AND e.entry->>'confidence' = 'low')
ORDER BY p.id`;
