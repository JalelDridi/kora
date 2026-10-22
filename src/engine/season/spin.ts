// One 30–0 slot's spin (D-S3-1, D-S3-2, D-S3-4): a club and a decade for the
// slot's line, and up to five candidates from them. A spin that would offer
// nobody widens in four levels: the spun club and decade; the same club in
// another decade; any club in the spun decade; any club and decade. Only a
// line with nobody left anywhere throws, and data:check refuses a pool where
// that could happen (seasonProblems).

import type { Line } from "../chkoun/types.ts";
import { shuffle } from "./prng.ts";
import type { Rand } from "./prng.ts";
import { DECADES, tripleKey } from "./types.ts";
import type { Candidate, Decade, SeasonData } from "./types.ts";

export type Spin = {
  line: Line;
  clubId: string;
  decade: Decade;
  level: 1 | 2 | 3 | 4;
  candidates: Candidate[];
};

export type SpinInput = {
  data: SeasonData;
  line: Line;
  /** Footballers already drafted: they never come back. */
  taken: ReadonlySet<string>;
  rand: Rand;
};

/** D-S3-4: at most five candidates per spin. */
export const SPIN_CANDIDATES = 5;

export function spin({ data, line, taken, rand }: SpinInput): Spin {
  const open = (clubId: string, decade: Decade) =>
    (data.index.get(tripleKey(clubId, decade, line)) ?? []).filter(
      (c) => !taken.has(c.footballerId),
    );
  const pickOf = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const clubId = pickOf(data.clubIds); // D-S3-1: every club as often
  const decade = pickOf(DECADES);
  const pairs = (clubs: readonly string[], decades: readonly Decade[]) =>
    clubs
      .flatMap((c) => decades.map((d) => [c, d] as const))
      .filter(([c, d]) => open(c, d).length > 0);
  // Each level is only searched when the one before it offers nobody.
  const ladder = [
    () => pairs([clubId], [decade]),
    () => pairs([clubId], DECADES),
    () => pairs(data.clubIds, [decade]),
    () => pairs(data.clubIds, DECADES),
  ];
  for (const [i, search] of ladder.entries()) {
    const found = search();
    if (found.length === 0) continue;
    const [c, d] = pickOf(found);
    return {
      line,
      clubId: c,
      decade: d,
      level: (i + 1) as Spin["level"],
      candidates: shuffle(open(c, d), rand).slice(0, SPIN_CANDIDATES),
    };
  }
  throw new Error(`no ${line} left`);
}
