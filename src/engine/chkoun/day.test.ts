import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  addDays,
  ageOn,
  dayDiff,
  dayOfNumber,
  FIRST_DAY,
  isFrozen,
  nextMidnight,
  puzzleNumber,
  tunisDay,
  weekday,
} from "./day.ts";

describe("the Tunis day", () => {
  it("22:59:59.999 UTC on 19 Oct 2026 is 19 Oct in Tunis", () => {
    expect(tunisDay(new Date("2026-10-19T22:59:59.999Z"))).toBe("2026-10-19");
  });

  it("23:00:00.000 UTC is 20 Oct", () => {
    expect(tunisDay(new Date("2026-10-19T23:00:00.000Z"))).toBe("2026-10-20");
  });

  it("nextMidnight returns 23:00 UTC for an October day", () => {
    expect(nextMidnight("2026-10-19").toISOString()).toBe(
      "2026-10-19T23:00:00.000Z",
    );
  });

  it("nextMidnight is the first instant of the next Tunis day", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 3000 }), (n) => {
        const day = addDays("2024-01-01", n);
        const midnight = nextMidnight(day);
        expect(tunisDay(midnight)).toBe(addDays(day, 1));
        expect(tunisDay(new Date(midnight.getTime() - 1))).toBe(day);
      }),
      { numRuns: 200 },
    );
  });
});

describe("puzzle numbers", () => {
  it("the puzzle number of FIRST_DAY is 1", () => {
    expect(puzzleNumber(FIRST_DAY)).toBe(1);
  });

  it("of the next day is 2", () => {
    expect(puzzleNumber(addDays(FIRST_DAY, 1))).toBe(2);
  });

  it("of the day before is 0", () => {
    expect(puzzleNumber(addDays(FIRST_DAY, -1))).toBe(0);
  });

  it("dayOfNumber is the inverse of puzzleNumber", () => {
    expect(dayOfNumber(1)).toBe(FIRST_DAY);
    expect(dayOfNumber(12, "2026-11-01")).toBe("2026-11-12");
    expect(puzzleNumber("2026-11-12", "2026-11-01")).toBe(12);
  });
});

describe("day arithmetic", () => {
  it("addDays and dayDiff are inverse", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3000 }),
        fc.integer({ min: -3000, max: 3000 }),
        (start, n) => {
          const from = addDays("2020-01-01", start);
          expect(dayDiff(from, addDays(from, n))).toBe(n);
        },
      ),
    );
  });

  it("weekday of 2026-10-24 is Saturday", () => {
    expect(weekday("2026-10-24")).toBe(6);
    expect(weekday("2026-10-25")).toBe(0);
  });

  it("ageOn counts whole years on the puzzle day", () => {
    expect(ageOn("2000-10-20", "2026-10-19")).toBe(25);
    expect(ageOn("2000-10-20", "2026-10-20")).toBe(26);
    expect(ageOn("2000-02-29", "2026-02-28")).toBe(25);
    expect(ageOn("2000-02-29", "2026-03-01")).toBe(26);
  });

  it("a day is frozen up to two days ahead", () => {
    expect(isFrozen("2026-10-05", "2026-10-05")).toBe(true);
    expect(isFrozen("2026-10-07", "2026-10-05")).toBe(true);
    expect(isFrozen("2026-10-08", "2026-10-05")).toBe(false);
    expect(isFrozen("2026-10-01", "2026-10-05")).toBe(true);
  });
});
