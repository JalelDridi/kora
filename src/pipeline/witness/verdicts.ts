import type { Mapping } from "./mapping.ts";
import { SITE_NAMES } from "./plan.ts";
import type { SiteName } from "./plan.ts";

// B6 (S18, S19, S29): verdicts, never values. A verdict says which site was
// checked on which day, whether it agrees with our published value, and
// that value (`checked`), so that a verdict stops counting once our value
// changes. The site's own value is never stored here. Pure.

export type Verdict = "agrees" | "differs" | "not-found" | "not-comparable";
export const VERDICTS: readonly Verdict[] = [
  "agrees",
  "differs",
  "not-found",
  "not-comparable",
];

export type WitnessField = "clubId" | "caps";
export const WITNESS_FIELDS: readonly WitnessField[] = ["clubId", "caps"];

export type WitnessCheck = {
  site: SiteName;
  /** ISO date of the check. */
  checkedOn: string;
  verdict: Verdict;
  /** OUR published value at check time: the club's Wikidata id (or null for none), or the caps. */
  checked: string | number | null;
  /** Caps "differs" only: our count dates on or after the site's latest A match (same-date), or has no date (older). */
  reason?: "same-date" | "older";
};

/** data/witness.json */
export type WitnessFile = {
  version: 1;
  checks: Record<string, Partial<Record<WitnessField, WitnessCheck>>>;
};

export const emptyWitness = (): WitnessFile => ({ version: 1, checks: {} });

export type Tally = {
  checks: { qid: string; field: WitnessField; check: WitnessCheck }[];
  /** Footballers with no id on the site (S25): no verdict, counted. */
  noId: number;
  /** Footballers with an id that this run could not judge (page not read, club abroad and unlisted, club unmapped, a loan row). */
  unjudged: number;
  /** Club verdicts only: our Ligue 1 clubs with no Transfermarkt id on Wikidata. */
  unmappedClubs?: string[];
  /** Club verdicts only: our Ligue 1 clubs whose Wikidata id is not a club of the league page. */
  mismatchedClubs?: string[];
};

/**
 * Club verdicts from Transfermarkt's Ligue 1 squad pages. `squads` holds
 * the pages read this run: Transfermarkt club id → the player ids listed.
 */
export function clubVerdicts(input: {
  players: { qid: string; clubQid: string | null }[];
  mapping: Mapping;
  squads: Map<string, Set<string>>;
  /** Our Ligue 1 clubs (Wikidata ids). */
  ligue1: Set<string>;
  /** The clubs the league page lists (Transfermarkt ids). */
  leagueIds: Set<string>;
  /** Players a squad page marks as on loan (Transfermarkt ids): never "differs". */
  loans?: Set<string>;
  today: string;
}): Tally {
  // Fix round 1: a Ligue 1 club we cannot tie to the league page gives no
  // verdict at all: Wikidata has no id for it (unmapped), or its id is not
  // a club of the league page (mismatch; the league page's ids are not
  // trusted over Wikidata, nor the reverse).
  const unmapped = [...input.ligue1].filter((q) => !input.mapping.clubs.has(q));
  const mismatched = [...input.ligue1].filter((q) => {
    const id = input.mapping.clubs.get(q);
    return id !== undefined && !input.leagueIds.has(id);
  });
  const untied = new Set([...unmapped, ...mismatched]);
  const tally: Tally = {
    checks: [],
    noId: 0,
    unjudged: 0,
    unmappedClubs: unmapped.sort(),
    mismatchedClubs: mismatched.sort(),
  };
  for (const p of input.players) {
    const tmId = input.mapping.players.get(p.qid)?.transfermarkt;
    if (!tmId) {
      tally.noId++;
      continue;
    }
    const listedAt = [...input.squads]
      .filter(([, ids]) => ids.has(tmId))
      .map(([club]) => club);
    if (p.clubQid !== null && untied.has(p.clubQid)) {
      tally.unjudged++;
      continue;
    }
    const ours = p.clubQid ? input.mapping.clubs.get(p.clubQid) : undefined;
    let verdict: Verdict | null;
    if (
      p.clubQid !== null &&
      input.ligue1.has(p.clubQid) &&
      !input.squads.has(ours!)
    )
      verdict = null; // his club's page was not read this run
    else if (ours !== undefined && input.squads.has(ours))
      verdict = listedAt.includes(ours)
        ? "agrees"
        : listedAt.length > 0
          ? "differs"
          : "not-found";
    else verdict = listedAt.length > 0 ? "differs" : null;
    if (verdict === "differs" && input.loans?.has(tmId)) verdict = null;
    if (verdict === null) {
      tally.unjudged++;
      continue;
    }
    tally.checks.push({
      qid: p.qid,
      field: "clubId",
      check: {
        site: "transfermarkt",
        checkedOn: input.today,
        verdict,
        checked: p.clubQid,
      },
    });
  }
  return tally;
}

/**
 * Caps verdicts from national-football-teams.com (S19). `careers` holds,
 * per site player id, the career FIFA count of his page (null: the page
 * is missing). `latestMatch` is the newest A match on the country page.
 */
export function capsVerdicts(input: {
  players: { qid: string; caps: number; capsAsOf: string | null }[];
  mapping: Mapping;
  careers: Map<string, number | null>;
  latestMatch: string | null;
  today: string;
}): Tally {
  const tally: Tally = { checks: [], noId: 0, unjudged: 0 };
  for (const p of input.players) {
    const id = input.mapping.players.get(p.qid)?.nft;
    if (!id) {
      tally.noId++;
      continue;
    }
    if (!input.careers.has(id)) {
      tally.unjudged++;
      continue;
    }
    const theirs = input.careers.get(id) ?? null;
    const check: WitnessCheck = {
      site: "national-football-teams",
      checkedOn: input.today,
      verdict: "agrees",
      checked: p.caps,
    };
    if (theirs === null) check.verdict = "not-found";
    else if (theirs !== p.caps) {
      if (
        p.capsAsOf !== null &&
        input.latestMatch !== null &&
        input.latestMatch > p.capsAsOf
      )
        check.verdict = "not-comparable";
      else {
        check.verdict = "differs";
        check.reason = p.capsAsOf === null ? "older" : "same-date";
      }
    }
    tally.checks.push({ qid: p.qid, field: "caps", check });
  }
  return tally;
}

/** Keeps the newest verdict per footballer and field; on a tie, the new one. */
export function mergeChecks(
  file: WitnessFile,
  updates: Tally["checks"],
): WitnessFile {
  const checks: WitnessFile["checks"] = structuredClone(file.checks);
  for (const { qid, field, check } of updates) {
    const old = checks[qid]?.[field];
    if (old && old.checkedOn > check.checkedOn) continue;
    checks[qid] = { ...checks[qid], [field]: { ...check } };
  }
  return { version: 1, checks };
}

/** The file as committed: keys in natural order, two spaces, a final newline. */
export function witnessJson(file: WitnessFile): string {
  const sort = (v: unknown): unknown =>
    typeof v !== "object" || v === null || Array.isArray(v)
      ? v
      : Object.fromEntries(
          Object.keys(v)
            .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
            .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
        );
  return JSON.stringify(sort(file), null, 2) + "\n";
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const QID = /^Q\d+$/;
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** The errors in a data/witness.json (S18): shape, dates, sites, verdicts, nothing else. */
export function validateWitness(json: unknown): string[] {
  if (!isRecord(json) || json.version !== 1 || !isRecord(json.checks))
    return ['must be { "version": 1, "checks": { ... } }'];
  const errors: string[] = [];
  for (const key of Object.keys(json))
    if (key !== "version" && key !== "checks")
      errors.push(`unknown key ${key}`);
  for (const [qid, fields] of Object.entries(json.checks)) {
    if (!QID.test(qid)) errors.push(`checks.${qid}: not a Wikidata id`);
    if (!isRecord(fields)) {
      errors.push(`checks.${qid}: not an object`);
      continue;
    }
    for (const [field, v] of Object.entries(fields)) {
      const at = `checks.${qid}.${field}`;
      if (!(WITNESS_FIELDS as readonly string[]).includes(field)) {
        errors.push(`${at}: unknown field`);
        continue;
      }
      if (!isRecord(v)) {
        errors.push(`${at}: not an object`);
        continue;
      }
      for (const key of Object.keys(v))
        if (
          !["site", "checkedOn", "verdict", "checked", "reason"].includes(key)
        )
          errors.push(
            `${at}: unknown key ${key} (a verdict holds no value of the site's)`,
          );
      if (!(SITE_NAMES as readonly unknown[]).includes(v.site))
        errors.push(`${at}: unknown site ${String(v.site)}`);
      if (
        typeof v.checkedOn !== "string" ||
        !ISO.test(v.checkedOn) ||
        Number.isNaN(Date.parse(v.checkedOn))
      )
        errors.push(`${at}: checkedOn must be an ISO date`);
      if (!(VERDICTS as readonly unknown[]).includes(v.verdict))
        errors.push(`${at}: unknown verdict ${String(v.verdict)}`);
      if (
        field === "clubId" &&
        !(
          v.checked === null ||
          (typeof v.checked === "string" && QID.test(v.checked))
        )
      )
        errors.push(`${at}: checked must be our club's Wikidata id or null`);
      if (
        field === "caps" &&
        !(Number.isInteger(v.checked) && (v.checked as number) >= 0)
      )
        errors.push(`${at}: checked must be our caps, a whole number`);
      if (v.reason !== undefined) {
        if (field !== "caps" || v.verdict !== "differs")
          errors.push(`${at}: a reason goes only with a caps "differs"`);
        else if (v.reason !== "same-date" && v.reason !== "older")
          errors.push(`${at}: reason must be same-date or older`);
      }
    }
  }
  return errors;
}
