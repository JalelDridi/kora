import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestClient,
  resetDatabase,
  TEST_DATABASE_URL,
} from "@/db/testing";
import { addDays } from "@/engine/chkoun/day.ts";
import {
  footballer,
  syncFootballers,
} from "@/pipeline/__fixtures__/calendar-pool.ts";
import { copyResults } from "./copy.ts";
import { FakeKv } from "./kv.ts";
import { recordFinish } from "./store.ts";

// The nightly copy against the local Postgres, with Redis faked. A fixed
// "today" in the future of any real run: rows for its past days are plain
// INSERTs, which the frozen-day trigger allows.

const db = createTestClient(); // checks that the URL is local, first
const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
const today = "2026-12-19";
const day = (n: number) => addDays(today, n);
const visitor = (i: number) =>
  `4b5c0f3e-2d1a-4c8e-9f7b-${String(i).padStart(12, "0")}`;

let kv: FakeKv;

beforeAll(async () => {
  await client.connect();
});

afterAll(async () => {
  await client.end();
  await db.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(db);
  await syncFootballers(
    { query: (text, values) => client.query(text, values) },
    [footballer("the-answer", "A")],
  );
  kv = new FakeKv();
});

async function puzzle(d: string): Promise<string> {
  const { rows } = await client.query(
    "INSERT INTO puzzles (id, game, day, player_id, source) VALUES (gen_random_uuid(), 'chkoun', $1::date, 'the-answer', 'generator') RETURNING id",
    [d],
  );
  return rows[0].id;
}

const finish = (d: string, i: number, guesses = 3, solved = true) =>
  recordFinish(kv, "test", {
    day: d,
    n: 1,
    visitorId: visitor(i),
    solved,
    guesses,
    grid: Array.from({ length: guesses }, (_, k) =>
      k === guesses - 1 && solved ? "gggggg" : "xaxgxu",
    ),
  });

const copy = () =>
  copyResults({
    kv,
    db: { query: (text, values) => client.query(text, values) },
    env: "test",
    today,
  });

async function results() {
  const { rows } = await client.query(
    "SELECT to_char(day, 'YYYY-MM-DD') AS day, visitor_id, puzzle_id, solved, score, detail FROM results ORDER BY day, visitor_id",
  );
  return rows;
}

describe("copyResults", () => {
  it("copies the finished games of the last 7 days, not today", async () => {
    for (const n of [-8, -7, -1, 0]) {
      await puzzle(day(n));
      await finish(day(n), 1);
    }
    const out = await copy();
    expect(out).toEqual({ copied: 2, already: 0, skipped: 0, notes: [] });
    expect((await results()).map((r) => r.day)).toEqual([day(-7), day(-1)]);
  });

  it("running it twice inserts nothing new", async () => {
    await puzzle(day(-2));
    await finish(day(-2), 1);
    await finish(day(-2), 2);
    expect((await copy()).copied).toBe(2);
    expect(await copy()).toEqual({
      copied: 0,
      already: 2,
      skipped: 0,
      notes: [],
    });
    expect(await results()).toHaveLength(2);
  });

  it("a row already in Postgres is skipped, the others go in", async () => {
    await puzzle(day(-3));
    await finish(day(-3), 1);
    await copy();
    // A partial earlier night: one more game reached Redis since.
    await finish(day(-3), 2);
    expect(await copy()).toMatchObject({ copied: 1, already: 1 });
  });

  it("a day without a puzzle row is skipped and reported", async () => {
    await puzzle(day(-1));
    await finish(day(-1), 1);
    await finish(day(-4), 1);
    await finish(day(-4), 2);
    const out = await copy();
    expect(out).toMatchObject({ copied: 1, skipped: 2 });
    expect(out.notes).toEqual([`${day(-4)}: no puzzle row, 2 game(s) skipped`]);
  });

  it("a malformed entry is skipped and reported, the rest goes in", async () => {
    await puzzle(day(-1));
    await finish(day(-1), 1);
    await kv.hsetnx(`kora:test:chkoun:r:${day(-1)}`, visitor(2), "{broken");
    await kv.hsetnx(
      `kora:test:chkoun:r:${day(-1)}`,
      "not-a-uuid",
      '{"s":1,"k":1,"grid":["gggggg"]}',
    );
    const out = await copy();
    expect(out).toMatchObject({ copied: 1, skipped: 2 });
    expect(out.notes).toEqual([`${day(-1)}: 2 malformed game(s) skipped`]);
  });

  it("score is the number of guesses, solved and detail.grid are stored, puzzle_id is set", async () => {
    const id = await puzzle(day(-1));
    await finish(day(-1), 1, 2, true);
    await finish(day(-1), 2, 8, false);
    await copy();
    expect(await results()).toEqual([
      {
        day: day(-1),
        visitor_id: visitor(1),
        puzzle_id: id,
        solved: true,
        score: 2,
        detail: { grid: ["xaxgxu", "gggggg"] },
      },
      {
        day: day(-1),
        visitor_id: visitor(2),
        puzzle_id: id,
        solved: false,
        score: 8,
        detail: { grid: Array(8).fill("xaxgxu") },
      },
    ]);
  });

  it("with Redis off it does nothing and says so", async () => {
    const out = await copyResults({
      kv: null,
      db: { query: (text, values) => client.query(text, values) },
      env: "test",
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
