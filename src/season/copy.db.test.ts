import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakeKv } from "@/chkoun/kv.ts";
import {
  createTestClient,
  resetDatabase,
  TEST_DATABASE_URL,
} from "@/db/testing";
import { addDays } from "@/engine/chkoun/day.ts";
import { copySeasons } from "./copy.ts";
import { recordSeason, seasonResultsKey } from "./store.ts";
import type { SeasonEntry } from "./store.ts";

// The nightly copy of first seasons against the local Postgres, with Redis
// faked. A fixed "today" in the future of any real run.

const prisma = createTestClient(); // checks that the URL is local, first
const db = new pg.Client({ connectionString: TEST_DATABASE_URL });
const today = "2026-12-19";
const visitor = (i: number) =>
  `5d2e8a41-7c3b-4f9a-8e1d-${String(i).padStart(12, "0")}`;
const CODE = "a-share-code-for-the-squad";
const ENTRY: SeasonEntry = {
  xi: CODE,
  w: 29,
  d: 1,
  l: 0,
  gf: 81,
  ga: 9,
  points: 88,
  rating: 91.2,
};

let kv: FakeKv;

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  await db.end();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
  kv = new FakeKv();
  // One first season a day, from today − 8 to today.
  for (let n = 8; n >= 0; n--)
    await recordSeason(kv, {
      env: "local",
      day: addDays(today, -n),
      visitorId: visitor(1),
      entry: ENTRY,
      score: 880,
    });
});

const copy = () =>
  copySeasons({
    kv,
    db: { query: (text, values) => db.query(text, values) },
    env: "local",
    today,
  });

describe("copySeasons", () => {
  it("copies the last 7 days of first seasons, not today", async () => {
    expect((await copy()).copied).toBe(7);
    const days = (
      await db.query(
        "SELECT day::text FROM results WHERE game = 'season' ORDER BY day",
      )
    ).rows.map((r) => r.day);
    expect(days).toEqual(
      [1, 2, 3, 4, 5, 6, 7].reverse().map((n) => addDays(today, -n)),
    );
  });

  it("running it twice inserts nothing new", async () => {
    await copy();
    expect(await copy()).toMatchObject({ copied: 0, already: 7 });
  });

  it("score is points, solved is 30 wins, detail holds xi, w, d, l, gf, ga, rating", async () => {
    await copy();
    const [row] = (
      await db.query(
        "SELECT score, solved, detail, puzzle_id FROM results WHERE game = 'season'",
      )
    ).rows;
    expect(row).toEqual({
      score: 88,
      solved: false,
      puzzle_id: null,
      detail: { xi: CODE, w: 29, d: 1, l: 0, gf: 81, ga: 9, rating: 91.2 },
    });
  });

  it("a 30–0 season is solved", async () => {
    await recordSeason(kv, {
      env: "local",
      day: addDays(today, -1),
      visitorId: visitor(2),
      entry: { ...ENTRY, w: 30, d: 0, points: 90 },
      score: 900,
    });
    await copy();
    const { rows } = await db.query(
      "SELECT score, solved FROM results WHERE visitor_id = $1::uuid",
      [visitor(2)],
    );
    expect(rows).toEqual([{ score: 90, solved: true }]);
  });

  it("a malformed entry is skipped and counted, the rest goes in", async () => {
    const key = seasonResultsKey("local", addDays(today, -2));
    await kv.hsetnx(key, visitor(2), "{not json");
    const out = await copy();
    expect(out).toMatchObject({ copied: 7, skipped: 1 });
    expect(out.notes).toEqual([
      `${addDays(today, -2)}: 1 malformed season(s) skipped`,
    ]);
  });

  it("a visitor id that is not a uuid is skipped and counted", async () => {
    const key = seasonResultsKey("local", addDays(today, -3));
    await kv.hsetnx(key, "not-a-uuid", JSON.stringify(ENTRY));
    expect(await copy()).toMatchObject({ copied: 7, skipped: 1 });
  });

  it("with Redis off it does nothing and says so", async () => {
    const out = await copySeasons({
      kv: null,
      db: { query: (text, values) => db.query(text, values) },
      env: "local",
      today,
    });
    expect(out).toEqual({
      copied: 0,
      already: 0,
      skipped: 0,
      notes: ["Redis is off: nothing to copy"],
    });
  });
});
