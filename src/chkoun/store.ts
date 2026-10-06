import { addDays } from "@/engine/chkoun/day.ts";
import { nextStats, parseStats } from "@/engine/chkoun/stats.ts";
import type { Stats } from "@/engine/chkoun/stats.ts";
import type { Day } from "@/engine/chkoun/types.ts";
import { chkounKey } from "./kv.ts";
import type { Kv } from "./kv.ts";

// Finished games and streaks in Redis (D-S2-1, N3). A day's finished games
// are one hash, kora:{env}:chkoun:r:{day}, visitor id → {"s","k","grid"},
// kept 8 days (7 nights of retries for the copy to Postgres). A visitor's
// record is kora:{env}:chkoun:s:{visitor id}, kept 13 months after his last
// game. The first finished game of a day counts (HSETNX); a replayed one
// changes nothing, unless the record missed it. Every Redis failure becomes "unavailable": the game then
// goes on with the record kept on the device.

export const RESULT_TTL_SECONDS = 691_200;
export const STATS_TTL_SECONDS = 34_128_000;

export type FinishedGame = { solved: boolean; guesses: number; grid: string[] };

export type Finish = FinishedGame & { day: Day; n: number; visitorId: string };

const ROW = /^[gaxu]{6}$/;

/** A stored finished game, checked; null when it is not one. */
export function parseEntry(text: string): FinishedGame | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null) return null;
  const { s, k, grid } = v as Record<string, unknown>;
  if (s !== 0 && s !== 1) return null;
  if (!Number.isInteger(k) || (k as number) < 1 || (k as number) > 8)
    return null;
  if (
    !Array.isArray(grid) ||
    grid.length !== k ||
    !grid.every((row) => typeof row === "string" && ROW.test(row))
  )
    return null;
  return { solved: s === 1, guesses: k as number, grid: [...grid] };
}

function entry(game: FinishedGame): string {
  return JSON.stringify({
    s: game.solved ? 1 : 0,
    k: game.guesses,
    grid: game.grid,
  });
}

export const resultsKey = (env: string, day: Day) => chkounKey(env, `r:${day}`);
const statsKey = (env: string, visitorId: string) =>
  chkounKey(env, `s:${visitorId}`);

async function readStats(
  kv: Kv,
  env: string,
  visitorId: string,
): Promise<Stats | null> {
  const text = await kv.get(statsKey(env, visitorId));
  if (text === null) return null;
  try {
    return parseStats(JSON.parse(text));
  } catch {
    return null;
  }
}

/** The visitor's stored game of `day`, if any. */
async function storedGame(
  kv: Kv,
  env: string,
  day: Day,
  visitorId: string,
): Promise<FinishedGame | null> {
  const text = await kv.hget(resultsKey(env, day), visitorId);
  return text === null ? null : parseEntry(text);
}

/**
 * Records a finished game once per visitor and day; returns his record.
 *
 * The day's hash is written with its expiry in one transaction. The record
 * is written after it, so a failure in between leaves a counted game that the
 * record lacks; it is folded in later: by a replay of the same day (the
 * stored game, not the replay, counts), or by the next day's finish
 * (yesterday's stored game first, so the streak does not skip a day).
 */
export async function recordFinish(
  kv: Kv,
  env: string,
  finish: Finish,
): Promise<Stats | "unavailable"> {
  try {
    const key = resultsKey(env, finish.day);
    const isNew = await kv.hsetnxEx(
      key,
      finish.visitorId,
      entry(finish),
      RESULT_TTL_SECONDS,
    );
    let game: Finish = finish;
    if (!isNew) {
      const stored = await storedGame(kv, env, finish.day, finish.visitorId);
      if (stored) game = { ...finish, ...stored };
    }
    const previous = await readStats(kv, env, finish.visitorId);
    let base = previous;
    if (base && base.last === game.n - 2) {
      const yesterday = await storedGame(
        kv,
        env,
        addDays(game.day, -1),
        finish.visitorId,
      );
      if (yesterday) base = nextStats(base, { ...yesterday, n: game.n - 1 });
    }
    const stats = nextStats(base, game);
    if (stats !== previous)
      await kv.set(statsKey(env, finish.visitorId), JSON.stringify(stats), {
        ex: STATS_TTL_SECONDS,
      });
    return stats;
  } catch {
    return "unavailable";
  }
}

/** The visitor's finished game of `day`, if any, and his record. */
export async function readToday(
  kv: Kv,
  env: string,
  day: Day,
  visitorId: string,
): Promise<
  { finished: FinishedGame | null; stats: Stats | null } | "unavailable"
> {
  try {
    return {
      finished: await storedGame(kv, env, day, visitorId),
      stats: await readStats(kv, env, visitorId),
    };
  } catch {
    return "unavailable";
  }
}
