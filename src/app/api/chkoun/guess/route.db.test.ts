import { readFileSync } from "node:fs";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createTestClient,
  resetDatabase,
  TEST_DATABASE_URL,
} from "@/db/testing";
import { FIRST_DAY, puzzleNumber, tunisDay } from "@/engine/chkoun/day.ts";
import {
  footballer,
  syncFootballers,
} from "@/pipeline/__fixtures__/calendar-pool.ts";
import type { Pool } from "@/pipeline/types.ts";
import { GET } from "../today/route";
import { POST } from "./route";

// The two routes wired to the real modules: data/pool.json for the facts,
// the local Postgres for today's puzzle, Redis off. Today's answer is a
// footballer of the committed pool, written to the test database by hand.

const db = createTestClient(); // checks that the URL is local, first
const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
const globalForDb = globalThis as { db?: unknown };

const pool = JSON.parse(readFileSync("data/pool.json", "utf8")) as Pool;
const active = pool.players.filter((p) => p.pools.active);
const answer = active[0];
const wrong = active.slice(1, 9).map((p) => p.id);
const today = tunisDay(new Date());
const n = puzzleNumber(today, FIRST_DAY);

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", TEST_DATABASE_URL);
  vi.stubEnv("CHKOUN_SEED", "test-seed-not-the-real-one");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  await client.connect();
  await resetDatabase(db);
  await syncFootballers(
    { query: (text, values) => client.query(text, values) },
    [footballer(answer.id, "A")],
  );
  await client.query(
    "INSERT INTO puzzles (id, game, day, player_id, source) VALUES (gen_random_uuid(), 'chkoun', $1::date, $2, 'generator')",
    [today, answer.id],
  );
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await client.end();
  await db.$disconnect();
  delete globalForDb.db;
});

const guess = (body: unknown) =>
  POST(
    new Request("http://localhost/api/chkoun/guess", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("POST /api/chkoun/guess and GET /api/chkoun/today", () => {
  it("today is open, never cached, and names no footballer", async () => {
    const r = await GET(new Request("http://localhost/api/chkoun/today"));
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    const text = await r.text();
    expect(JSON.parse(text)).toMatchObject({
      status: "open",
      number: n,
      day: today,
      store: "device",
    });
    expect(text).not.toContain(answer.id);
  });

  it("plays to a loss: no answer before the end, the card on the 8th guess, no cookie", async () => {
    let token: string | null = null;
    for (const [i, id] of wrong.entries()) {
      const r = await guess({ n, token, guess: id });
      expect(r.status).toBe(200);
      expect(r.headers.get("cache-control")).toBe("private, no-store");
      expect(r.headers.get("set-cookie")).toBeNull();
      const text = await r.text();
      const body = JSON.parse(text);
      token = body.token;
      if (i < 7) {
        expect(body.status).toBe("playing");
        expect(text).not.toContain(answer.id);
        expect(text).not.toContain(answer.nameLatin);
      } else {
        expect(body).toMatchObject({
          status: "lost",
          store: "device",
          card: { id: answer.id },
        });
      }
    }
  });

  it("a body that is too large is refused before it is read", async () => {
    const r = await POST(
      new Request("http://localhost/api/chkoun/guess", {
        method: "POST",
        headers: { "content-length": "4096" },
        body: "x".repeat(4096),
      }),
    );
    expect(r.status).toBe(400);
  });

  it("without CHKOUN_SEED the game is closed", async () => {
    vi.stubEnv("CHKOUN_SEED", "");
    const r = await guess({ n, token: null, guess: wrong[0] });
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: "closed" });
    vi.stubEnv("CHKOUN_SEED", "test-seed-not-the-real-one");
  });
});
