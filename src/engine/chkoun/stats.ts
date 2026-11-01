// A visitor's Chkoun? record: streak, best streak, games played and won, and
// wins by number of guesses. Keyed on the puzzle number, never on a clock.
// Used by the server (Redis, src/chkoun/store.ts) and by the device. Pure.

export type Stats = {
  /** The puzzle number of the last game counted. */
  last: number;
  lastSolved: boolean;
  /** Wins in a row, ending with `last`. */
  streak: number;
  best: number;
  played: number;
  won: number;
  /** Wins in 1 to 8 guesses. */
  dist: number[];
  /**
   * The guesses of the win at `last`, so the distribution can mark it
   * (mobile polish M3). Absent after a loss, and in records kept before it.
   */
  lastGuesses?: number;
};

export type Finished = { n: number; solved: boolean; guesses: number };

/** The record after one more finished game; a game already counted changes nothing. */
export function nextStats(previous: Stats | null, game: Finished): Stats {
  if (previous && game.n <= previous.last) return previous;
  const dist = previous ? [...previous.dist] : Array<number>(8).fill(0);
  let streak = 0;
  let slot = -1;
  if (game.solved) {
    const followsWin =
      previous !== null && previous.lastSolved && previous.last === game.n - 1;
    streak = followsWin ? previous.streak + 1 : 1;
    slot = Math.min(Math.max(game.guesses, 1), 8) - 1;
    dist[slot]++;
  }
  return {
    last: game.n,
    lastSolved: game.solved,
    streak,
    best: Math.max(previous?.best ?? 0, streak),
    played: (previous?.played ?? 0) + 1,
    won: (previous?.won ?? 0) + (game.solved ? 1 : 0),
    dist,
    ...(slot >= 0 ? { lastGuesses: slot + 1 } : {}),
  };
}

export type Bar = {
  /** 1 to 8. */
  guesses: number;
  count: number;
  /** count / the largest count; 0 when there is no win. */
  share: number;
  /** The bar of today's win. */
  today: boolean;
};

/**
 * The wins by number of guesses as eight bars (mobile polish M3), scaled to
 * the most frequent. `today` is today's puzzle number: the bar of a win
 * counted for it is marked.
 */
export function distribution(stats: Stats | null, today: number | null): Bar[] {
  const dist = stats?.dist ?? Array<number>(8).fill(0);
  const max = Math.max(0, ...dist);
  const marked =
    stats !== null &&
    today !== null &&
    stats.last === today &&
    stats.lastSolved &&
    stats.lastGuesses !== undefined
      ? stats.lastGuesses
      : null;
  return dist.map((count, i) => ({
    guesses: i + 1,
    count,
    share: max === 0 ? 0 : count / max,
    today: marked === i + 1,
  }));
}

/** A stored record, checked; null when it is not one. */
export function parseStats(value: unknown): Stats | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const count = (x: unknown) => Number.isInteger(x) && (x as number) >= 0;
  if (
    !count(v.last) ||
    typeof v.lastSolved !== "boolean" ||
    !count(v.streak) ||
    !count(v.best) ||
    !count(v.played) ||
    !count(v.won) ||
    !Array.isArray(v.dist) ||
    v.dist.length !== 8 ||
    !v.dist.every(count)
  )
    return null;
  return {
    last: v.last as number,
    lastSolved: v.lastSolved,
    streak: v.streak as number,
    best: v.best as number,
    played: v.played as number,
    won: v.won as number,
    dist: [...(v.dist as number[])],
    ...(Number.isInteger(v.lastGuesses) &&
    (v.lastGuesses as number) >= 1 &&
    (v.lastGuesses as number) <= 8 &&
    v.lastSolved
      ? { lastGuesses: v.lastGuesses as number }
      : {}),
  };
}
