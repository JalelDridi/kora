import "server-only";
import {
  addDays,
  dayDiff,
  FIRST_DAY,
  puzzleNumber,
  tunisDay,
  weekday,
} from "@/engine/chkoun/day.ts";
import { drawOne, MAX_WINDOW, TIER_WEIGHTS } from "@/engine/chkoun/schedule.ts";
import type { Candidate, Tier } from "@/engine/chkoun/schedule.ts";
import type { Day } from "@/engine/chkoun/types.ts";
import { getDb } from "@/db/client";
import { CANDIDATES_SQL } from "@/pipeline/calendar.ts";
import { getKv, kvEnv } from "./kv.ts";

// Today's Chkoun? answer, on the server only (D-S2-2): the one module that
// reads it. Read once per server instance and day, and with Redis on, once a
// day for every instance; when today has no row (a top-up that never ran),
// a reserve is drawn from the seed and written once. Nothing here logs a
// footballer, the seed or the answer.

export type Puzzle = { day: Day; number: number; playerId: string };

/** Rows from a SQL statement with $1, $2 … parameters. */
export type SqlRows = (
  text: string,
  values?: unknown[],
) => Promise<Record<string, unknown>[]>;

/** The two Redis commands this module uses (Upstash's client fits). */
export type PuzzleKv = {
  get(key: string): Promise<unknown>;
  set(key: string, value: string, options: { ex: number }): Promise<unknown>;
};

/** Three days: today's key outlives any instance that read it. */
export const PUZZLE_TTL_SECONDS = 259_200;

/**
 * An empty day (no row and nobody for a reserve) is remembered this long,
 * in this instance and in Redis, so a loop of requests does not keep the
 * database awake (review 2a, G1).
 */
export const EMPTY_TTL_SECONDS = 60;
/** What Redis holds for an empty day. */
const EMPTY = "-";

export type PuzzleDeps = {
  sql: SqlRows;
  kv: PuzzleKv | null;
  /** CHKOUN_SEED; without it no reserve is drawn. */
  seed: string | undefined;
  /** The key prefix's environment: VERCEL_ENV, or "local". */
  env: string;
  log: (line: string) => void;
  firstDay?: Day;
};

const PUZZLE_SQL = `
SELECT player_id FROM puzzles WHERE game = 'chkoun' AND day = $1::date`;

// The calendar around a day, both sides: the window looks before and after.
const NEAR_SQL = `
SELECT to_char(day, 'YYYY-MM-DD') AS day, player_id FROM puzzles
WHERE game = 'chkoun' AND day >= $1::date AND day <= $2::date`;

// The reserve: written once; a second writer finds the first one's row.
const RESERVE_SQL = `
INSERT INTO puzzles (id, game, day, player_id, source)
VALUES (gen_random_uuid(), 'chkoun', $1::date, $2, 'reserve')
ON CONFLICT (game, day) DO NOTHING`;

/**
 * Today's reserve footballer (review L1): the calendar's own repeat window,
 * min(120, eligible - 1), before and after the day, shrunk for this day
 * only when nobody is left. Tier A first, then A and B, then the day's own
 * tiers (C only at weekends, never D). Null when no candidate exists.
 */
export async function drawReserve(
  seed: string,
  day: Day,
  candidates: Candidate[],
  near: (from: Day, to: Day) => Promise<{ day: Day; playerId: string }[]>,
): Promise<string | null> {
  const eligible = new Set(
    candidates.filter((c) => ["A", "B", "C"].includes(c.tier)).map((c) => c.id),
  );
  const window = Math.max(0, Math.min(MAX_WINDOW, eligible.size - 1));
  const rows = (await near(addDays(day, -window), addDays(day, window))).filter(
    (r) => r.day !== day,
  );
  const tierSets: Record<Tier, number>[] = [
    { A: 1, B: 0, C: 0 },
    { A: 0.5, B: 0.5, C: 0 },
    TIER_WEIGHTS[weekday(day)],
  ];
  for (let span = window; span >= 0; span--) {
    const recent = rows
      .filter((r) => Math.abs(dayDiff(day, r.day)) <= span)
      .map((r) => r.playerId);
    for (const tiers of tierSets) {
      const drawn = drawOne({ seed, day, candidates, recent, tiers });
      if (drawn !== null) return drawn;
    }
  }
  return null;
}

export function puzzleKey(env: string, day: Day): string {
  return `kora:${env}:chkoun:p:${day}`;
}

/**
 * A reader of today's puzzle with its own memory, one per server instance.
 * Order: this instance's memory, then Redis, then Postgres (with the reserve
 * when the day is empty). Null when nothing answers: callers say "closed".
 */
export function createPuzzleReader(
  deps: PuzzleDeps,
): (now?: Date) => Promise<Puzzle | null> {
  const memory = new Map<Day, Promise<Puzzle | null>>();
  /** Days known to be empty, until this instant (ms). */
  const emptyUntil = new Map<Day, number>();
  /** Days this instance has already warned about. */
  const warned = new Set<Day>();
  const first = deps.firstDay ?? FIRST_DAY;
  const warnOnce = (day: Day, line: string) => {
    if (warned.has(day)) return;
    warned.add(day);
    deps.log(line);
  };

  async function fromDatabase(day: Day): Promise<string | null> {
    const rows = await deps.sql(PUZZLE_SQL, [day]);
    if (rows.length > 0) return String(rows[0].player_id);
    if (!deps.seed) {
      warnOnce(
        day,
        `chkoun: no puzzle for ${day} and no CHKOUN_SEED for a reserve`,
      );
      return null;
    }
    const candidates = (await deps.sql(CANDIDATES_SQL)).map((r) => ({
      id: String(r.id),
      tier: String(r.tier),
    }));
    const id = await drawReserve(deps.seed, day, candidates, async (from, to) =>
      (await deps.sql(NEAR_SQL, [from, to])).map((r) => ({
        day: String(r.day),
        playerId: String(r.player_id),
      })),
    );
    if (id === null) {
      warnOnce(
        day,
        `chkoun: no puzzle for ${day} and no footballer for a reserve`,
      );
      return null;
    }
    await deps.sql(RESERVE_SQL, [day, id]);
    deps.log(`chkoun: no puzzle for ${day}; a reserve was written`);
    const again = await deps.sql(PUZZLE_SQL, [day]);
    return again.length > 0 ? String(again[0].player_id) : null;
  }

  /** The day's puzzle; `empty` when the database answered and the day has none. */
  async function read(
    day: Day,
  ): Promise<{ puzzle: Puzzle | null; empty: boolean }> {
    const key = puzzleKey(deps.env, day);
    const found = (playerId: string) => ({
      puzzle: { day, number: puzzleNumber(day, first), playerId },
      empty: false,
    });
    if (deps.kv) {
      try {
        const cached = await deps.kv.get(key);
        if (cached === EMPTY) return { puzzle: null, empty: true };
        if (typeof cached === "string" && cached !== "") return found(cached);
      } catch {
        deps.log("chkoun: Redis did not answer; reading the database");
      }
    }
    let playerId: string | null;
    try {
      playerId = await fromDatabase(day);
    } catch {
      deps.log("chkoun: the database did not answer and nothing is cached");
      return { puzzle: null, empty: false };
    }
    if (deps.kv)
      await deps.kv
        .set(key, playerId ?? EMPTY, {
          ex: playerId === null ? EMPTY_TTL_SECONDS : PUZZLE_TTL_SECONDS,
        })
        .catch(() => deps.log("chkoun: Redis did not keep today's puzzle"));
    return playerId === null ? { puzzle: null, empty: true } : found(playerId);
  }

  return (now = new Date()) => {
    const day = tunisDay(now);
    const at = now.getTime();
    if ((emptyUntil.get(day) ?? 0) > at) return Promise.resolve(null);
    let pending = memory.get(day);
    if (!pending) {
      pending = read(day).then(({ puzzle, empty }) => {
        // An empty day is remembered for a minute; a failure is not
        // remembered at all: the next call tries again.
        if (puzzle === null) {
          memory.delete(day);
          if (empty) emptyUntil.set(day, at + EMPTY_TTL_SECONDS * 1000);
        }
        return puzzle;
      });
      memory.set(day, pending);
      // Yesterday is no longer needed in memory.
      for (const old of memory.keys()) if (old < day) memory.delete(old);
      for (const old of emptyUntil.keys())
        if (old < day) emptyUntil.delete(old);
    }
    return pending;
  };
}

let reader: ((now?: Date) => Promise<Puzzle | null>) | null = null;

/** Today's puzzle for this server instance (Postgres, Redis when on). */
export function todayPuzzle(now: Date = new Date()): Promise<Puzzle | null> {
  if (!reader) {
    reader = createPuzzleReader({
      sql: async (text, values = []) =>
        getDb().$queryRawUnsafe<Record<string, unknown>[]>(text, ...values),
      kv: getKv(),
      seed: process.env.CHKOUN_SEED,
      env: kvEnv(),
      log: (line) => console.warn(line),
    });
  }
  return reader(now);
}
