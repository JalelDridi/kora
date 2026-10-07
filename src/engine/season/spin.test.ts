import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildSeasonData } from "./data.ts";
import { spin } from "./spin.ts";
import type { SeasonSource, SourcePlayer } from "./types.ts";

const sure = { confidence: "high" as const };
const forward = (id: string, clubId: string, from: number, to: number) =>
  ({
    id,
    wikidataId: `Q${id.charCodeAt(0)}${id.slice(1)}`,
    nameLatin: id.toUpperCase(),
    nameArabic: null,
    nameFrench: null,
    position: "forward",
    caps: 20,
    goals: 5,
    history: [{ clubId, from, to, apps: 30, loan: false }],
    provenance: { caps: sure, goals: sure, history: sure },
  }) satisfies SourcePlayer;
const club = (id: string) => ({
  id,
  ligue1: true,
  nameLatin: id,
  nameArabic: null,
  nameFrench: null,
});

// spinData: Ligue 1 clubs club-a, club-b, club-c; forwards a1..a6 at club-a in the 2010s, c1 at club-c in the 2000s; no goalkeeper.
const source: SeasonSource = {
  clubs: [club("club-a"), club("club-b"), club("club-c")],
  honours: [],
  players: [
    ...[1, 2, 3, 4, 5, 6].map((n) => forward(`a${n}`, "club-a", 2011, 2015)),
    forward("c1", "club-c", 2001, 2005),
  ],
};
const spinData = buildSeasonData(
  source,
  {
    strength: { clubs: { "club-a": 70, "club-b": 60, "club-c": 65 } },
    afcon: { footballers: [] },
  },
  2026,
);

const data = spinData;
const seq = (xs: number[]) => {
  let i = 0;
  return () => xs[Math.min(i++, xs.length - 1)];
};
const rands = fc
  .array(fc.double({ min: 0, max: 0.999999, noNaN: true }), {
    minLength: 64,
    maxLength: 64,
  })
  .map((xs) => {
    let i = 0;
    return () => xs[i++ % xs.length];
  });

describe("spin", () => {
  it("level 1 when the spun club and decade have a footballer left", () => {
    const s = spin({
      data,
      line: "forward",
      taken: new Set(),
      rand: seq([0, 0.6, 0]),
    }); // club-a, 2010s
    expect(s).toMatchObject({ clubId: "club-a", decade: 2010, level: 1 });
  });
  it("an empty triple widens to the same club in another decade", () => {
    expect(
      spin({ data, line: "forward", taken: new Set(), rand: seq([0, 0, 0]) }),
    ).toMatchObject({ clubId: "club-a", level: 2 });
  });
  it("a club with nobody widens to any club in the same decade", () => {
    expect(
      spin({
        data,
        line: "forward",
        taken: new Set(),
        rand: seq([0.4, 0.3, 0]),
      }),
    ).toMatchObject({ clubId: "club-c", decade: 2000, level: 3 });
  });
  it("then to any triple with a footballer left", () =>
    expect(
      spin({ data, line: "forward", taken: new Set(), rand: seq([0.4, 0, 0]) })
        .level,
    ).toBe(4)); // club-b, 1990s
  it("drafted footballers never come back, and up to 5 candidates show", () =>
    fc.assert(
      fc.property(rands, (rand) => {
        const s = spin({
          data,
          line: "forward",
          taken: new Set(["a1"]),
          rand,
        });
        expect(s.candidates.length).toBeGreaterThan(0);
        expect(s.candidates.length).toBeLessThanOrEqual(5);
        expect(s.candidates.map((c) => c.footballerId)).not.toContain("a1");
        for (const c of s.candidates)
          expect([c.clubId, c.decade, c.line]).toEqual([
            s.clubId,
            s.decade,
            s.line,
          ]);
      }),
    ));
  it("a triple whose footballers are all taken widens too", () =>
    expect(
      spin({
        data,
        line: "forward",
        taken: new Set(["a1", "a2", "a3", "a4", "a5", "a6"]),
        rand: seq([0, 0.6, 0]),
      }),
    ).toMatchObject({ clubId: "club-c", decade: 2000, level: 4 }));
  it("throws only when the line has nobody left anywhere", () =>
    expect(() =>
      spin({ data, line: "goalkeeper", taken: new Set(), rand: seq([0]) }),
    ).toThrow("no goalkeeper left"));
});
