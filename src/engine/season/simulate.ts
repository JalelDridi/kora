// The 30–0 season (D-S3-8): the drafted XI takes the place of the club that
// gave it most footballers (T-S3-5) and plays the other 15 Ligue 1 clubs home
// and away. Goals are Poisson on the gap between the XI's mean rating and the
// opponent's curated strength. The seed is the day and the squad, so the same
// squad on the same day always gets the same season.

import type { Day, Line } from "../chkoun/types.ts";
import { slotCode } from "./data.ts";
import { FORMATION } from "./draft.ts";
import { hashRand, poisson, shuffle } from "./prng.ts";
import type { Candidate, Opponent, SeasonData } from "./types.ts";

export type RatedSlot = {
  code: string;
  line: Line;
  clubId: string;
  rating: number;
};

export type Match = {
  round: number;
  opponent: string;
  home: boolean;
  for: number;
  against: number;
};

export type Season = {
  matches: Match[];
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  points: number;
  rating: number;
  replaces: string;
};

/**
 * λ = base · e^(±edge), edge = k · (rating − strength) ± home. Tuned by
 * src/season/tuning.test.ts; data/README.md ("30–0 season") gives the rates.
 */
export const SIM = { base: 1.3, k: 0.055, home: 0.15, maxGoals: 9 };

/** The squad's seed text: codes sorted within each line, lines in formation order. */
export function canonicalXi(xi: readonly RatedSlot[]): string {
  const lines = [...new Set(FORMATION)];
  return lines
    .map((line) =>
      xi
        .filter((s) => s.line === line)
        .map((s) => s.code)
        .sort()
        .join("~"),
    )
    .join("~");
}

/** The mean rating, to one decimal. */
export function teamRating(ratings: readonly number[]): number {
  if (ratings.length === 0) return 0;
  const mean = ratings.reduce((n, r) => n + r, 0) / ratings.length;
  return Math.round(mean * 10) / 10;
}

/** T-S3-5: the club that gave most footballers; a tie goes to the smallest club id. */
function mostDrafted(xi: readonly RatedSlot[]): string {
  const counts = new Map<string, number>();
  for (const s of xi) counts.set(s.clubId, (counts.get(s.clubId) ?? 0) + 1);
  let best = "";
  let most = 0;
  for (const [clubId, n] of counts)
    if (n > most || (n === most && clubId < best)) {
      best = clubId;
      most = n;
    }
  return best;
}

function summarise(matches: Match[], rating: number, replaces: string): Season {
  let w = 0,
    d = 0,
    l = 0,
    gf = 0,
    ga = 0;
  for (const m of matches) {
    gf += m.for;
    ga += m.against;
    if (m.for > m.against) w++;
    else if (m.for === m.against) d++;
    else l++;
  }
  return {
    matches,
    w,
    d,
    l,
    gf,
    ga,
    points: 3 * w + d,
    rating,
    replaces,
  };
}

export type SimInput = {
  day: Day;
  xi: readonly RatedSlot[];
  table: readonly Opponent[];
};

/**
 * The season. The number of rand() calls never depends on the ratings, so a
 * better side meets the same draws and never does worse (common random numbers).
 */
export function simulateSeason({ day, xi, table }: SimInput): Season {
  const rand = hashRand(`season|${day}|${canonicalXi(xi)}`);
  const rating = teamRating(xi.map((s) => s.rating));
  const replaces = mostDrafted(xi);
  const opponents = shuffle(
    table.filter((o) => o.clubId !== replaces),
    rand,
  );
  if (opponents.length !== 15)
    throw new Error("the table must hold the side's club and 15 others");
  const matches: Match[] = [];
  for (const leg of [0, 1])
    opponents.forEach((o, i) => {
      const home = (i % 2 === 0) !== (leg === 1);
      const edge =
        SIM.k * (rating - o.strength) + (home ? SIM.home : -SIM.home);
      const goalsFor = poisson(SIM.base * Math.exp(edge), rand(), SIM.maxGoals);
      const goalsAgainst = poisson(
        SIM.base * Math.exp(-edge),
        rand(),
        SIM.maxGoals,
      );
      matches.push({
        round: leg * 15 + i + 1,
        opponent: o.clubId,
        home,
        for: goalsFor,
        against: goalsAgainst,
      });
    });
  return summarise(matches, rating, replaces);
}

/** One number for the board: points, then goal difference, then goals scored. */
export function boardScore(s: Season): number {
  return s.points * 1e6 + (s.gf - s.ga + 500) * 1e3 + Math.min(s.gf, 999);
}

/** The squad as the season sees it: share code (slotCode) and the candidate's own rating. */
export function rateXi(
  data: SeasonData,
  picks: readonly Candidate[],
): RatedSlot[] {
  return picks.map((c) => ({
    code: slotCode(data, c),
    line: c.line,
    clubId: c.clubId,
    rating: c.rating,
  }));
}
