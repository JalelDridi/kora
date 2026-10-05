import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { nextStats } from "./stats.ts";
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
