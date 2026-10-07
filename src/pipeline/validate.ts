import { fameTier } from "./fame.ts";
import { competitions, confidences, droppedReasons, lines } from "./types.ts";
import type { Confidence, IdRegistry, Pool } from "./types.ts";

// The same rules the database enforces, checked before anything is written,
// so a bad night fails in the job and not in a deploy.

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const QID = /^Q\d+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const COUNTRY = /^[A-Z]{2}$/;
const year = (y: number | null) =>
  y === null || (Number.isInteger(y) && y >= 1900 && y <= 2100);
const count = (n: number | null) =>
  n === null || (Number.isInteger(n) && n >= 0);
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** The registry's entry for a Wikidata id must exist and be this id. */
function registered(
  space: IdRegistry["players"],
  qid: unknown,
  id: string,
  at: string,
): string[] {
  if (typeof qid !== "string") return [];
  if (!Object.hasOwn(space, qid)) return [`${at}: no entry in data/ids.json`];
  return space[qid] === id
    ? []
    : [`${at}: id differs from data/ids.json (${space[qid]})`];
}

const WINDOW = /^\d{6}-\d{6}$/;
const views = (n: unknown) =>
  typeof n === "number" && Number.isInteger(n) && n >= 0;

/** D-S2-4: measured (score, tier from it, views, window) or not (all null). */
function validFame(fame: unknown): boolean {
  if (!isRecord(fame) || typeof fame.localStar !== "boolean") return false;
  if (fame.score === null)
    return fame.tier === null && fame.views === null && fame.window === null;
  const v = fame.views;
  return (
    typeof fame.score === "number" &&
    fame.score >= 0 &&
    fame.score <= 10 &&
    fame.tier === fameTier(fame.score) &&
    isRecord(v) &&
    views(v.en) &&
    views(v.fr) &&
    views(v.ar) &&
    typeof fame.window === "string" &&
    (fame.window === "" || WINDOW.test(fame.window))
  );
}

/** Rows that are objects; each other row is a named error, not a TypeError. */
function rows<T>(list: unknown[], label: string, errors: string[]): T[] {
  return list.filter((row, i) => {
    if (!isRecord(row)) errors.push(`${label} row ${i + 1}: not an object`);
    return isRecord(row);
  }) as T[];
}

/**
 * data/ids.json: { players, clubs }, each Wikidata ids to slugs, and within
 * each namespace no slug given to two Wikidata ids.
 */
export function validateIdRegistry(json: unknown): string[] {
  if (!isRecord(json) || !isRecord(json.players) || !isRecord(json.clubs))
    return ["must be { players: {}, clubs: {} }"];
  const errors: string[] = [];
  for (const space of ["players", "clubs"] as const) {
    const owner = new Map<string, string>();
    const twice: string[] = [];
    for (const [qid, id] of Object.entries(
      json[space] as Record<string, unknown>,
    )) {
      if (!QID.test(qid) || typeof id !== "string" || !SLUG.test(id)) {
        errors.push(`${space}.${qid}: not a Wikidata id with an id`);
        continue;
      }
      const first = owner.get(id);
      if (first) twice.push(`${space}: id ${id} given to ${first} and ${qid}`);
      else owner.set(id, qid);
    }
    errors.push(...twice);
  }
  return errors;
}

/**
 * With `registry` (data/ids.json, when it exists), each footballer's and each
 * club's id must be
 * the one registered for his Wikidata id.
 */
export function validatePool(
  input: unknown,
  governorateIds: Set<string>,
  registry?: IdRegistry,
): string[] {
  const pool = input as Pool;
  if (
    pool?.version !== 1 ||
    !Array.isArray(pool.players) ||
    !Array.isArray(pool.clubs) ||
    !Array.isArray(pool.honours) ||
    !Array.isArray(pool.flags) ||
    !Array.isArray(pool.dropped)
  ) {
    return ["not a version 1 pool"];
  }
  const errors: string[] = [];
  const clubIds = new Set<string>();
  for (const club of rows<Pool["clubs"][number]>(pool.clubs, "club", errors)) {
    const at = `club ${club.id}`;
    if (registry)
      errors.push(...registered(registry.clubs, club.wikidataId, club.id, at));
    if (!SLUG.test(club.id) || clubIds.has(club.id))
      errors.push(`${at}: bad or duplicate id`);
    clubIds.add(club.id);
    if (!QID.test(club.wikidataId)) errors.push(`${at}: bad Wikidata id`);
    if (!club.nameLatin) errors.push(`${at}: no name`);
    if (!COUNTRY.test(club.country))
      errors.push(`${at}: country ${club.country}`);
  }
  const ids = new Set<string>();
  const qids = new Set<string>();
  for (const p of rows<Pool["players"][number]>(
    pool.players,
    "player",
    errors,
  )) {
    const at = `player ${p.id}`;
    if (!SLUG.test(p.id)) errors.push(`${at}: id is not a slug`);
    if (p.clubId !== null && !clubIds.has(p.clubId))
      errors.push(`${at}: unknown club ${p.clubId}`);
    if (p.birthCountry !== null && !COUNTRY.test(p.birthCountry))
      errors.push(`${at}: birth country ${p.birthCountry}`);
    if (p.governorate !== null && !governorateIds.has(p.governorate))
      errors.push(`${at}: unknown governorate ${p.governorate}`);
    if (
      p.governorate !== null &&
      p.birthCountry !== null &&
      p.birthCountry !== "TN"
    ) {
      errors.push(
        `${at}: governorate ${p.governorate} but born in ${p.birthCountry}`,
      );
    }
    if (p.photo && (!p.photo.file || !p.photo.licence || !p.photo.sourceUrl))
      errors.push(`${at}: photo without licence or source page`);
    // P30, as the database checks (players_photo_path_shape).
    if (
      p.photo?.path != null &&
      p.photo.path !== `/photos/${p.id}.jpg` &&
      p.photo.path !== `/photos/${p.id}.png`
    )
      errors.push(`${at}: photo path ${p.photo.path}`);
    if (ids.has(p.id)) errors.push(`${at}: duplicate id`);
    ids.add(p.id);
    if (!QID.test(p.wikidataId) || qids.has(p.wikidataId))
      errors.push(`${at}: duplicate Wikidata id ${p.wikidataId}`);
    qids.add(p.wikidataId);
    if (!p.nameLatin) errors.push(`${at}: no Latin name`);
    if (!lines.includes(p.position))
      errors.push(`${at}: position ${p.position}`);
    if (!ISO_DATE.test(p.birthDate))
      errors.push(`${at}: birth date ${p.birthDate}`);
    if (!count(p.caps) || !count(p.goals)) errors.push(`${at}: caps or goals`);
    if (p.capsAsOf !== null && !ISO_DATE.test(p.capsAsOf))
      errors.push(`${at}: caps date ${p.capsAsOf}`);
    for (const s of p.history) {
      if (s.clubId !== null && !clubIds.has(s.clubId))
        errors.push(`${at}: spell at unknown club ${s.clubId}`);
      if (!year(s.from) || !year(s.to) || !count(s.apps) || !count(s.goals))
        errors.push(`${at}: spell at ${s.clubName} has an impossible number`);
      if (s.from !== null && s.to !== null && s.from > s.to)
        errors.push(`${at}: spell at ${s.clubName} ends before it starts`);
    }
    if (registry)
      errors.push(...registered(registry.players, p.wikidataId, p.id, at));
    // P54: a footballer who left the active pool keeps his grace date.
    const grace = p.pools.graceUntil;
    if (grace !== undefined) {
      if (typeof grace !== "string" || !ISO_DATE.test(grace))
        errors.push(`${at}: grace until ${String(grace)}`);
      else if (p.pools.active)
        errors.push(`${at}: grace on an active footballer`);
    }
    // D-S2-4: absent in a pool built before Sprint 2. A footballer in grace
    // keeps his last fame (P54).
    if (p.fame !== undefined && p.fame !== null) {
      if (!validFame(p.fame)) errors.push(`${at}: fame is malformed`);
      else if (!p.pools.active && grace === undefined)
        errors.push(`${at}: a legend only has no fame`);
    }
    if (!p.pools.active && !p.pools.legend && grace === undefined)
      errors.push(`${at}: in neither pool`);
    // Decision P26: every value says how sure it is, and on whose word.
    for (const [field, e] of Object.entries(p.provenance ?? {})) {
      if (!confidences.includes(e.confidence as Confidence))
        errors.push(`${at}: ${field} has no confidence`);
      else if (!Array.isArray(e.agreeing) || e.agreeing.length === 0)
        errors.push(`${at}: ${field} names no agreeing source`);
    }
  }
  // Who was left out: never also in the pool, in Wikidata-number order, once.
  const leftOut = new Set<string>();
  let last = 0;
  for (const d of rows<Pool["dropped"][number]>(
    pool.dropped,
    "dropped",
    errors,
  )) {
    const at = `dropped ${String(d.wikidataId)}`;
    if (
      typeof d.wikidataId !== "string" ||
      !QID.test(d.wikidataId) ||
      typeof d.name !== "string" ||
      !Array.isArray(d.flags)
    ) {
      errors.push(`${at}: needs a Wikidata id, a name and a list of flags`);
    } else if (!droppedReasons.includes(d.reason)) {
      errors.push(`${at}: reason ${String(d.reason)}`);
    } else if (qids.has(d.wikidataId)) {
      errors.push(`${at}: also in the pool`);
    } else if (d.reason === "not-candidate" && d.flags.length > 0) {
      // Kept light on purpose (pool.ts): about 1,000 such entries a night.
      errors.push(`${at}: a not-candidate entry carries no flags`);
    }
    if (typeof d.wikidataId === "string" && QID.test(d.wikidataId)) {
      const n = Number(d.wikidataId.slice(1));
      if (leftOut.has(d.wikidataId)) errors.push(`${at}: listed twice`);
      else if (n < last) errors.push(`${at}: not in Wikidata-number order`);
      leftOut.add(d.wikidataId);
      last = Math.max(last, n);
    }
  }
  // An edition ends the year it starts or the next one, as the database checks.
  const editions = new Set<string>();
  for (const h of rows<Pool["honours"][number]>(
    pool.honours,
    "honour",
    errors,
  )) {
    const at = `honour ${h.competition} ${h.seasonStart}–${h.seasonEnd}`;
    if (
      !competitions.includes(h.competition) ||
      !clubIds.has(h.clubId) ||
      !year(h.seasonStart) ||
      !year(h.seasonEnd) ||
      (h.seasonEnd !== h.seasonStart && h.seasonEnd !== h.seasonStart + 1)
    ) {
      errors.push(`${at}: invalid`);
    }
    const key = `${h.competition}|${h.seasonStart}|${h.seasonEnd}`;
    if (editions.has(key)) errors.push(`${at}: duplicate edition`);
    editions.add(key);
  }
  return errors;
}
