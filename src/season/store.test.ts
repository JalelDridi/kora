import { describe, expect, it } from "vitest";
import { FakeKv } from "@/chkoun/kv.ts";
import {
  BOARD_KEEP,
  boardKey,
  parseSeasonEntry,
  playedKey,
  recordSeason,
  SEASON_TTL_SECONDS,
  seasonResultsKey,
} from "./store.ts";
import type { SeasonEntry } from "./store.ts";

const day = "2026-10-07";
const ID = "0b7c1d2e-3f40-4a5b-8c6d-7e8f90a1b2c3";
const OTHER = "1c8d2e3f-4051-4b6c-9d7e-8f90a1b2c3d4";
const entry: SeasonEntry = {
  xi: "gk_0~d1_0~d2_0~d3_0~d4_0~m1_0~m2_0~m3_0~f1_0~f2_0~f3_0",
  w: 20,
  d: 6,
  l: 4,
  gf: 55,
  ga: 25,
  points: 66,
  rating: 71.5,
};
const record = (kv: FakeKv, visitorId: string, e: SeasonEntry, score: number) =>
  recordSeason(kv, { env: "local", day, visitorId, entry: e, score });

describe("30–0 seasons in Redis", () => {
  it("recordSeason writes the visitor's entry once (HSETNX) with 8 days of life", async () => {
    const kv = new FakeKv();
    expect(await record(kv, ID, entry, 100)).toEqual({ first: true, rank: 0 });
    const again = { ...entry, xi: "another", w: 30, d: 0, l: 0 };
    expect(await record(kv, ID, again, 900)).toEqual({
      first: false,
      rank: null,
    });
    const stored = await kv.hget(seasonResultsKey("local", day), ID);
    expect(parseSeasonEntry(stored!)).toEqual(entry);
    expect(kv.ttl(seasonResultsKey("local", day))).toBe(SEASON_TTL_SECONDS);
    expect(SEASON_TTL_SECONDS).toBe(8 * 86_400);
  });

  it("only a new entry enters the board, trimmed to 50", async () => {
    const kv = new FakeKv();
    await record(kv, ID, entry, 100);
    await record(kv, ID, { ...entry, xi: "second" }, 500);
    const board = boardKey("local", day);
    expect(await kv.ztop(board, 5)).toEqual([{ member: entry.xi, score: 100 }]);
    expect(kv.ttl(board)).toBe(SEASON_TTL_SECONDS);
    for (let i = 0; i < 60; i++)
      await record(
        kv,
        `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        { ...entry, xi: `xi-${i}` },
        1000 + i,
      );
    expect(BOARD_KEEP).toBe(50);
    expect(await kv.ztop(board, 100)).toHaveLength(50);
    expect(await record(kv, OTHER, { ...entry, xi: "last" }, 1)).toEqual({
      first: true,
      rank: null,
    });
  });

  it("keys start with kora:local:season:", () => {
    expect(seasonResultsKey("local", day)).toBe(
      "kora:local:season:r:2026-10-07",
    );
    expect(boardKey("local", day)).toBe("kora:local:season:b:2026-10-07");
    expect(playedKey("local", "abc")).toBe("kora:local:season:played:abc");
  });

  it('a Redis error returns "unavailable"', async () => {
    const kv = new FakeKv();
    kv.failing = true;
    expect(await record(kv, ID, entry, 100)).toBe("unavailable");
    const half = new FakeKv();
    half.failOn.add("zaddTop");
    expect(await record(half, ID, entry, 100)).toBe("unavailable");
  });

  it("parseSeasonEntry refuses a W-D-L that does not sum to 30", () => {
    expect(parseSeasonEntry(JSON.stringify(entry))).toEqual(entry);
    expect(parseSeasonEntry(JSON.stringify({ ...entry, l: 5 }))).toBeNull();
    expect(
      parseSeasonEntry(JSON.stringify({ ...entry, points: 67 })),
    ).toBeNull();
    expect(parseSeasonEntry(JSON.stringify({ ...entry, xi: "" }))).toBeNull();
    expect(parseSeasonEntry(JSON.stringify({ ...entry, gf: -1 }))).toBeNull();
    expect(parseSeasonEntry("{")).toBeNull();
    expect(parseSeasonEntry("null")).toBeNull();
  });
});
