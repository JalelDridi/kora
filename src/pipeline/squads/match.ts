import { sameName } from "../confidence.ts";
import type { WdPlayer } from "../types.ts";
import type { SquadList, SquadRow } from "../wiki/squads.ts";

// Squad rows to footballers (decision P42: a name-only match never counts).
// A row is his when its link leads, through redirects, to his Wikidata id,
// or when its name and birth date are his. Pure.

export type Sighting = {
  qid: string;
  list: SquadList;
  part: SquadRow["part"];
  /** The list's own date (S5: a French season's 1 July). */
  asOf: string | null;
  caps?: number;
  goals?: number;
  /** National rows: the club column's link target. */
  clubLink?: string;
  by: "link" | "name-birth";
};

/** The lists whose rows can vote or show presence: current ones, and a dated national table (its caps count at any date, S4). */
export function usable(list: SquadList): boolean {
  return (
    list.status === "current" ||
    (list.kind === "national" && list.date !== null && list.status === "stale")
  );
}

/** "lang:title", the key of a link target. */
export const linkKey = (lang: "en" | "fr", title: string) => `${lang}:${title}`;

/**
 * S13: the link targets to look up, per language: rows of usable lists whose
 * target is not already a known footballer's article title.
 */
export function linkTargets(
  lists: SquadList[],
  knownTitles: { en: Set<string>; fr: Set<string> },
): { en: string[]; fr: string[] } {
  const out = { en: new Set<string>(), fr: new Set<string>() };
  for (const list of lists.filter(usable))
    for (const row of list.rows)
      if (row.link && !knownTitles[list.lang].has(row.link))
        out[list.lang].add(row.link);
  return { en: [...out.en].sort(), fr: [...out.fr].sort() };
}

/** Each footballer's article titles, keyed "lang:title", to his Wikidata id. */
export function knownTitleIds(players: WdPlayer[]): Map<string, string> {
  const ids = new Map<string, string>();
  for (const p of players) {
    if (p.titles.en) ids.set(linkKey("en", p.titles.en), p.qid);
    if (p.titles.fr) ids.set(linkKey("fr", p.titles.fr), p.qid);
  }
  return ids;
}

export type MatchResult = {
  sightings: Sighting[];
  /** Rows that name two footballers at once, for the report. */
  notes: string[];
  /** Per list ("lang:page"): its rows that matched nobody, linked and plain. */
  unmatched: Map<string, { linked: number; plain: number }>;
};

/**
 * Rows of usable lists to footballers. `ids` maps "lang:title" to a
 * Wikidata id: the footballers' own titles plus the looked-up targets.
 */
export function matchRows(
  lists: SquadList[],
  players: WdPlayer[],
  ids: Map<string, string>,
): MatchResult {
  const wanted = new Set(players.map((p) => p.qid));
  const names = (p: WdPlayer) =>
    [p.nameEn, p.nameFr, ...p.aliases].filter((n): n is string => !!n);
  const result: MatchResult = {
    sightings: [],
    notes: [],
    unmatched: new Map(),
  };
  for (const list of lists.filter(usable)) {
    const missed = { linked: 0, plain: 0 };
    for (const row of list.rows) {
      const target = row.link
        ? ids.get(linkKey(list.lang, row.link))
        : undefined;
      const byLink = target && wanted.has(target) ? target : undefined;
      const born = row.birthDate
        ? players.filter(
            (p) =>
              p.birthDate === row.birthDate &&
              names(p).some((n) => sameName(n, row.name)),
          )
        : [];
      const byBirth = born.length === 1 ? born[0].qid : undefined;
      if (born.length > 1)
        result.notes.push(
          `${list.lang}:${list.page}: ${row.name} (${row.birthDate}) fits ${born.map((p) => p.qid).join(" and ")}; no match`,
        );
      // The link leads to one man and the name and birth date to another.
      if (target && byBirth && target !== byBirth) {
        result.notes.push(
          `${list.lang}:${list.page}: ${row.name} links to ${target} but the name and birth date are ${byBirth}'s; no match`,
        );
        if (row.link) missed.linked++;
        else missed.plain++;
        continue;
      }
      const qid = byLink ?? byBirth;
      if (!qid) {
        if (row.link) missed.linked++;
        else missed.plain++;
        continue;
      }
      const sighting: Sighting = {
        qid,
        list,
        part: row.part,
        asOf: list.date,
        by: byLink ? "link" : "name-birth",
      };
      if (row.caps !== undefined) sighting.caps = row.caps;
      if (row.goals !== undefined) sighting.goals = row.goals;
      if (row.clubLink) sighting.clubLink = row.clubLink;
      result.sightings.push(sighting);
    }
    result.unmatched.set(`${list.lang}:${list.page}`, missed);
  }
  return result;
}
