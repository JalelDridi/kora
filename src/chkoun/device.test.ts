import { describe, expect, it } from "vitest";
import type { Stats } from "@/engine/chkoun/stats.ts";
import type { TileRow } from "@/engine/chkoun/types.ts";
import {
  GAME_KEY,
  loadGame,
  loadStats,
  recordFinish,
  saveGame,
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
