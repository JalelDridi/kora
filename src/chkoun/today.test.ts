import { beforeEach, describe, expect, it } from "vitest";
import { puzzleNumber, tunisDay } from "@/engine/chkoun/day.ts";
import { footballer } from "@/pipeline/__fixtures__/calendar-pool.ts";
import type { Pool } from "@/pipeline/types.ts";
import { buildFootballers } from "./attributes.ts";
import type { Puzzle } from "./guess.ts";
import { FakeKv } from "./kv.ts";
import { recordFinish } from "./store.ts";
import { handleToday } from "./today.ts";
import type { TodayDeps } from "./today.ts";

// Test footballers and a test day; never the real calendar.
const firstDay = "2026-10-05";
const noon = new Date("2026-10-19T11:00:00Z");
const visitor = "4b5c0f3e-2d1a-4c8e-9f7b-1a2b3c4d5e6f";
const answer = {
  ...footballer("the-answer", "A"),
  nameLatin: "The Answer",
  nameArabic: "الجواب",
};
const pool: Pool = {
  version: 1,
  players: [answer, footballer("someone-else", "B")],
  clubs: [],
  honours: [],
  flags: [],
  dropped: [],
};
const footballers = buildFootballers(pool, []);
const puzzle = async (now: Date): Promise<Puzzle> => ({
  day: tunisDay(now),
  number: puzzleNumber(tunisDay(now), firstDay),
  playerId: answer.id,
});

let kv: FakeKv;
beforeEach(() => {
  kv = new FakeKv();
});

const deps = (over: Partial<TodayDeps> = {}): TodayDeps => ({
  now: noon,
  puzzle,
  footballers,
  kv: null,
  env: "test",
  firstDay,
  ...over,
});

const leaks = (value: unknown) =>
  ["the-answer", "The Answer", "الجواب"].filter((s) =>
    JSON.stringify(value).includes(s),
  );

describe("handleToday", () => {
  it("before FIRST_DAY: status soon with startsAt", async () => {
    const r = await handleToday(
      deps({ now: new Date("2026-10-01T09:00:00Z") }),
      null,
    );
    expect(r).toEqual({
      status: 200,
      body: {
        status: "soon",
        day: "2026-10-01",
        startsAt: "2026-10-04T23:00:00.000Z",
      },
    });
  });

  it("returns number, day, endsAt (next Tunis midnight), store", async () => {
    expect((await handleToday(deps(), null)).body).toEqual({
      status: "open",
      number: 15,
      day: "2026-10-19",
      endsAt: "2026-10-19T23:00:00.000Z",
      store: "device",
    });
    expect((await handleToday(deps({ kv }), null)).body).toMatchObject({
      store: "server",
    });
  });

  it("with a visitor cookie and Redis on, returns that visitor's finished game of today (grid, solved, guesses, card) and stats", async () => {
    const stats = await recordFinish(kv, "test", {
      day: "2026-10-19",
      n: 15,
      visitorId: visitor,
      solved: true,
      guesses: 2,
      grid: ["xxaxgx", "gggggg"],
    });
    const r = await handleToday(deps({ kv }), `kora_v=${visitor}`);
    expect(r.body).toMatchObject({
      status: "open",
      number: 15,
      store: "server",
      finished: {
        grid: ["xxaxgx", "gggggg"],
        solved: true,
        guesses: 2,
        card: { id: "the-answer", nameLatin: "The Answer" },
      },
      stats,
    });
  });

  it("never returns the answer for a visitor who has not finished", async () => {
    // Yesterday's game only.
    await recordFinish(kv, "test", {
      day: "2026-10-18",
      n: 14,
      visitorId: visitor,
      solved: true,
      guesses: 1,
      grid: ["gggggg"],
    });
    for (const [d, cookie] of [
      [deps({ kv }), `kora_v=${visitor}`],
      [deps({ kv }), null],
      [deps(), `kora_v=${visitor}`],
    ] as const) {
      const r = await handleToday(d, cookie);
      expect(r.body.finished).toBeUndefined();
      expect(leaks(r)).toEqual([]);
    }
  });

  it("with Redis failing, the day is open and kept on the device", async () => {
    kv.failing = true;
    expect(
      (await handleToday(deps({ kv }), `kora_v=${visitor}`)).body,
    ).toMatchObject({ status: "open", store: "device" });
  });

  it("no puzzle: closed", async () => {
    expect(
      (await handleToday(deps({ puzzle: async () => null }), null)).body,
    ).toMatchObject({ status: "closed", number: 15 });
  });
});
