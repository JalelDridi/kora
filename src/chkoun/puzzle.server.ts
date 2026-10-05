import "server-only";
import {
  addDays,
  FIRST_DAY,
  puzzleNumber,
  tunisDay,
} from "@/engine/chkoun/day.ts";
import { drawOne } from "@/engine/chkoun/schedule.ts";
import type { Day } from "@/engine/chkoun/types.ts";
import { getDb } from "@/db/client";
import { CANDIDATES_SQL, HISTORY_DAYS } from "@/pipeline/calendar.ts";
import { getRedis } from "@/redis";

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

const RECENT_SQL = `
SELECT player_id FROM puzzles
WHERE game = 'chkoun' AND day >= $1::date AND day < $2::date`;

// The reserve: written once; a second writer finds the first one's row.
const RESERVE_SQL = `
INSERT INTO puzzles (id, game, day, player_id, source)
VALUES (gen_random_uuid(), 'chkoun', $1::date, $2, 'reserve')
ON CONFLICT (game, day) DO NOTHING`;

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
  const first = deps.firstDay ?? FIRST_DAY;

  async function fromDatabase(day: Day): Promise<string | null> {
    const rows = await deps.sql(PUZZLE_SQL, [day]);
    if (rows.length > 0) return String(rows[0].player_id);
    if (!deps.seed) {
      deps.log(`chkoun: no puzzle for ${day} and no CHKOUN_SEED for a reserve`);
      return null;
    }
    const candidates = (await deps.sql(CANDIDATES_SQL)).map((r) => ({
      id: String(r.id),
      tier: String(r.tier),
    }));
    const recent = (
      await deps.sql(RECENT_SQL, [addDays(day, -HISTORY_DAYS), day])
    ).map((r) => String(r.player_id));
    // Tier A first: a reserve day should be one everybody can play.
    const drawn =
      drawOne({
        seed: deps.seed,
        day,
        candidates,
        recent,
        tiers: { A: 1, B: 0, C: 0 },
      }) ??
      drawOne({
        seed: deps.seed,
        day,
        candidates,
        recent,
        tiers: { A: 0.5, B: 0.5, C: 0 },
      });
    if (drawn === null) {
      deps.log(`chkoun: no puzzle for ${day} and no footballer for a reserve`);
      return null;
    }
    await deps.sql(RESERVE_SQL, [day, drawn]);
    deps.log(`chkoun: no puzzle for ${day}; a reserve was written`);
    const again = await deps.sql(PUZZLE_SQL, [day]);
    return again.length > 0 ? String(again[0].player_id) : null;
  }

  async function read(day: Day): Promise<Puzzle | null> {
    const key = puzzleKey(deps.env, day);
    if (deps.kv) {
      try {
        const cached = await deps.kv.get(key);
        if (typeof cached === "string" && cached !== "")
          return { day, number: puzzleNumber(day, first), playerId: cached };
      } catch {
        deps.log("chkoun: Redis did not answer; reading the database");
      }
    }
    let playerId: string | null;
    try {
      playerId = await fromDatabase(day);
    } catch {
      deps.log("chkoun: the database did not answer and nothing is cached");
      return null;
    }
    if (playerId === null) return null;
    if (deps.kv)
      await deps.kv
        .set(key, playerId, { ex: PUZZLE_TTL_SECONDS })
        .catch(() => deps.log("chkoun: Redis did not keep today's puzzle"));
    return { day, number: puzzleNumber(day, first), playerId };
  }

  return (now = new Date()) => {
    const day = tunisDay(now);
    let pending = memory.get(day);
    if (!pending) {
      pending = read(day).then((puzzle) => {
        // A failure is not remembered: the next call tries again.
        if (puzzle === null) memory.delete(day);
        return puzzle;
      });
      memory.set(day, pending);
      // Yesterday's answer is no longer needed in memory.
      for (const old of memory.keys()) if (old < day) memory.delete(old);
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
      kv: getRedis(),
      seed: process.env.CHKOUN_SEED,
      env: process.env.VERCEL_ENV ?? "local",
      log: (line) => console.warn(line),
    });
  }
  return reader(now);
}
