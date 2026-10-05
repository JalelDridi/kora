import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { addDays, weekday } from "./day.ts";
import { drawOne, repeats, schedule, TIER_WEIGHTS } from "./schedule.ts";
import type { CalendarRow, Candidate } from "./schedule.ts";

// A test seed, never the real one.
const seed = "test-seed-not-the-real-one";
const today = "2026-10-05"; // a Monday

const pool = (n: number, tier = "A", prefix = tier.toLowerCase()) =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, tier }));

const candidates: fc.Arbitrary<Candidate[]> = fc
  .array(fc.constantFrom("A", "B", "C"), { minLength: 1, maxLength: 300 })
  .map((tiers) => tiers.map((tier, i) => ({ id: `f${i}`, tier })));

const tierOf = (list: Candidate[]) => new Map(list.map((c) => [c.id, c.tier]));

describe("schedule", () => {
  it("the same inputs give the same calendar", () => {
    fc.assert(
      fc.property(candidates, fc.integer({ min: 1, max: 40 }), (list, days) => {
        const input = { seed, today, days, candidates: list, existing: [] };
        expect(schedule(input)).toEqual(schedule(input));
      }),
      { numRuns: 50 },
    );
  });

  it("another seed gives another calendar", () => {
    const list = [...pool(50, "A"), ...pool(50, "B"), ...pool(50, "C")];
    const draw = (s: string) =>
      schedule({ seed: s, today, days: 30, candidates: list, existing: [] })
        .write.map((r) => r.playerId)
        .join();
    expect(draw(seed)).not.toBe(draw(`${seed}-2`));
  });

  it("no footballer repeats within the window, where window = min(120, candidates - 1)", () => {
    fc.assert(
      fc.property(candidates, (list) => {
        const out = schedule({
          seed,
          today,
          days: 30,
          candidates: list,
          existing: [],
        });
        expect(out.window).toBe(Math.min(120, list.length - 1));
        const shrunk = new Set(out.notes.map((n) => n.slice(0, 10)));
        for (const [, later] of repeats(out.write, out.window))
          expect(shrunk.has(later)).toBe(true);
      }),
      { numRuns: 60 },
    );
  });

  it("with 121 or more candidates the window is 120", () => {
    const list = [...pool(61, "A"), ...pool(60, "B")];
    expect(
      schedule({ seed, today, days: 1, candidates: list, existing: [] }).window,
    ).toBe(120);
    expect(
      schedule({
        seed,
        today,
        days: 1,
        candidates: [...list, ...pool(500, "B", "x")],
        existing: [],
      }).window,
    ).toBe(120);
  });

  it("C appears only on Saturday and Sunday; D never appears", () => {
    fc.assert(
      fc.property(candidates, (list) => {
        const withD = [...list, ...pool(20, "D")];
        const tiers = tierOf(withD);
        const out = schedule({
          seed,
          today,
          days: 30,
          candidates: withD,
          existing: [],
        });
        for (const row of out.write) {
          const tier = tiers.get(row.playerId);
          expect(tier).not.toBe("D");
          if (tier === "C") expect([0, 6]).toContain(weekday(row.day));
        }
      }),
      { numRuns: 60 },
    );
  });

  it("only candidates are drawn", () => {
    fc.assert(
      fc.property(candidates, (list) => {
        const ids = new Set(list.map((c) => c.id));
        for (const row of schedule({
          seed,
          today,
          days: 30,
          candidates: list,
          existing: [],
        }).write)
          expect(ids.has(row.playerId)).toBe(true);
      }),
      { numRuns: 60 },
    );
  });

  it("frozen days, pins and reserves are never changed", () => {
    const list = pool(40, "A");
    const gone = "left-the-pool";
    const existing: CalendarRow[] = [
      // Frozen: today and the next two days, even with an ineligible footballer.
      { day: today, playerId: gone, source: "generator" },
      { day: addDays(today, 2), playerId: gone, source: "reserve" },
      // Unfrozen, but pinned or reserved.
      { day: addDays(today, 5), playerId: gone, source: "pin" },
      { day: addDays(today, 6), playerId: gone, source: "reserve" },
    ];
    const out = schedule({ seed, today, days: 10, candidates: list, existing });
    const written = new Set(out.write.map((r) => r.day));
    for (const row of existing) expect(written.has(row.day)).toBe(false);
    // The empty frozen day is filled: the database lets it be filled once.
    expect(written.has(addDays(today, 1))).toBe(true);
    expect(out.write).toHaveLength(10 - existing.length);
  });

  it("an unfrozen generator day whose footballer is no longer a candidate is redrawn; a valid one is kept", () => {
    const list = pool(40, "A");
    const existing: CalendarRow[] = [
      { day: addDays(today, 3), playerId: "a7", source: "generator" },
      { day: addDays(today, 4), playerId: "left", source: "generator" },
    ];
    const out = schedule({ seed, today, days: 10, candidates: list, existing });
    const byDay = new Map(out.write.map((r) => [r.day, r]));
    expect(byDay.has(addDays(today, 3))).toBe(false);
    expect(byDay.get(addDays(today, 4))?.playerId).not.toBe("left");
    expect(byDay.get(addDays(today, 4))?.source).toBe("generator");
  });

  it("a future pin within the window blocks the same footballer on nearby days", () => {
    // Two B footballers (B plays every weekday): the window is 1. A pin of
    // b0 on day 5 rules b0 out of days 4 and 6.
    const list = pool(2, "B");
    const pinned: CalendarRow = {
      day: addDays(today, 5),
      playerId: "b0",
      source: "pin",
    };
    const out = schedule({
      seed,
      today,
      days: 10,
      candidates: list,
      existing: [pinned],
    });
    expect(out.window).toBe(1);
    const byDay = new Map(out.write.map((r) => [r.day, r.playerId]));
    expect(byDay.get(addDays(today, 4))).toBe("b1");
    expect(byDay.get(addDays(today, 6))).toBe("b1");
    // With two footballers, a day boxed in by both shrinks its window, and says so.
    const noted = new Set(out.notes.map((n) => n.slice(0, 10)));
    for (const [first, second] of repeats([...out.write, pinned], 1))
      expect(noted.has(first) || noted.has(second)).toBe(true);
  });

  it("when a day has no candidate within the window, the window shrinks for that day only and a note says so", () => {
    // Three A footballers for a Monday to Thursday stretch: the window is
    // 2; a pin on Tuesday leaves Monday-to-Wednesday short.
    const list = pool(3, "A");
    const existing: CalendarRow[] = [
      { day: addDays(today, 3), playerId: "a0", source: "pin" },
      { day: addDays(today, 4), playerId: "a1", source: "pin" },
      { day: addDays(today, 5), playerId: "a2", source: "pin" },
    ];
    const out = schedule({ seed, today, days: 4, candidates: list, existing });
    expect(out.window).toBe(2);
    expect(out.notes.some((n) => /window shrunk to \d days/.test(n))).toBe(
      true,
    );
    expect(out.write.map((r) => r.day)).toEqual([
      today,
      addDays(today, 1),
      addDays(today, 2),
    ]);
  });

  it("says when a day cannot be filled at all", () => {
    // Only C footballers: no weekday can have an answer.
    const out = schedule({
      seed,
      today,
      days: 1,
      candidates: pool(10, "C"),
      existing: [],
    });
    expect(out.write).toEqual([]);
    expect(out.notes).toEqual([
      `${today}: no candidate for this weekday's tiers`,
    ]);
  });

  it("over 10,000 days with 100 candidates per tier, the tier mix per weekday is within 3 points of N5's weights", () => {
    const list = [...pool(100, "A"), ...pool(100, "B"), ...pool(100, "C")];
    const tiers = tierOf(list);
    const out = schedule({
      seed,
      today,
      days: 10_000,
      candidates: list,
      existing: [],
    });
    expect(out.write).toHaveLength(10_000);
    const counts = Array.from({ length: 7 }, () => ({
      A: 0,
      B: 0,
      C: 0,
      n: 0,
    }));
    for (const row of out.write) {
      const c = counts[weekday(row.day)];
      c[tiers.get(row.playerId) as "A" | "B" | "C"]++;
      c.n++;
    }
    counts.forEach((c, day) => {
      for (const t of ["A", "B", "C"] as const)
        expect(Math.abs(c[t] / c.n - TIER_WEIGHTS[day][t])).toBeLessThan(0.03);
    });
  });
});

describe("drawOne", () => {
  it("renormalises over the tiers that still have a candidate", () => {
    // Only B is left on a weekday: every draw is B.
    for (let i = 0; i < 50; i++)
      expect(
        drawOne({
          seed,
          day: addDays(today, i * 7),
          candidates: [...pool(3, "A"), ...pool(3, "B")],
          recent: ["a0", "a1", "a2"],
          tiers: TIER_WEIGHTS[1],
        }),
      ).toMatch(/^b/);
  });

  it("gives null when every candidate is ruled out", () => {
    expect(
      drawOne({
        seed,
        day: today,
        candidates: pool(2, "A"),
        recent: ["a0", "a1"],
        tiers: TIER_WEIGHTS[1],
      }),
    ).toBeNull();
  });
});
