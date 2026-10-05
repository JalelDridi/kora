import { capsBand } from "../engine/chkoun/caps-band.ts";
import { plainLatin } from "./places.ts";
import { latestPlayed } from "./results.ts";
import type {
  Confidence,
  PoolPlayer,
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

/** A placeholder value that no source gives. */
export const NONE_RATING: Rating = {
  confidence: "low",
  agreeing: ["none"],
  confidenceNote: "no source gives a value",
};

/**
 * Fields two sources can confirm in Sprint 1; the rest have one source. Of
 * those, the governorate and the birthplace are medium when precise (P36);
 * the Arabic name and the photo stay low until an override confirms them.
 */
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

/** The two pages: a closed career is read from their national rows (A7). */
const PAGES: readonly SourceId[] = ["enwiki", "frwiki"];

/** A lower count that its date explains: older than the chosen one, or undated. */
function explainedLower(c: Vote<number>, v: Vote<number>): boolean {
  return (
    v.value < c.value &&
    v.asOf !== c.asOf &&
    !(v.asOf !== null && (c.asOf === null || v.asOf > c.asOf))
  );
}

/**
 * Final wave, A7: when both pages show a closed national career, a page's
 * lower count is explained only by a date before the end of that career.
 * The notes, one per page whose count no date explains.
 */
export function closedCareerConflicts(
  chosen: Vote<number>,
  votes: Vote<number>[],
  closedEnd: number | null | undefined,
): string[] {
  if (closedEnd == null) return [];
  const end = `${closedEnd}-12-31`;
  return votes
    .filter(
      (v) =>
        PAGES.includes(v.source) &&
        explainedLower(chosen, v) &&
        (v.asOf === null || v.asOf >= end),
    )
    .map(
      (v) =>
        `${say(v)}: his national career ended in ${closedEnd}; the dates cannot explain it`,
    );
}

/**
 * Caps and goals: a count only grows, so an older, lower count is explained,
 * except after the end of a closed national career (`closedEnd`, caps only).
 */
export function rateCount(input: {
  chosen: Vote<number>;
  votes: Vote<number>[];
  today: string;
  floor?: number | null;
  ceiling?: number | null;
  closedEnd?: number | null;
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
  conflicts.push(...closedCareerConflicts(c, all, input.closedEnd));
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

/**
 * What a birthplace says (decision P36): a Tunisian place resolved to a
 * governorate; a place abroad with its country; "Tunisia" only; a place with
 * no country and no governorate; a Tunisian place with no governorate; a
 * country with no place.
 */
export type BirthPlaceKind =
  | "governorate"
  | "abroad"
  | "country-only"
  | "no-country"
  | "unresolved"
  | "no-place";

const PRECISE = "one source, precise (P36)";
const PLACE_NOTES: Record<BirthPlaceKind, string> = {
  governorate: PRECISE,
  abroad: PRECISE,
  "country-only": "born in Tunisia, town unknown",
  "no-country": "no country for this birthplace",
  unresolved: "a Tunisian place with no governorate",
  "no-place": "a country with no birthplace",
};

export type Evidence = {
  caps: Vote<number>[];
  goals: Vote<number>[];
  goalsFloor: number | null;
  capsCeiling: number | null;
  /** A7: the end year when both pages show a closed national career, else null. */
  capsClosedEnd?: number | null;
  /** P36: what the birthplace says; absent means one source, low. */
  birthPlace?: BirthPlaceKind;
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
    // A placeholder no source gives (caps or goals unknown) is always low.
    if (p.source === "none") {
      out[field] = { ...p, ...NONE_RATING };
      continue;
    }
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
            closedEnd: ev.capsClosedEnd,
          }),
          ev.skipped.national,
        );
        for (const note of closedCareerConflicts(
          vote(chosen.caps),
          ev.caps,
          ev.capsClosedEnd,
        ))
          flags.push({ kind: "caps-closed-career-disagree", detail: note });
        if (ev.capsCeiling !== null && chosen.caps > ev.capsCeiling)
          flags.push({
            kind: "caps-above-ceiling",
            detail: `${chosen.caps} caps; Tunisia played ${ev.capsCeiling} matches in his national years`,
          });
        if (capsBandAgreed(vote(chosen.caps), ev)) {
          out[field] = { ...p, ...r, bandAgreed: true };
          continue;
        }
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
      // P36: one source, but precise. Only a value Wikidata resolved gets here.
      case "governorate":
        r = {
          confidence: "medium",
          agreeing: [p.source],
          confidenceNote: PRECISE,
        };
        break;
      case "birthPlace": {
        const kind = ev.birthPlace;
        r =
          kind === "governorate" || kind === "abroad"
            ? {
                confidence: "medium",
                agreeing: [p.source],
                confidenceNote: PRECISE,
              }
            : kind
              ? {
                  confidence: "low",
                  agreeing: [p.source],
                  confidenceNote: PLACE_NOTES[kind],
                }
              : rateUndated({ chosen: vote(null), votes: [] });
        break;
      }
      default:
        r = rateUndated({ chosen: vote(null), votes: [] }); // one source: low
    }
    out[field] = { ...p, ...r };
  }
  return { provenance: out, flags };
}

/**
 * D-S2-6 (refines P27): the caps count is confirmed at band level when at
 * least two sources give a count, every count falls in one band, and nothing
 * else contradicts it: no count above the matches Tunisia played, no closed
 * national career the dates cannot explain, no skipped national rows.
 */
export function capsBandAgreed(chosen: Vote<number>, ev: Evidence): boolean {
  const all = withChosen(chosen, ev.caps);
  if (sourcesOf(all).length < 2) return false;
  const band = capsBand(chosen.value);
  if (!all.every((v) => capsBand(v.value) === band)) return false;
  if (ev.capsCeiling != null && all.some((v) => v.value > ev.capsCeiling!))
    return false;
  if (closedCareerConflicts(chosen, ev.caps, ev.capsClosedEnd).length > 0)
    return false;
  return ev.skipped.national.length === 0;
}

/** P27: what a Chkoun? puzzle shows (club and its country, position, age, caps), plus the governorate or, born abroad, the birthplace. */
export const CHKOUN_FIELDS: readonly ProvenancedField[] = [
  "clubId",
  "position",
  "birthDate",
  "caps",
];

const CHKOUN_LIST = CHKOUN_FIELDS.map((field) => `'${field}'`).join(", ");
const PLACE_FIELD =
  "CASE WHEN p.governorate IS NULL THEN 'birthPlace' ELSE 'governorate' END";

/**
 * Active footballers ready to be a Chkoun? answer (P27), as data for Sprint 2.
 * It reads the jsonb column players.provenance, shaped as written by the
 * merge: { "<field>": { "source": …, "confidence": "high" | "medium" | "low",
 * "agreeing": […], … }, … }. Ready means an entry EXISTS for every field in
 * CHKOUN_FIELDS and for the governorate (born abroad: the birthplace), and
 * each of those entries has a confidence of exactly "high" or "medium". A
 * missing entry means not ready, and so does an entry without a confidence
 * key (an unrated value: nothing says it can be trusted). One exception
 * (D-S2-6): a caps entry rated low with "bandAgreed": true passes, because
 * the game shows the band, not the count. No parameters: the field names are
 * written in from CHKOUN_FIELDS.
 */
export const ANSWER_READY_SQL = `
SELECT p.id FROM players p
WHERE p.pool_active
  AND p.provenance ?& ARRAY[${CHKOUN_LIST}]
  AND p.provenance ? (${PLACE_FIELD})
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_each(p.provenance) AS e(field, entry)
    WHERE (e.field IN (${CHKOUN_LIST}) OR e.field = ${PLACE_FIELD})
      AND COALESCE(e.entry->>'confidence', '') NOT IN ('high', 'medium')
      AND NOT (e.field = 'caps' AND COALESCE(e.entry->>'bandAgreed', '') = 'true'))
ORDER BY p.id`;

/**
 * ANSWER_READY_SQL's rule on a pool entry (final wave, B9), for the report
 * and the stop rule (P40): active, and an entry rated high or medium for
 * every field in CHKOUN_FIELDS and for the governorate (when it is null, the
 * birthplace); low caps pass when band-agreed (D-S2-6). The database test
 * checks that both agree.
 */
export function isAnswerReady(
  player: Pick<PoolPlayer, "pools" | "governorate" | "provenance">,
): boolean {
  if (!player.pools.active) return false;
  const place = player.governorate === null ? "birthPlace" : "governorate";
  return [...CHKOUN_FIELDS, place].every((field) => {
    const entry = player.provenance[field as ProvenancedField];
    if (entry?.confidence === "high" || entry?.confidence === "medium")
      return true;
    // D-S2-6: low caps whose sources all fall in one band.
    return field === "caps" && entry?.bandAgreed === true;
  });
}
