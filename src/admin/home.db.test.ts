import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestClient,
  resetDatabase,
  TEST_DATABASE_URL,
} from "@/db/testing";
import { addDays } from "@/engine/chkoun/day.ts";
import {
  eligible,
  footballer,
  syncFootballers,
} from "@/pipeline/__fixtures__/calendar-pool.ts";
import { topUpCalendar, tunisToday } from "@/pipeline/calendar.ts";
import type { Pool, PoolPlayer } from "@/pipeline/types.ts";
import { changeDay, loadAdminCalendar } from "./calendar";
import { answersAround, githubCard, homeSummary } from "./home";

// Today's and tomorrow's Chkoun? answers, as the admin's game view shows
// them: the same rows as /admin/chkoun, read from the local Postgres.

const db = createTestClient(); // checks that the URL is local, first
const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
const seed = "test-seed-not-the-real-one";
const sql = {
  query: (text: string, values?: unknown[]) => client.query(text, values),
};
let today: string;

const poolOf = (players: PoolPlayer[]): Pool => ({
  version: 1,
  players,
  clubs: [],
  honours: [],
  flags: [],
  dropped: [],
});

beforeAll(async () => {
  await client.connect();
});

afterAll(async () => {
  await client.end();
  await db.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(db);
  await syncFootballers(sql, eligible);
  today = await tunisToday(sql);
  await topUpCalendar({ db: sql, seed, today, log: () => {} });
});

describe("answersAround", () => {
  it("gives today's and tomorrow's rows, as the calendar shows them", async () => {
    const around = await answersAround(sql, today);
    const calendar = await loadAdminCalendar(sql, today);
    const shown = (day: string) => calendar.days.find((d) => d.day === day);
    expect(around.today).toEqual(shown(today));
    expect(around.tomorrow).toEqual(shown(addDays(today, 1)));
    expect(around.today).toMatchObject({
      day: today,
      source: "generator",
      frozen: true,
    });
    expect(around.today?.nameLatin).toBe(around.today?.playerId);
    expect(around.tomorrow?.playerId).not.toBe(around.today?.playerId);
  });

  // Branch review, T5 M-c: the home warns as the calendar does. The day
  // after "today" is day 6, not frozen, so the same day can be pinned.
  it("warns when tomorrow's footballer is no longer eligible, and not once he is pinned", async () => {
    const shifted = addDays(today, 5);
    const tomorrow = addDays(today, 6);
    const playerId = String(
      (await answersAround(sql, shifted)).tomorrow?.playerId,
    );
    await client.query("UPDATE players SET fame_tier = 'D' WHERE id = $1", [
      playerId,
    ]);
    const warned = await answersAround(sql, shifted);
    expect(warned.tomorrow).toMatchObject({
      day: tomorrow,
      playerId,
      source: "generator",
      warnings: ["no longer eligible"],
    });
    const calendar = await loadAdminCalendar(sql, today);
    expect(calendar.days.find((d) => d.day === tomorrow)?.warnings).toEqual([
      "no longer eligible",
    ]);
    await changeDay(
      sql,
      { action: "pin", day: tomorrow, playerId },
      { today, seed },
    );
    expect((await answersAround(sql, shifted)).tomorrow).toMatchObject({
      playerId,
      source: "pin",
      warnings: [],
    });
  });

  it("gives null for a day with no answer", async () => {
    // The calendar is filled 30 days ahead: the day after its last is empty.
    const last = addDays(today, 29);
    const around = await answersAround(sql, last);
    expect(around.today?.day).toBe(last);
    expect(around.tomorrow).toBeNull();
  });
});

describe("the home summary", () => {
  it("the home summary reads one calendar query and no GitHub call when GitHub is off", async () => {
    const asked: string[] = [];
    const counted = {
      query: (text: string, values?: unknown[]) => {
        asked.push(text);
        return client.query(text, values);
      },
    };
    const players = [footballer("ready-a", "A"), footballer("ready-b", "B")];
    const summary = await homeSummary({
      db: counted,
      today,
      pool: poolOf(players),
      github: null,
    });
    expect(asked).toHaveLength(1);
    expect(summary.around?.today).toEqual(
      (await answersAround(sql, today)).today,
    );
    expect(summary.around?.tomorrow?.day).toBe(addDays(today, 1));
    expect(summary.rebuild).toBeNull();
    expect(summary.github).toEqual(githubCard(null));
    expect(summary.github.text).toMatch(/^Not connected/);
  });

  it("without a database the cards still read; the calendar says so", async () => {
    const down = {
      query: () => Promise.reject(new Error("connect ECONNREFUSED")),
    };
    const summary = await homeSummary({
      db: down,
      today,
      pool: poolOf([]),
      github: null,
    });
    expect(summary.around).toBeNull();
    expect(summary.pool.active).toBe(0);
  });
});
