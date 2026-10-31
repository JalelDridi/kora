import { describe, expect, it } from "vitest";
import { nextStats } from "@/engine/chkoun/stats.ts";
import { GAME_KEY, STATS_KEY } from "./device.ts";
import { chkounState, seasonState } from "./hub-state.ts";

// The line each hub card prints about today, read from the device only
// (mobile polish M6). Pure functions over what the games keep.

const first = "2026-10-05";
const noon = new Date("2026-10-31T11:00:00Z"); // puzzle 27
const store = (entries: Record<string, unknown>) => ({
  getItem: (k: string) => (k in entries ? JSON.stringify(entries[k]) : null),
  setItem: () => {},
});
const raw = (entries: Record<string, string>) => ({
  getItem: (k: string) => entries[k] ?? null,
  setItem: () => {},
});
const throwing = {
  getItem: (): string | null => {
    throw new Error("blocked");
  },
  setItem: () => {},
};

describe("the hub's line for Chkoun?", () => {
  it("not yet, with today's number, when the device holds no game of today", () =>
    expect(chkounState(store({}), noon, first)).toEqual({
      n: 27,
      kind: "notYet",
      guesses: 0,
      streak: 0,
    }));
  it("in progress with the guesses so far", () =>
    expect(
      chkounState(
        store({
          [GAME_KEY]: {
            n: 27,
            token: "t",
            rows: [{}, {}],
            status: "playing",
            card: null,
          },
        }),
        noon,
        first,
      ),
    ).toMatchObject({ kind: "playing", guesses: 2 }));
  it("won, with the score and the streak", () => {
    const stats = nextStats(
      nextStats(null, { n: 26, solved: true, guesses: 4 }),
      {
        n: 27,
        solved: true,
        guesses: 3,
      },
    );
    expect(
      chkounState(
        store({
          [GAME_KEY]: {
            n: 27,
            token: "t",
            rows: [{}, {}, {}],
            status: "won",
            card: null,
          },
          [STATS_KEY]: stats,
        }),
        noon,
        first,
      ),
    ).toEqual({ n: 27, kind: "won", guesses: 3, streak: 2 });
  });
  it("lost: the streak is gone", () => {
    const stats = nextStats(
      nextStats(null, { n: 26, solved: true, guesses: 4 }),
      {
        n: 27,
        solved: false,
        guesses: 8,
      },
    );
    const rows = Array.from({ length: 8 }, () => ({}));
    expect(
      chkounState(
        store({
          [GAME_KEY]: { n: 27, token: "t", rows, status: "lost", card: null },
          [STATS_KEY]: stats,
        }),
        noon,
        first,
      ),
    ).toEqual({ n: 27, kind: "lost", guesses: 8, streak: 0 });
  });
  it("yesterday's win keeps the streak alive before today's game", () => {
    const stats = nextStats(null, { n: 26, solved: true, guesses: 2 });
    expect(chkounState(store({ [STATS_KEY]: stats }), noon, first)).toEqual({
      n: 27,
      kind: "notYet",
      guesses: 0,
      streak: 1,
    });
  });
  it("yesterday's game is not today's; a streak older than yesterday is 0", () => {
    const old = nextStats(null, { n: 20, solved: true, guesses: 2 });
    expect(
      chkounState(
        store({
          [GAME_KEY]: {
            n: 26,
            token: null,
            rows: [],
            status: "won",
            card: null,
          },
          [STATS_KEY]: old,
        }),
        noon,
        first,
      ),
    ).toEqual({ n: 27, kind: "notYet", guesses: 0, streak: 0 });
  });
  it("corrupt JSON reads as not yet", () =>
    expect(
      chkounState(
        raw({ [GAME_KEY]: "{not json", [STATS_KEY]: "[" }),
        noon,
        first,
      ),
    ).toEqual({ n: 27, kind: "notYet", guesses: 0, streak: 0 }));
  it("refused storage reads as not yet", () => {
    expect(chkounState(null, noon, first).kind).toBe("notYet");
    expect(chkounState(throwing, noon, first).kind).toBe("notYet");
  });
  it("a game kept from the server's copy (a grid, no rows) counts its grid", () =>
    expect(
      chkounState(
        store({
          [GAME_KEY]: {
            n: 27,
            token: null,
            rows: [],
            status: "won",
            card: null,
            grid: ["a", "b", "c", "d"],
          },
        }),
        noon,
        first,
      ),
    ).toMatchObject({ kind: "won", guesses: 4 }));
});

describe("the hub's line for 30–0", () => {
  const last = {
    day: "2026-10-31",
    xi: "a_0",
    w: 21,
    d: 5,
    l: 4,
    points: 68,
    rating: 80,
    replaces: "x",
    at: "2026-10-31T10:00:00Z",
  };
  it("played today shows the record; another day's season is not today's", () => {
    expect(seasonState(store({ "kora.season.v1.last": last }), noon)).toEqual({
      kind: "played",
      w: 21,
      d: 5,
      l: 4,
    });
    expect(
      seasonState(
        store({ "kora.season.v1.last": { ...last, day: "2026-10-30" } }),
        noon,
      ),
    ).toEqual({ kind: "notYet" });
  });
  it("the Tunis day decides: 23:30 UTC on the 30th is already the 31st in Tunis", () =>
    expect(
      seasonState(
        store({ "kora.season.v1.last": last }),
        new Date("2026-10-30T23:30:00Z"),
      ),
    ).toEqual({ kind: "played", w: 21, d: 5, l: 4 }));
  it("corrupt, malformed, missing or refused storage reads as not yet", () => {
    expect(seasonState(raw({ "kora.season.v1.last": "{oops" }), noon)).toEqual({
      kind: "notYet",
    });
    expect(
      seasonState(store({ "kora.season.v1.last": { ...last, w: "21" } }), noon),
    ).toEqual({ kind: "notYet" });
    expect(seasonState(store({}), noon)).toEqual({ kind: "notYet" });
    expect(seasonState(null, noon)).toEqual({ kind: "notYet" });
    expect(seasonState(throwing, noon)).toEqual({ kind: "notYet" });
  });
});
