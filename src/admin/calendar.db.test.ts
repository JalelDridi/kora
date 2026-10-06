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
import { CalendarActionError, changeDay, loadAdminCalendar } from "./calendar";

// Jalel's calendar against the local Postgres. Days are relative to today
// as Postgres sees it in Tunis, so the frozen-day trigger agrees.

const db = createTestClient(); // checks that the URL is local, first
const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
// A test seed, never the real one.
const seed = "test-seed-not-the-real-one";
const sql = {
  query: (text: string, values?: unknown[]) => client.query(text, values),
};
const notReady = footballer("not-ready-footballer", "A", false);
const tierD = footballer("tier-d-footballer", "D");
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
  await syncFootballers(sql, [...eligible, notReady, tierD]);
  today = await tunisToday(sql);
  await topUpCalendar({ db: sql, seed, today, log: () => {} });
});

const day = (n: number) => addDays(today, n);

async function row(d: string) {
  const { rows } = await client.query(
    "SELECT player_id, source, note FROM puzzles WHERE game = 'chkoun' AND day = $1::date",
    [d],
  );
  return rows[0];
}

/** An eligible footballer who is not on day `n` and not near it. */
async function another(n: number): Promise<string> {
  const { rows } = await client.query(
    "SELECT player_id FROM puzzles WHERE game = 'chkoun'",
  );
  const used = new Set(rows.map((r) => r.player_id));
  const free = eligible.find((p) => p.fame?.tier === "B" && !used.has(p.id));
  expect(free, `a free B footballer for day ${n}`).toBeDefined();
  return free!.id;
}

const refusal = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (error) {
    return error instanceof CalendarActionError ? error.code : String(error);
  }
  return "accepted";
};

describe("the admin calendar", () => {
  it("lists the last 7 and the next 30 days, the window and the tier counts", async () => {
    const cal = await loadAdminCalendar(sql, today, "2026-10-01");
    expect(cal.days).toHaveLength(37);
    expect(cal.days[0].day).toBe(day(-7));
    expect(cal.days[36].day).toBe(day(29));
    expect(cal.window).toBe(44);
    expect(cal.counts).toEqual({ A: 15, B: 15, C: 15 });
    expect(cal.days.filter((d) => d.frozen).map((d) => d.day)).toEqual(
      Array.from({ length: 10 }, (_, i) => day(i - 7)),
    );
    const first = cal.days[7];
    expect(first).toMatchObject({
      day: today,
      source: "generator",
      warnings: [],
    });
    expect(first.nameLatin).toBe(first.playerId);
    // Swaps take A to C; pins also D; never a footballer who is not ready.
    expect(cal.swappable.map((p) => p.id)).not.toContain("tier-d-footballer");
    expect(cal.pinnable.map((p) => p.id)).toContain("tier-d-footballer");
    expect(cal.pinnable.map((p) => p.id)).not.toContain("not-ready-footballer");
  });

  it('swap on an unfrozen day sets the footballer and source generator, note "swapped by Jalel"', async () => {
    const id = await another(3);
    await changeDay(
      sql,
      { action: "swap", day: day(3), playerId: id },
      { today, seed },
    );
    expect(await row(day(3))).toEqual({
      player_id: id,
      source: "generator",
      note: "swapped by Jalel",
    });
  });

  it("pin sets source pin and the note", async () => {
    const id = await another(10);
    await changeDay(
      sql,
      { action: "pin", day: day(10), playerId: id, note: "derby" },
      { today, seed },
    );
    expect(await row(day(10))).toEqual({
      player_id: id,
      source: "pin",
      note: "derby",
    });
    await changeDay(
      sql,
      { action: "pin", day: day(11), playerId: await another(11) },
      { today, seed },
    );
    expect((await row(day(11))).note).toBe("pinned by Jalel");
  });

  it("redraw draws from the seed for that day", async () => {
    const before = (await row(day(5))).player_id;
    await changeDay(sql, { action: "redraw", day: day(5) }, { today, seed });
    const after = await row(day(5));
    expect(after.player_id).not.toBe(before);
    expect(after).toMatchObject({
      source: "generator",
      note: "redrawn by Jalel",
    });
    // The same draw again: the seed decides, not chance.
    await resetDatabase(db);
    await syncFootballers(sql, [...eligible, notReady, tierD]);
    await topUpCalendar({ db: sql, seed, today, log: () => {} });
    await changeDay(sql, { action: "redraw", day: day(5) }, { today, seed });
    expect((await row(day(5))).player_id).toBe(after.player_id);
    expect(
      await refusal(
        changeDay(
          sql,
          { action: "redraw", day: day(5) },
          { today, seed: undefined },
        ),
      ),
    ).toBe("no-seed");
  });

  it('any change to a frozen day is refused with "this day is frozen" (app check and trigger)', async () => {
    const id = await another(2);
    for (const change of [
      { action: "swap" as const, day: day(2), playerId: id },
      { action: "pin" as const, day: day(0), playerId: id },
      { action: "redraw" as const, day: day(1) },
    ])
      expect(await refusal(changeDay(sql, change, { today, seed }))).toBe(
        "frozen",
      );
    // The trigger refuses too when the page's "today" is a day behind
    // (a change sent just after midnight in Tunis).
    expect(
      await refusal(
        changeDay(
          sql,
          { action: "swap", day: day(2), playerId: id },
          { today: day(-1), seed },
        ),
      ),
    ).toBe("frozen");
    // Day + 3 is open.
    expect(
      await refusal(
        changeDay(
          sql,
          { action: "swap", day: day(3), playerId: id },
          { today, seed },
        ),
      ),
    ).toBe("accepted");
  });

  it("a footballer who is not answer-ready is refused for swap and pin", async () => {
    for (const action of ["swap", "pin"] as const)
      expect(
        await refusal(
          changeDay(
            sql,
            { action, day: day(4), playerId: "not-ready-footballer" },
            { today, seed },
          ),
        ),
      ).toBe("not-ready");
    expect(
      await refusal(
        changeDay(
          sql,
          { action: "swap", day: day(4), playerId: "nobody" },
          { today, seed },
        ),
      ),
    ).toBe("not-ready");
  });

  it("pins may use any tier A to D", async () => {
    expect(
      await refusal(
        changeDay(
          sql,
          { action: "swap", day: day(6), playerId: "tier-d-footballer" },
          { today, seed },
        ),
      ),
    ).toBe("not-ready");
    await changeDay(
      sql,
      { action: "pin", day: day(6), playerId: "tier-d-footballer" },
      { today, seed },
    );
    expect((await row(day(6))).source).toBe("pin");
  });

  it("a day outside the calendar or not a date is refused", async () => {
    for (const d of ["", "2026-13-40", "tomorrow", day(30), day(-1)])
      expect(
        await refusal(
          changeDay(sql, { action: "redraw", day: d }, { today, seed }),
        ),
      ).toBe("bad-day");
  });

  // Review L2 through the admin: a pin redraws a nearby generator day that
  // holds the same footballer.
  it("pinning a footballer redraws the generator day near it that holds him", async () => {
    const onDay8 = (await row(day(8))).player_id;
    await changeDay(
      sql,
      { action: "pin", day: day(6), playerId: onDay8 },
      { today, seed },
    );
    expect((await row(day(6))).player_id).toBe(onDay8);
    expect((await row(day(8))).player_id).not.toBe(onDay8);
    const cal = await loadAdminCalendar(sql, today);
    expect(cal.days.flatMap((d) => d.warnings)).not.toContain(
      "repeated within the window",
    );
  });
});
