import { puzzleNumber, tunisDay } from "@/engine/chkoun/day.ts";
import { nextStats, parseStats } from "@/engine/chkoun/stats.ts";
import type { Hint } from "@/engine/chkoun/hint.ts";
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
/** Yesterday's game (mobile polish M7), apart from today's: never counted. */
export const PAST_KEY = "kora.chkoun.v1.past";

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
  /** The first letters, from the 5th guess on (M8). */
  hint?: Hint;
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

/** One letter, or null where the form allows it: never more of a name. */
function isLetter(v: unknown, nullable: boolean): boolean {
  if (v === null) return nullable;
  return typeof v === "string" && [...v].length === 1;
}

function isHint(v: unknown): v is Hint {
  if (typeof v !== "object" || v === null) return false;
  const h = v as Record<string, unknown>;
  return (
    isLetter(h.latin, false) &&
    isLetter(h.arabic, true) &&
    isLetter(h.french, true)
  );
}

/** A saved game as read back: the card defaults to null, a bad hint is dropped. */
function restore(saved: SavedGame): SavedGame {
  const { hint, ...rest } = saved;
  return {
    ...rest,
    card: saved.card ?? null,
    ...(isHint(hint)
      ? {
          hint: { latin: hint.latin, arabic: hint.arabic, french: hint.french },
        }
      : {}),
  };
}

/** Today's saved game; null when none, unreadable, or from another day. */
export function loadGame(
  storage: StorageLike | null,
  n: number,
): SavedGame | null {
  const saved = read(storage, GAME_KEY);
  if (!isSavedGame(saved) || saved.n !== n) return null;
  return restore(saved);
}

/**
 * Whether this device holds a game of today's puzzle, by the browser's
 * clock: the first-visit help stays shut over it (mobile polish M2).
 */
export function hasGameToday(storage: StorageLike | null, now: Date): boolean {
  return loadGame(storage, puzzleNumber(tunisDay(now))) !== null;
}

export function saveGame(storage: StorageLike | null, game: SavedGame): void {
  write(storage, GAME_KEY, game);
}

/** Yesterday's saved game, by its puzzle number; null otherwise. */
export function loadPast(
  storage: StorageLike | null,
  n: number,
): SavedGame | null {
  const saved = read(storage, PAST_KEY);
  if (!isSavedGame(saved) || saved.n !== n) return null;
  return restore(saved);
}

export function savePast(storage: StorageLike | null, game: SavedGame): void {
  write(storage, PAST_KEY, game);
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
