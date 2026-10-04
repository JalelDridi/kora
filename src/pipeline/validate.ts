import { competitions, confidences, lines } from "./types.ts";
import type { Confidence, Pool } from "./types.ts";

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

export function validatePool(
  input: unknown,
  governorateIds: Set<string>,
): string[] {
  const pool = input as Pool;
  if (
    pool?.version !== 1 ||
    !Array.isArray(pool.players) ||
    !Array.isArray(pool.clubs) ||
    !Array.isArray(pool.honours) ||
    !Array.isArray(pool.flags)
  ) {
    return ["not a version 1 pool"];
  }
  const errors: string[] = [];
  const clubIds = new Set<string>();
  for (const club of pool.clubs) {
    const at = `club ${club.id}`;
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
  for (const p of pool.players) {
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
    if (!p.pools.active && !p.pools.legend)
      errors.push(`${at}: in neither pool`);
    // Decision P26: every value says how sure it is, and on whose word.
    for (const [field, e] of Object.entries(p.provenance ?? {})) {
      if (!confidences.includes(e.confidence as Confidence))
        errors.push(`${at}: ${field} has no confidence`);
      else if (!Array.isArray(e.agreeing) || e.agreeing.length === 0)
        errors.push(`${at}: ${field} names no agreeing source`);
    }
  }
  // An edition ends the year it starts or the next one, as the database checks.
  const editions = new Set<string>();
  for (const h of pool.honours) {
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
