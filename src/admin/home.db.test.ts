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
  syncFootballers,
} from "@/pipeline/__fixtures__/calendar-pool.ts";
import { topUpCalendar, tunisToday } from "@/pipeline/calendar.ts";
import { loadAdminCalendar } from "./calendar";
import { answersAround } from "./home";

// Today's and tomorrow's Chkoun? answers, as the admin's game view shows
// them: the same rows as /admin/chkoun, read from the local Postgres.

const db = createTestClient(); // checks that the URL is local, first
const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
const seed = "test-seed-not-the-real-one";
const sql = {
  query: (text: string, values?: unknown[]) => client.query(text, values),
};
let today: string;

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

  it("gives null for a day with no answer", async () => {
    // The calendar is filled 30 days ahead: the day after its last is empty.
    const last = addDays(today, 29);
    const around = await answersAround(sql, last);
    expect(around.today?.day).toBe(last);
    expect(around.tomorrow).toBeNull();
  });
});
