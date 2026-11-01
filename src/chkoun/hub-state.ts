import { puzzleNumber, tunisDay } from "@/engine/chkoun/day.ts";
import type { Day } from "@/engine/chkoun/types.ts";
import { loadLast } from "@/season/device.ts";
import { loadGame, loadStats, type StorageLike } from "./device.ts";

// What each hub card says about today (mobile polish M6), read from the
// device only: the hub stays a static page and asks no server. A storage
// that is missing, refused or holds something unreadable reads as "not yet"
// (the Facebook in-app browser may wipe it). Pure over the storage given.

export type ChkounState = {
  /** Today's puzzle number. */
  n: number;
  kind: "notYet" | "playing" | "won" | "lost";
  guesses: number;
  /** Wins in a row still alive today: the last counted game is today's or yesterday's. */
  streak: number;
};

export type SeasonState =
  { kind: "notYet" } | { kind: "played"; w: number; d: number; l: number };

/** A storage whose reads may throw is read as none at all. */
function safe(storage: StorageLike | null): StorageLike | null {
  if (!storage) return null;
  return {
    getItem: (key) => {
      try {
        return storage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem: () => {},
  };
}

export function chkounState(
  storage: StorageLike | null,
  now: Date,
  first?: Day,
): ChkounState {
  const s = safe(storage);
  const n = puzzleNumber(tunisDay(now), first);
  const stats = loadStats(s);
  const streak = stats && stats.last >= n - 1 ? stats.streak : 0;
  const game = loadGame(s, n);
  if (!game) return { n, kind: "notYet", guesses: 0, streak };
  const guesses =
    game.rows.length > 0 ? game.rows.length : (game.grid?.length ?? 0);
  if (game.status === "playing" && guesses === 0)
    return { n, kind: "notYet", guesses: 0, streak };
  return {
    n,
    kind: game.status,
    guesses,
    streak: game.status === "lost" ? 0 : streak,
  };
}

export function seasonState(
  storage: StorageLike | null,
  now: Date,
): SeasonState {
  const last = loadLast(safe(storage));
  if (!last || last.day !== tunisDay(now)) return { kind: "notYet" };
  return { kind: "played", w: last.w, d: last.d, l: last.l };
}
