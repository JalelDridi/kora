import { describe, expect, it } from "vitest";
import { addDays, graceInEffect, graceUntilFor, isGuessable } from "./grace.ts";

describe("grace (P54)", () => {
  it("adds days across months, years and leap days", () => {
    expect(addDays("2026-10-04", 60)).toBe("2026-12-03");
    expect(addDays("2026-12-15", 60)).toBe("2027-02-13");
    expect(addDays("2028-02-01", 60)).toBe("2028-04-01");
  });

  it("starts, keeps and ends a grace", () => {
    const day = "2026-10-04";
    expect(graceUntilFor({ active: true }, false, day)).toBe("2026-12-03");
    expect(
      graceUntilFor({ active: false, graceUntil: "2026-10-04" }, false, day),
    ).toBe("2026-10-04");
    expect(
      graceUntilFor({ active: false, graceUntil: "2026-10-03" }, false, day),
    ).toBeUndefined();
    expect(graceUntilFor({ active: true }, true, day)).toBeUndefined();
    expect(graceUntilFor(undefined, false, day)).toBeUndefined();
    expect(graceUntilFor({ active: false }, false, day)).toBeUndefined();
  });

  it("holds through its last day on the build day, and always without one", () => {
    const pools = { active: false, graceUntil: "2026-12-03" };
    expect(graceInEffect(pools, "2026-12-03")).toBe(true);
    expect(graceInEffect(pools, "2026-12-04")).toBe(false);
    expect(graceInEffect(pools)).toBe(true);
    expect(graceInEffect({ active: false })).toBe(false);
    expect(isGuessable({ active: true })).toBe(true);
    expect(isGuessable(pools, "2026-12-04")).toBe(false);
  });
});
