import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestClient,
  resetDatabase,
  TEST_DATABASE_URL,
} from "@/db/testing";
import { addDays, puzzleNumber, tunisDay } from "@/engine/chkoun/day.ts";
import {
  eligible,
  syncFootballers,
} from "@/pipeline/__fixtures__/calendar-pool.ts";
import { createPuzzleReader, puzzleKey } from "./puzzle.server.ts";
import type { PuzzleDeps, PuzzleKv, SqlRows } from "./puzzle.server.ts";

// Today's puzzle against the local Postgres: read once, reserve once.

const db = createTestClient(); // checks that the URL is local, first
const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
// A test seed, never the real one.
const seed = "test-seed-not-the-real-one";

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
    eligible,
  );
});

/** SQL through the test client, counting the statements. */
function counted() {
  const seen: string[] = [];
  const sql: SqlRows = async (text, values) => {
    seen.push(text);
    return (await client.query(text, values)).rows;
  };
  return { sql, seen };
}

/** A Redis stand-in: a map, with the expiry it was given. */
function fakeKv() {
  const store = new Map<string, { value: string; ex: number }>();
  const kv: PuzzleKv = {
    get: async (key) => store.get(key)?.value ?? null,
    set: async (key, value, { ex }) => {
      store.set(key, { value, ex });
      return "OK";
    },
  };
  return { kv, store };
}

const reader = (over: Partial<PuzzleDeps> = {}) =>
  createPuzzleReader({
    sql: counted().sql,
    kv: null,
    seed,
    env: "test",
    log: () => {},
    firstDay: "2026-10-01",
    ...over,
  });

const now = new Date();
const today = tunisDay(now);

async function insert(day: string, playerId: string, source = "generator") {
  await client.query(
    "INSERT INTO puzzles (id, game, day, player_id, source) VALUES (gen_random_uuid(), 'chkoun', $1::date, $2, $3)",
    [day, playerId, source],
  );
}

describe("todayPuzzle", () => {
  it("todayPuzzle returns the row for the Tunis day", async () => {
    await insert(addDays(today, -1), eligible[1].id);
    await insert(today, eligible[0].id);
    await insert(addDays(today, 1), eligible[2].id);
    expect(await reader()(now)).toEqual({
      day: today,
      number: puzzleNumber(today, "2026-10-01"),
      playerId: eligible[0].id,
    });
  });

  it("when today has no row, it writes a reserve once", async () => {
    // Two server instances ask at the same moment.
    const [a, b] = await Promise.all([reader()(now), reader()(now)]);
    expect(a).not.toBeNull();
    expect(b).toEqual(a);
    const { rows } = await client.query(
      "SELECT player_id, source FROM puzzles WHERE game = 'chkoun'",
    );
    expect(rows).toEqual([{ player_id: a!.playerId, source: "reserve" }]);
    // Tier A first.
    expect(a!.playerId).toMatch(/^tier-a-/);
  });

  it("the reserve avoids the last 120 days", async () => {
    const tierA = eligible.filter((p) => p.fame?.tier === "A");
    // Every A but one played recently.
    for (const [i, p] of tierA.slice(1).entries())
      await insert(addDays(today, -1 - i * 7), p.id);
    expect((await reader()(now))?.playerId).toBe(tierA[0].id);
  });

  it("without a seed there is no reserve: null", async () => {
    const lines: string[] = [];
    expect(
      await reader({ seed: undefined, log: (l) => lines.push(l) })(now),
    ).toBeNull();
    expect((await client.query("SELECT 1 FROM puzzles")).rowCount).toBe(0);
    expect(lines.join()).not.toContain(seed);
  });

  it("the result is memoised per day: a second call does not query", async () => {
    await insert(today, eligible[0].id);
    const { sql, seen } = counted();
    const read = reader({ sql });
    await read(now);
    const queries = seen.length;
    expect(queries).toBeGreaterThan(0);
    await read(now);
    await read(new Date(now.getTime() + 1000));
    expect(seen).toHaveLength(queries);
  });

  it("with Redis on, one instance reads the database and the others read Redis", async () => {
    await insert(today, eligible[0].id);
    const { kv, store } = fakeKv();
    const first = counted();
    await reader({ sql: first.sql, kv })(now);
    expect(store.get(puzzleKey("test", today))).toEqual({
      value: eligible[0].id,
      ex: 259_200,
    });
    const second = counted();
    expect((await reader({ sql: second.sql, kv })(now))?.playerId).toBe(
      eligible[0].id,
    );
    expect(second.seen).toEqual([]);
  });

  it("a Redis failure falls back to the database", async () => {
    await insert(today, eligible[0].id);
    const broken: PuzzleKv = {
      get: async () => {
        throw new Error("down");
      },
      set: async () => {
        throw new Error("down");
      },
    };
    expect((await reader({ kv: broken })(now))?.playerId).toBe(eligible[0].id);
  });

  it("a database that does not answer, with nothing cached: null, and the next call tries again", async () => {
    let up = false;
    const sql: SqlRows = async (text, values) => {
      if (!up) throw new Error("connection refused");
      return (await client.query(text, values)).rows;
    };
    await insert(today, eligible[0].id);
    const read = reader({ sql });
    expect(await read(now)).toBeNull();
    up = true;
    expect((await read(now))?.playerId).toBe(eligible[0].id);
  });
});
