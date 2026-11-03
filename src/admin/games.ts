// What each game makes of the pool (/admin/games/chkoun and
// /admin/games/season), as pure functions: the build's own values counted
// and listed, nothing recomputed. Chkoun? reads the pipeline's answer-ready
// rule, its one-field-away list and the grace dates; 30–0 reads the
// candidates buildSeasonData indexes, as the draft endpoint does.

import { DECADES, tripleKey } from "@/engine/season/types.ts";
import type { Decade, SeasonData } from "@/engine/season/types.ts";
import { isAnswerReady } from "@/pipeline/confidence.ts";
import { graceInEffect } from "@/pipeline/grace.ts";
import { oneFieldAway } from "@/pipeline/report.ts";
import type { Line, Pool } from "@/pipeline/types.ts";
import type { Query } from "./pool.ts";

export type Tier = "A" | "B" | "C" | "D" | "unmeasured";
export const TIERS: readonly Tier[] = ["A", "B", "C", "D", "unmeasured"];
/** The tiers the calendar draws its answers from (CANDIDATES_SQL). */
const DRAWN: readonly Tier[] = ["A", "B", "C"];

export type ChkounRow = {
  id: string;
  qid: string;
  name: string;
  /** His club's name; null without a current club. */
  club: string | null;
  tier: Tier;
  /** The fame score the build stored; null until measured. */
  fame: number | null;
  ready: boolean;
  /**
   * The one answer-ready field he lacks, as the pipeline lists it
   * (oneFieldAway, data/report.md's "one field away"). Null otherwise.
   */
  away: string | null;
  /**
   * Answer-ready and active, but of no tier the calendar draws from (D, or
   * not measured yet): fame is what keeps him from being an answer.
   */
  fameShort: boolean;
  graceUntil: string | null;
  localStar: boolean;
};

export type ChkounView = {
  counts: {
    active: number;
    answerReady: number;
    oneFieldAway: number;
    fameShort: number;
    grace: number;
    tiers: Record<Tier, number>;
  };
  /** The active pool and the footballers in grace, by name. */
  rows: ChkounRow[];
};

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "en") || (a.name < b.name ? -1 : 1);

/**
 * Chkoun?'s side of the pool. `buildDay` decides whether a grace date
 * still holds (graceInEffect); "" keeps any date, as the game does.
 */
export function chkounView(pool: Pool, buildDay: string): ChkounView {
  const clubs = new Map(pool.clubs.map((c) => [c.id, c.nameLatin]));
  const away = new Map(oneFieldAway(pool.players).map((a) => [a.id, a.field]));
  const tiers = Object.fromEntries(TIERS.map((t) => [t, 0])) as Record<
    Tier,
    number
  >;
  const rows: ChkounRow[] = [];
  for (const p of pool.players) {
    const grace = !p.pools.active && graceInEffect(p.pools, buildDay || null);
    if (!p.pools.active && !grace) continue;
    const tier: Tier = p.fame?.tier ?? "unmeasured";
    const ready = isAnswerReady(p);
    if (p.pools.active) tiers[tier]++;
    rows.push({
      id: p.id,
      qid: p.wikidataId,
      name: p.nameLatin,
      club: p.clubId ? (clubs.get(p.clubId) ?? p.clubId) : null,
      tier,
      fame: p.fame?.score ?? null,
      ready,
      away: away.get(p.id) ?? null,
      fameShort: ready && !DRAWN.includes(tier),
      graceUntil: grace ? (p.pools.graceUntil ?? null) : null,
      localStar: p.fame?.localStar ?? false,
    });
  }
  rows.sort(byName);
  return {
    counts: {
      active: rows.filter((r) => r.graceUntil === null).length,
      answerReady: rows.filter((r) => r.ready).length,
      oneFieldAway: rows.filter((r) => r.away !== null).length,
      fameShort: rows.filter((r) => r.fameShort).length,
      grace: rows.filter((r) => r.graceUntil !== null).length,
      tiers,
    },
    rows,
  };
}

export const SHOWS = [
  "ready",
  "away",
  "fame-short",
  "grace",
  ...TIERS.map((t) => `tier-${t}`),
] as const;
export type Show = (typeof SHOWS)[number];

export const CHKOUN_SORTS = ["name", "club", "tier", "fame"] as const;
export const SEASON_SORTS = ["name", "strength", "open"] as const;
export type ChkounSort = (typeof CHKOUN_SORTS)[number];
export type SeasonSort = (typeof SEASON_SORTS)[number];

export type GameQuery = {
  show: Show | null;
  sort: ChkounSort | SeasonSort | null;
  page: number;
};

const one = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

/** `?show=`, `?sort=` and `?page=`; anything unknown reads as the default. */
export function parseGameQuery(query: Query): GameQuery {
  const show = one(query.show) ?? "";
  const sort = one(query.sort) ?? "";
  const page = Number(one(query.page));
  const sorts: readonly string[] = [...CHKOUN_SORTS, ...SEASON_SORTS];
  return {
    show: (SHOWS as readonly string[]).includes(show) ? (show as Show) : null,
    sort: sorts.includes(sort) ? (sort as GameQuery["sort"]) : null,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** The Chkoun? view's sort: one of its own, or name (never a 30–0 sort). */
export function chkounSort(sort: GameQuery["sort"]): ChkounSort {
  return (CHKOUN_SORTS as readonly string[]).includes(sort ?? "")
    ? (sort as ChkounSort)
    : "name";
}

/** The rows `?show=` asks for; null shows every row. */
export function showRows(rows: ChkounRow[], show: Show | null): ChkounRow[] {
  switch (show) {
    case null:
      return rows;
    case "ready":
      return rows.filter((r) => r.ready);
    case "away":
      return rows.filter((r) => r.away !== null);
    case "fame-short":
      return rows.filter((r) => r.fameShort);
    case "grace":
      return rows.filter((r) => r.graceUntil !== null);
    default:
      // As the tier counts: the active pool only.
      return rows.filter(
        (r) => r.graceUntil === null && `tier-${r.tier}` === show,
      );
  }
}

const tierRank = (t: Tier) => TIERS.indexOf(t);

/** Name A to Z (the default), club A to Z, tier A first, fame best first; then by name. */
export function sortRows(
  rows: ChkounRow[],
  sort: GameQuery["sort"],
): ChkounRow[] {
  const by: Record<ChkounSort, (a: ChkounRow, b: ChkounRow) => number> = {
    name: () => 0,
    club: (a, b) =>
      (a.club === null ? 1 : 0) - (b.club === null ? 1 : 0) ||
      (a.club ?? "").localeCompare(b.club ?? "", "en"),
    tier: (a, b) => tierRank(a.tier) - tierRank(b.tier),
    fame: (a, b) => (b.fame ?? -Infinity) - (a.fame ?? -Infinity) || 0,
  };
  const compare = sort && sort in by ? by[sort as ChkounSort] : by.name;
  return [...rows].sort((a, b) => compare(a, b) || byName(a, b));
}

// 30–0.

export const LINES: readonly Line[] = [
  "goalkeeper",
  "defender",
  "midfielder",
  "forward",
];

export type SeasonCandidate = {
  footballerId: string;
  name: string;
  line: Line;
  rating: number;
};

export type SeasonDecade = {
  decade: Decade;
  /** Every line's candidates, best rating first. */
  candidates: SeasonCandidate[];
  /** How many a spin of each line can offer (spinSummary's numbers). */
  lines: Record<Line, number>;
};

export type SeasonClub = {
  clubId: string;
  name: string;
  /** From ligue1-strength.json; null when the table has no row for him. */
  strength: number | null;
  /** His (decade, line) triples that offer anyone. */
  open: number;
  decades: SeasonDecade[];
};

export type SeasonView = {
  clubs: SeasonClub[];
  /** The (club, decade, line) triples that offer anyone, of `total`. */
  openTriples: number;
  total: number;
};

export function seasonView(data: SeasonData): SeasonView {
  const strength = new Map(data.table.map((o) => [o.clubId, o.strength]));
  let openTriples = 0;
  const clubs = data.clubIds.map((clubId): SeasonClub => {
    let open = 0;
    const decades = DECADES.map((decade): SeasonDecade => {
      const lines = {} as Record<Line, number>;
      const candidates: SeasonCandidate[] = [];
      for (const line of LINES) {
        const list = data.index.get(tripleKey(clubId, decade, line)) ?? [];
        lines[line] = list.length;
        if (list.length > 0) open++;
        for (const c of list)
          candidates.push({
            footballerId: c.footballerId,
            name: data.people.get(c.footballerId)?.nameLatin ?? c.footballerId,
            line: c.line,
            rating: c.rating,
          });
      }
      candidates.sort((a, b) => b.rating - a.rating || byName(a, b));
      return { decade, candidates, lines };
    });
    openTriples += open;
    return {
      clubId,
      name: data.clubs.get(clubId)?.nameLatin ?? clubId,
      strength: strength.get(clubId) ?? null,
      open,
      decades,
    };
  });
  return {
    clubs,
    openTriples,
    total: data.clubIds.length * DECADES.length * LINES.length,
  };
}

/** Name A to Z (the default), strength strongest first, open triples most first; then by name. */
export function sortClubs(
  clubs: SeasonClub[],
  sort: GameQuery["sort"],
): SeasonClub[] {
  const compare =
    sort === "strength"
      ? (a: SeasonClub, b: SeasonClub) =>
          (b.strength ?? -Infinity) - (a.strength ?? -Infinity) || 0
      : sort === "open"
        ? (a: SeasonClub, b: SeasonClub) => b.open - a.open
        : () => 0;
  return [...clubs].sort((a, b) => compare(a, b) || byName(a, b));
}
