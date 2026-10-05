import { describe, expect, it } from "vitest";
import { fameOf, fameScore, fameTier, TIER_FLOORS } from "./fame.ts";

describe("fame (D-S2-4)", () => {
  const khazri = { en: 258284, fr: 140531, ar: 31582 };

  it("fameScore({en:258284, fr:140531, ar:31582}, false) ≈ 5.73", () => {
    expect(fameScore(khazri, false)).toBeCloseTo(5.73, 1);
  });

  it("+0.5 with the local star tag", () => {
    expect(fameScore(khazri, true)).toBeCloseTo(fameScore(khazri, false) + 0.5);
  });

  it("no views at all scores 0", () => {
    expect(fameScore({ en: 0, fr: 0, ar: 0 }, false)).toBe(0);
  });

  it("fameTier: 5.0 → A, 4.99 → B, 4.5 → B, 4.0 → C, 3.99 → D, null → D", () => {
    expect(fameTier(5.0)).toBe("A");
    expect(fameTier(4.99)).toBe("B");
    expect(fameTier(4.5)).toBe("B");
    expect(fameTier(4.0)).toBe("C");
    expect(fameTier(3.99)).toBe("D");
    expect(fameTier(null)).toBe("D");
  });

  it("the thresholds live in one constant", () => {
    expect(TIER_FLOORS).toEqual({ A: 5.0, B: 4.5, C: 4.0 });
  });

  it("fameOf without views has no score and no tier", () => {
    expect(fameOf(null, null, true)).toEqual({
      score: null,
      tier: null,
      views: null,
      window: null,
      localStar: true,
    });
    expect(fameOf(khazri, "202510-202609", false)).toMatchObject({
      tier: "A",
      window: "202510-202609",
      views: khazri,
    });
  });
});
