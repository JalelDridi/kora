import { nextStats, parseStats } from "@/engine/chkoun/stats.ts";
import type { Finished, Stats } from "@/engine/chkoun/stats.ts";
import type { TileRow } from "@/engine/chkoun/types.ts";
import type { Card } from "./attributes.ts";

// What the visitor's own browser keeps (plan Tasks 12 and 13): today's game,
// so a reload or a reopened in-app browser brings the guesses back, and the
// visitor's record, so the streak works with Redis off. Keyed on the puzzle
// number, never on a clock. Every access is wrapped: in-app browsers
// (Facebook, Instagram) may refuse or wipe storage, and the game must go on.

export const GAME_KEY = "kora.chkoun.v1.game";
export const STATS_KEY = "kora.chkoun.v1.stats";

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

export type GameStatus = "playing" | "won" | "lost";

export type SavedRow = { guess: string; row: TileRow };

export type SavedGame = {
  n: number;
  /** The signed state the server gave last; null before the first guess. */
  token: string | null;
  rows: SavedRow[];
  status: GameStatus;
  /** The answer's card: only once the game has ended. */
  card: Card | null;
  /** The colour grid when only the server's copy is known (no rows). */
  grid?: string[];
};

/** The browser's local storage, or null where it is refused. */
export function deviceStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function read(storage: StorageLike | null, key: string): unknown {
  if (!storage) return null;
  try {
    const text = storage.getItem(key);
    return text === null ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

function write(storage: StorageLike | null, key: string, value: unknown) {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Full or refused: the game goes on in memory.
  }
}

function isSavedGame(v: unknown): v is SavedGame {
  if (typeof v !== "object" || v === null) return false;
  const g = v as Record<string, unknown>;
  return (
    Number.isInteger(g.n) &&
    (g.token === null || typeof g.token === "string") &&
    Array.isArray(g.rows) &&
    (g.status === "playing" || g.status === "won" || g.status === "lost")
  );
}

/** Today's saved game; null when none, unreadable, or from another day. */
export function loadGame(
  storage: StorageLike | null,
  n: number,
): SavedGame | null {
  const saved = read(storage, GAME_KEY);
  if (!isSavedGame(saved) || saved.n !== n) return null;
  return { ...saved, card: saved.card ?? null };
}

export function saveGame(storage: StorageLike | null, game: SavedGame): void {
  write(storage, GAME_KEY, game);
}

export function loadStats(storage: StorageLike | null): Stats | null {
  return parseStats(read(storage, STATS_KEY));
}

export function saveStats(storage: StorageLike | null, stats: Stats): void {
  write(storage, STATS_KEY, stats);
}

/**
 * The record after a finished game. The server's record, when it kept the
 * game (store "server"), replaces the device's; otherwise the device counts
 * the game itself. A game already counted changes nothing.
 */
export function recordFinish(
  storage: StorageLike | null,
  game: Finished,
  server: Stats | null,
): Stats {
  const stats = server ?? nextStats(loadStats(storage), game);
  saveStats(storage, stats);
  return stats;
}
