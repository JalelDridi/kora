import { seasonKey } from "@/chkoun/kv.ts";
import type { Kv } from "@/chkoun/kv.ts";
import type { Day } from "@/engine/chkoun/types.ts";

// 30–0 seasons in Redis (D-S3-9, D-S3-11). A day's seasons are one hash,
// kora:{env}:season:r:{day}, visitor id → his first season of the day, kept
// 8 days like Chkoun?'s results. Only that first season (HSETNX) enters the
// day's board, kora:{env}:season:b:{day}, a sorted set of share codes
// trimmed to the best 50. kora:{env}:season:played:{draft id} marks a draft
// token as played. Every Redis failure becomes "unavailable": the season is
// then kept on the device.

export const SEASON_TTL_SECONDS = 691_200;
export const BOARD_KEEP = 50;
const MATCHES = 30;

export type SeasonEntry = {
  xi: string;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  points: number;
  rating: number;
};

export const seasonResultsKey = (env: string, day: Day) =>
  seasonKey(env, `r:${day}`);
export const boardKey = (env: string, day: Day) => seasonKey(env, `b:${day}`);
export const playedKey = (env: string, draftId: string) =>
  seasonKey(env, `played:${draftId}`);

/**
 * The visitor's season, once per day (HSETNX, with its expiry); only a new
 * one enters the board. `rank` is its place from the top (0 is the best),
 * null when it is not new or was trimmed away.
 */
export async function recordSeason(
  kv: Kv,
  input: {
    env: string;
    day: Day;
    visitorId: string;
    entry: SeasonEntry;
    score: number;
  },
): Promise<{ first: boolean; rank: number | null } | "unavailable"> {
  try {
    const first = await kv.hsetnxEx(
      seasonResultsKey(input.env, input.day),
      input.visitorId,
      JSON.stringify(input.entry),
      SEASON_TTL_SECONDS,
    );
    if (!first) return { first, rank: null };
    const rank = await kv.zaddTop(
      boardKey(input.env, input.day),
      input.entry.xi,
      input.score,
      BOARD_KEEP,
      SEASON_TTL_SECONDS,
    );
    return { first, rank };
  } catch {
    return "unavailable";
  }
}

const count = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= 0;

/** A stored season, checked; null when it is not one. */
export function parseSeasonEntry(text: string): SeasonEntry | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const { xi, w, d, l, gf, ga, points, rating } = v as Record<string, unknown>;
  if (typeof xi !== "string" || xi.length === 0) return null;
  if (![w, d, l, gf, ga, points].every(count)) return null;
  const [W, D, L] = [w, d, l] as number[];
  if (W + D + L !== MATCHES || points !== 3 * W + D) return null;
  if (typeof rating !== "number" || !Number.isFinite(rating)) return null;
  return {
    xi,
    w: W,
    d: D,
    l: L,
    gf: gf as number,
    ga: ga as number,
    points: points as number,
    rating,
  };
}
