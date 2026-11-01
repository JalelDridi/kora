import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { distribution, nextStats, parseStats } from "./stats.ts";
import type { Stats } from "./stats.ts";

const win = (n: number, guesses = 3) => ({ n, solved: true, guesses });
const loss = (n: number) => ({ n, solved: false, guesses: 8 });

describe("nextStats", () => {
  it("a first game starts the record", () => {
    expect(nextStats(null, win(4, 2))).toEqual({
      last: 4,
      lastSolved: true,
      streak: 1,
      best: 1,
      played: 1,
      won: 1,
      dist: [0, 1, 0, 0, 0, 0, 0, 0],
      lastGuesses: 2,
    });
  });

  it("a win after yesterday's win adds one", () => {
    const s = nextStats(nextStats(null, win(4)), win(5));
    expect(s.streak).toBe(2);
    expect(s.best).toBe(2);
  });

  it("a win after a gap starts at 1", () => {
    const s = nextStats(nextStats(nextStats(null, win(4)), win(5)), win(7));
    expect(s.streak).toBe(1);
    expect(s.best).toBe(2);
    expect(s.played).toBe(3);
  });

  it("a loss resets the streak to 0", () => {
    const s = nextStats(nextStats(null, win(4)), loss(5));
    expect(s).toMatchObject({ streak: 0, best: 1, played: 2, won: 1 });
    // A win the day after a loss starts again at 1.
    expect(nextStats(s, win(6)).streak).toBe(1);
  });

  it("the same puzzle twice changes nothing", () => {
    const s = nextStats(null, win(4));
    expect(nextStats(s, win(4, 5))).toEqual(s);
    expect(nextStats(s, loss(4))).toEqual(s);
    // An older puzzle changes nothing either.
    expect(nextStats(s, win(3))).toEqual(s);
  });

  it("best never falls", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            gap: fc.integer({ min: 0, max: 3 }),
            solved: fc.boolean(),
            guesses: fc.integer({ min: 1, max: 8 }),
          }),
          { maxLength: 40 },
        ),
        (games) => {
          let s: Stats | null = null;
          let n = 1;
          for (const g of games) {
            n += g.gap;
            const next: Stats = nextStats(s, { n, ...g });
            if (s) expect(next.best).toBeGreaterThanOrEqual(s.best);
            expect(next.best).toBeGreaterThanOrEqual(next.streak);
            s = next;
          }
        },
      ),
    );
  });

  it("distribution counts wins by guesses", () => {
    let s = nextStats(null, win(1, 1));
    s = nextStats(s, win(2, 8));
    s = nextStats(s, loss(3));
    s = nextStats(s, win(4, 1));
    expect(s.dist).toEqual([2, 0, 0, 0, 0, 0, 0, 1]);
    expect(s.won).toBe(3);
    expect(s.played).toBe(4);
  });
});

describe("distribution", () => {
  it("eight bars, scaled to the most frequent, today's win marked", () => {
    let s = nextStats(null, { n: 1, solved: true, guesses: 3 });
    s = nextStats(s, { n: 2, solved: true, guesses: 3 });
    s = nextStats(s, { n: 3, solved: true, guesses: 5 });
    const bars = distribution(s, 3);
    expect(bars).toHaveLength(8);
    expect(bars.map((b) => b.count)).toEqual([0, 0, 2, 0, 1, 0, 0, 0]);
    expect(bars[2].share).toBe(1);
    expect(bars[4]).toMatchObject({ share: 0.5, today: true });
    expect(bars.filter((b) => b.today)).toHaveLength(1);
  });

  it("a loss today marks nothing; no record gives eight empty bars", () => {
    const lost = nextStats(null, { n: 4, solved: false, guesses: 8 });
    expect(distribution(lost, 4).some((b) => b.today)).toBe(false);
    expect(
      distribution(null, null).every((b) => b.count === 0 && b.share === 0),
    ).toBe(true);
  });

  it("numbers the bars 1 to 8 and marks nothing for another day", () => {
    const s = nextStats(null, { n: 7, solved: true, guesses: 2 });
    expect(distribution(s, 8).map((b) => b.guesses)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(distribution(s, 8).some((b) => b.today)).toBe(false);
    expect(distribution(s, null).some((b) => b.today)).toBe(false);
  });

  it("a record kept before the last win's guesses were stored marks nothing", () => {
    const old = parseStats({
      last: 5,
      lastSolved: true,
      streak: 1,
      best: 1,
      played: 1,
      won: 1,
      dist: [0, 0, 1, 0, 0, 0, 0, 0],
    });
    expect(old).not.toBeNull();
    expect(distribution(old, 5).some((b) => b.today)).toBe(false);
  });
});

describe("parseStats", () => {
  it("keeps the last win's guesses, and drops one out of range", () => {
    const base = {
      last: 5,
      lastSolved: true,
      streak: 1,
      best: 1,
      played: 1,
      won: 1,
      dist: [0, 0, 1, 0, 0, 0, 0, 0],
    };
    expect(parseStats({ ...base, lastGuesses: 3 })?.lastGuesses).toBe(3);
    expect(parseStats({ ...base, lastGuesses: 9 })).not.toHaveProperty(
      "lastGuesses",
    );
    expect(parseStats(base)).not.toHaveProperty("lastGuesses");
  });

  it("a loss keeps no guesses", () => {
    const s = nextStats(nextStats(null, { n: 1, solved: true, guesses: 2 }), {
      n: 2,
      solved: false,
      guesses: 8,
    });
    expect(s).not.toHaveProperty("lastGuesses");
  });
});
