import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { hashRand, hmacRand, poisson, sfc32, shuffle } from "./prng.ts";

const bytes16 = fc.uint8Array({ minLength: 16, maxLength: 16 });

describe("prng", () => {
  it("sfc32 is deterministic and in [0, 1)", () =>
    fc.assert(
      fc.property(bytes16, (bytes) => {
        const a = sfc32(bytes);
        const b = sfc32(Uint8Array.from(bytes));
        for (let i = 0; i < 50; i++) {
          const x = a();
          expect(x).toBe(b());
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThan(1);
        }
      }),
    ));

  it("hashRand and hmacRand are deterministic and depend on their text", () => {
    expect(hashRand("x")()).toBe(hashRand("x")());
    expect(hashRand("x")()).not.toBe(hashRand("y")());
    expect(hmacRand("k", "a")()).toBe(hmacRand("k", "a")());
    expect(hmacRand("k", "a")()).not.toBe(hmacRand("k2", "a")());
    expect(hmacRand("k", "a")()).not.toBe(hmacRand("k", "b")());
  });

  it("poisson(λ, u) never decreases as λ rises for a fixed u", () =>
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 10, noNaN: true }),
        fc.double({ min: 0, max: 10, noNaN: true }),
        fc.double({ min: 0, max: 0.999999, noNaN: true }),
        (a, b, u) => {
          const [lo, hi] = a <= b ? [a, b] : [b, a];
          expect(poisson(lo, u, 30)).toBeLessThanOrEqual(poisson(hi, u, 30));
        },
      ),
    ));

  it("poisson mean over 50,000 draws is within 2% of λ for λ = 0.5, 1.3, 4", () => {
    for (const lambda of [0.5, 1.3, 4]) {
      const rand = hashRand(`poisson-${lambda}`);
      let sum = 0;
      for (let i = 0; i < 50_000; i++) sum += poisson(lambda, rand(), 50);
      expect(Math.abs(sum / 50_000 - lambda)).toBeLessThan(0.02 * lambda);
    }
  });

  it("poisson never goes past max", () =>
    expect(poisson(4, 0.999999, 3)).toBe(3));

  it("shuffle is a permutation", () =>
    fc.assert(
      fc.property(fc.array(fc.integer()), bytes16, (xs, bytes) => {
        const out = shuffle(xs, sfc32(bytes));
        expect(out).toHaveLength(xs.length);
        expect([...out].sort((a, b) => a - b)).toEqual(
          [...xs].sort((a, b) => a - b),
        );
      }),
    ));
});
