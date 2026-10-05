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
};

export type Finished = { n: number; solved: boolean; guesses: number };

/** The record after one more finished game; a game already counted changes nothing. */
export function nextStats(previous: Stats | null, game: Finished): Stats {
  if (previous && game.n <= previous.last) return previous;
  const dist = previous ? [...previous.dist] : Array<number>(8).fill(0);
  let streak = 0;
  if (game.solved) {
    const followsWin =
      previous !== null && previous.lastSolved && previous.last === game.n - 1;
    streak = followsWin ? previous.streak + 1 : 1;
    const slot = Math.min(Math.max(game.guesses, 1), 8) - 1;
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
  };
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
  };
}
