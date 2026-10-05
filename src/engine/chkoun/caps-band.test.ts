import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { capsBand } from "./caps-band.ts";

describe("caps bands (D-S2-13)", () => {
  it("0 → 0, 1 → 1, 9 → 1, 10 → 2, 29 → 2, 30 → 3, 59 → 3, 60 → 4", () => {
    const cases: [number, number][] = [
      [0, 0],
      [1, 1],
      [9, 1],
      [10, 2],
      [29, 2],
      [30, 3],
      [59, 3],
      [60, 4],
      [180, 4],
    ];
    for (const [caps, band] of cases) expect(capsBand(caps)).toBe(band);
  });

  it("band is monotonic", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 300 }),
        fc.integer({ min: 0, max: 300 }),
        (a, b) => {
          const [lo, hi] = a <= b ? [a, b] : [b, a];
          expect(capsBand(lo)).toBeLessThanOrEqual(capsBand(hi));
        },
      ),
    );
  });
});
