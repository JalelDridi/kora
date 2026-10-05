import { spawnSync } from "node:child_process";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestClient,
  resetDatabase,
  TEST_DATABASE_URL,
} from "@/db/testing";
import { addDays, tunisDay } from "../engine/chkoun/day.ts";
import { CalendarRefusal, topUpCalendar } from "./calendar.ts";
import {
  eligible,
  footballer,
  syncFootballers,
} from "./__fixtures__/calendar-pool.ts";
import type { PoolPlayer } from "./types.ts";

// The calendar against the local Postgres: what a deploy writes.

const db = createTestClient(); // checks that the URL is local, first
const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
// A test seed, never the real one.
const seed = "test-seed-not-the-real-one";
const log = () => {};

beforeAll(async () => {
  await client.connect();
});

afterAll(async () => {
  await client.end();
  await db.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(db);
});

const sync = (players: PoolPlayer[]) =>
  syncFootballers(
    { query: (text, values) => client.query(text, values) },
    players,
  );

async function calendar(): Promise<
  Map<string, { player: string; source: string }>
> {
  const { rows } = await client.query<{
    day: string;
    player_id: string;
    source: string;
  }>(
    "SELECT to_char(day, 'YYYY-MM-DD') AS day, player_id, source FROM puzzles WHERE game = 'chkoun' ORDER BY day",
  );
  return new Map(
    rows.map((r) => [r.day, { player: r.player_id, source: r.source }]),
  );
}

const today = () => tunisDay(new Date());
const topUp = (options: { seed?: string } = { seed }) =>
  topUpCalendar({ db: client, seed: options.seed, today: today(), log });

describe("topUpCalendar", () => {
  it("top-up fills the next 30 days from an empty table", async () => {
    await sync(eligible);
    const out = await topUp();
    expect(out).toMatchObject({ written: 30, window: 44, notes: [] });
    const rows = await calendar();
    expect([...rows.keys()]).toEqual(
      Array.from({ length: 30 }, (_, i) => addDays(today(), i)),
    );
    expect(new Set([...rows.values()].map((r) => r.source))).toEqual(
      new Set(["generator"]),
    );
  });

  it("a second top-up writes nothing", async () => {
    await sync(eligible);
    await topUp();
    const before = await calendar();
    expect((await topUp()).written).toBe(0);
    expect(await calendar()).toEqual(before);
  });

  it("top-up keeps frozen days and pins, and redraws an unfrozen day whose footballer stopped being eligible", async () => {
    await sync(eligible);
    await topUp();
    const first = await calendar();
    const day = (n: number) => addDays(today(), n);
    // Day 10 becomes Jalel's pin (allowed: it is not frozen).
    await client.query(
      "UPDATE puzzles SET source = 'pin', note = 'derby' WHERE game = 'chkoun' AND day = $1::date",
      [day(10)],
    );
    // The footballers of a frozen day, of an unfrozen day and of the pin
    // stop being eligible: their caps confidence falls to low.
    const frozen = first.get(day(1))!.player;
    const open = first.get(day(5))!.player;
    const pinned = first.get(day(10))!.player;
    await sync(
      eligible.map((p) =>
        [frozen, open, pinned].includes(p.id)
          ? footballer(p.id, p.fame!.tier!, false)
          : p,
      ),
    );

    const out = await topUp();
    const after = await calendar();
    expect(out.written).toBe(1);
    expect(after.get(day(1))).toEqual(first.get(day(1)));
    expect(after.get(day(10))).toEqual({ player: pinned, source: "pin" });
    expect(after.get(day(5))?.player).not.toBe(open);
    expect(after.get(day(5))?.source).toBe("generator");
  });

  it("eligible means answer-ready (ANSWER_READY_SQL), tier A to C", async () => {
    const notReady = footballer("x1", "A", false);
    const obscure = footballer("x2", "D");
    const unmeasured = { ...footballer("x3", "A"), fame: null };
    const legend = {
      ...footballer("x4", "A"),
      pools: { active: false, legend: true },
    };
    await sync([...eligible, notReady, obscure, unmeasured, legend]);
    const out = await topUp();
    expect(out.window).toBe(44);
    const drawn = new Set(
      [...(await calendar()).values()].map((r) => r.player),
    );
    for (const id of ["x1", "x2", "x3", "x4"])
      expect(drawn.has(id)).toBe(false);
  });

  it("without a seed it refuses and names CHKOUN_SEED", async () => {
    await sync(eligible);
    await expect(topUp({})).rejects.toThrow(CalendarRefusal);
    await expect(topUp({ seed: "" })).rejects.toThrow(/CHKOUN_SEED/);
    expect((await calendar()).size).toBe(0);
  });

  it("it refuses when one of the next 3 days cannot be filled", async () => {
    // Only C footballers: no weekday can be filled.
    await sync(eligible.filter((p) => p.fame?.tier === "C"));
    await expect(topUp()).rejects.toThrow(
      /the Chkoun\? calendar cannot fill .*15 eligible footballers/,
    );
    expect((await calendar()).size).toBe(0);
  });
});

describe("node src/pipeline/sync-cli.ts calendar", () => {
  const cli = (env: Record<string, string>) =>
    spawnSync(process.execPath, ["src/pipeline/sync-cli.ts", "calendar"], {
      encoding: "utf8",
      // Only what the command needs: no seed or database from the shell.
      env: {
        NODE_ENV: "test",
        PATH: process.env.PATH ?? "",
        SYSTEMROOT: process.env.SYSTEMROOT ?? "",
        DATABASE_URL_UNPOOLED: TEST_DATABASE_URL,
        ...env,
      },
    });

  it("without CHKOUN_SEED, exits 1 naming it, before connecting", () => {
    const r = cli({});
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/CHKOUN_SEED is not set/);
  });

  it("exits 1 when the next 3 days cannot be filled", async () => {
    const r = cli({ CHKOUN_SEED: seed });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/cannot fill/);
  });

  it("tops the calendar up and prints no footballer", async () => {
    await sync(eligible);
    const r = cli({ CHKOUN_SEED: seed });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(
      /calendar: 45 eligible footballers \(A 15, B 15, C 15\), window 44 days/,
    );
    expect(r.stdout).toMatch(/calendar: 30 days written/);
    for (const p of eligible) expect(r.stdout).not.toContain(p.id);
    expect(r.stdout).not.toContain(seed);
  });
});
