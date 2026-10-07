import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { rate, RATING } from "./rating.ts";
import type { RatingInputs } from "./types.ts";

const base: RatingInputs = {
  line: "forward",
  decade: 2010,
  caps: 40,
  capsFromBand: false,
  goalsPerCap: 0.3,
  goalsDoubt: false,
  apps: 120,
  historyDoubt: false,
  titles: { league: 2, cup: 1, caf: 1 },
  afcon2004: false,
};
const inputs = fc.record({
  line: fc.constantFrom("goalkeeper", "defender", "midfielder", "forward"),
  decade: fc.constantFrom(1990, 2000, 2010, 2020),
  caps: fc.integer({ min: 0, max: 140 }),
  capsFromBand: fc.boolean(),
  goalsPerCap: fc.double({ min: 0, max: 2, noNaN: true }),
  goalsDoubt: fc.boolean(),
  apps: fc.option(fc.integer({ min: 0, max: 500 }), { nil: null }),
  historyDoubt: fc.boolean(),
  titles: fc.record({ league: fc.nat(15), cup: fc.nat(10), caf: fc.nat(6) }),
  afcon2004: fc.boolean(),
}) as fc.Arbitrary<RatingInputs>;

describe("rate", () => {
  it("is an integer from 60 to 99", () =>
    fc.assert(
      fc.property(inputs, (i) => {
        const r = rate(i);
        expect(Number.isInteger(r) && r >= 60 && r <= 99).toBe(true);
      }),
    ));
  it("never falls when caps, apps or titles rise", () =>
    fc.assert(
      fc.property(inputs, fc.nat(50), (i, more) => {
        expect(rate({ ...i, caps: i.caps + more })).toBeGreaterThanOrEqual(
          rate(i),
        );
        expect(
          rate({ ...i, apps: (i.apps ?? 0) + more }),
        ).toBeGreaterThanOrEqual(rate({ ...i, apps: i.apps ?? 0 }));
        expect(
          rate({
            ...i,
            titles: { ...i.titles, league: i.titles.league + more },
          }),
        ).toBeGreaterThanOrEqual(rate(i));
      }),
    ));
  it("a goalkeeper's goals do not count", () =>
    expect(rate({ ...base, line: "goalkeeper", goalsPerCap: 0 })).toBe(
      rate({ ...base, line: "goalkeeper", goalsPerCap: 1 }),
    ));
  it("a forward's goals count more than a defender's", () => {
    const gain = (line: RatingInputs["line"]) =>
      rate({ ...base, line, goalsPerCap: 0.6 }) -
      rate({ ...base, line, goalsPerCap: 0 });
    expect(gain("forward")).toBeGreaterThan(gain("defender"));
  });
  it("nobody with nothing rates above 60; a full career reaches 95 or more", () => {
    expect(
      rate({
        ...base,
        caps: 0,
        goalsPerCap: 0,
        apps: 0,
        titles: { league: 0, cup: 0, caf: 0 },
      }),
    ).toBe(60);
    expect(
      rate({
        ...base,
        caps: 100,
        goalsPerCap: 0.5,
        apps: 250,
        titles: { league: 5, cup: 2, caf: 2 },
      }),
    ).toBeGreaterThanOrEqual(95);
  });
  it("the band midpoints are the D-S2-13 bands", () =>
    expect(RATING.bandCaps).toEqual([0, 5, 20, 45, 75]));
});
