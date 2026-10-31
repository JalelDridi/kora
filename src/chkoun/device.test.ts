import { describe, expect, it } from "vitest";
import { puzzleNumber, tunisDay } from "@/engine/chkoun/day.ts";
import type { Stats } from "@/engine/chkoun/stats.ts";
import type { TileRow } from "@/engine/chkoun/types.ts";
import {
  GAME_KEY,
  hasGameToday,
  loadGame,
  loadPast,
  PAST_KEY,
  loadStats,
  recordFinish,
  saveGame,
  savePast,
  STATS_KEY,
  type SavedGame,
  type StorageLike,
} from "./device";

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

const throwing: StorageLike = {
  getItem() {
    throw new Error("SecurityError");
  },
  setItem() {
    throw new Error("QuotaExceededError");
  },
};

const grey = { colour: "grey", arrow: null, value: null } as const;
const row: TileRow = {
  club: grey,
  country: grey,
  position: grey,
  age: grey,
  caps: grey,
  governorate: grey,
};
const game = (n: number): SavedGame => ({
  n,
  token: "v1.x.y",
  rows: [{ guess: "someone", row }],
  status: "playing",
  card: null,
});

describe("the device's copy of today's game", () => {
  it("saves and restores today's game by puzzle number", () => {
    const storage = new MemoryStorage();
    saveGame(storage, game(12));
    expect(loadGame(storage, 12)).toEqual(game(12));
    expect(storage.data.has(GAME_KEY)).toBe(true);
  });

  it("drops a saved game from another day", () => {
    const storage = new MemoryStorage();
    saveGame(storage, game(11));
    expect(loadGame(storage, 12)).toBeNull();
  });

  it("ignores what is not a saved game", () => {
    const storage = new MemoryStorage();
    storage.setItem(GAME_KEY, "{not json");
    expect(loadGame(storage, 12)).toBeNull();
    storage.setItem(GAME_KEY, JSON.stringify({ n: 12, rows: "x" }));
    expect(loadGame(storage, 12)).toBeNull();
  });

  it("survives a storage that throws (Facebook WebView)", () => {
    expect(() => saveGame(throwing, game(12))).not.toThrow();
    expect(loadGame(throwing, 12)).toBeNull();
    expect(loadStats(throwing)).toBeNull();
    expect(
      recordFinish(throwing, { n: 12, solved: true, guesses: 3 }, null),
    ).toMatchObject({ streak: 1, played: 1 });
  });

  it("works with no storage at all", () => {
    expect(loadGame(null, 1)).toBeNull();
    expect(() => saveGame(null, game(1))).not.toThrow();
  });
});

describe("the device's record", () => {
  it("a streak survives a reload: it is read back from storage", () => {
    const storage = new MemoryStorage();
    recordFinish(storage, { n: 1, solved: true, guesses: 2 }, null);
    recordFinish(storage, { n: 2, solved: true, guesses: 4 }, null);
    // A reload: a fresh read of the same storage.
    expect(loadStats(storage)).toMatchObject({ streak: 2, best: 2, won: 2 });
  });

  it("the same puzzle twice counts once", () => {
    const storage = new MemoryStorage();
    recordFinish(storage, { n: 5, solved: true, guesses: 2 }, null);
    const again = recordFinish(
      storage,
      { n: 5, solved: true, guesses: 2 },
      null,
    );
    expect(again.played).toBe(1);
  });

  it("the server's record replaces the device's when store is server", () => {
    const storage = new MemoryStorage();
    recordFinish(storage, { n: 1, solved: true, guesses: 2 }, null);
    const server: Stats = {
      last: 2,
      lastSolved: true,
      streak: 7,
      best: 9,
      played: 20,
      won: 15,
      dist: [1, 2, 3, 4, 5, 0, 0, 0],
    };
    expect(
      recordFinish(storage, { n: 2, solved: true, guesses: 3 }, server),
    ).toEqual(server);
    expect(JSON.parse(storage.getItem(STATS_KEY)!)).toEqual(server);
  });
});

describe("a game of today on the device (the help stays shut over it)", () => {
  // 12:00 in Tunis on 31 October 2026; 23:30 UTC is already 1 November there.
  const noon = new Date("2026-10-31T11:00:00Z");
  const today = puzzleNumber(tunisDay(noon));

  it("is there when today's game is saved, playing or finished", () => {
    const storage = new MemoryStorage();
    saveGame(storage, game(today));
    expect(hasGameToday(storage, noon)).toBe(true);
    saveGame(storage, { ...game(today), status: "won" });
    expect(hasGameToday(storage, noon)).toBe(true);
  });

  it("is not there for yesterday's game, after Tunis midnight, or with no storage", () => {
    const storage = new MemoryStorage();
    saveGame(storage, game(today - 1));
    expect(hasGameToday(storage, noon)).toBe(false);
    saveGame(storage, game(today));
    expect(hasGameToday(storage, new Date("2026-10-31T23:30:00Z"))).toBe(false);
    expect(hasGameToday(null, noon)).toBe(false);
    expect(hasGameToday(throwing, noon)).toBe(false);
  });
});

describe("yesterday's game on the device (M7)", () => {
  it("yesterday's game is kept apart from today's", () => {
    const storage = new MemoryStorage();
    saveGame(storage, game(12));
    savePast(storage, { ...game(11), status: "won" });
    expect(storage.data.has(PAST_KEY)).toBe(true);
    expect(PAST_KEY).not.toBe(GAME_KEY);
    expect(loadGame(storage, 12)).toEqual(game(12));
    expect(loadGame(storage, 11)).toBeNull();
    expect(loadPast(storage, 11)).toEqual({ ...game(11), status: "won" });
    expect(loadPast(storage, 12)).toBeNull();
    expect(loadPast(storage, 10)).toBeNull();
    expect(storage.data.has(STATS_KEY)).toBe(false);
  });

  it("survives a storage that throws, or none", () => {
    savePast(throwing, game(11));
    expect(loadPast(throwing, 11)).toBeNull();
    savePast(null, game(11));
    expect(loadPast(null, 11)).toBeNull();
  });
});

describe("the hint on the device (M8)", () => {
  const hint = { latin: "E", arabic: "إ", french: "E" };
  it("a reload keeps the hint, today's and yesterday's", () => {
    const storage = new MemoryStorage();
    saveGame(storage, { ...game(12), hint });
    savePast(storage, { ...game(11), hint });
    expect(loadGame(storage, 12)?.hint).toEqual(hint);
    expect(loadPast(storage, 11)?.hint).toEqual(hint);
  });

  it("a game with no hint has none; a hint that is not one letter per form is dropped", () => {
    const storage = new MemoryStorage();
    saveGame(storage, game(12));
    expect(loadGame(storage, 12)?.hint).toBeUndefined();
    for (const bad of [
      { latin: "El", arabic: null, french: null },
      { latin: "E", arabic: "إل", french: null },
      { latin: null, arabic: "إ", french: "E" },
      "E",
    ]) {
      storage.setItem(GAME_KEY, JSON.stringify({ ...game(12), hint: bad }));
      expect(loadGame(storage, 12)).toEqual(game(12));
    }
  });
});
