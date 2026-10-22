import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FORMATION } from "./draft.ts";
import { boardScore, simulateSeason } from "./simulate.ts";
import type { RatedSlot, Season } from "./simulate.ts";
import type { Opponent } from "./types.ts";

// The 16 Ligue 1 strengths of data/curated/ligue1-strength.json, inlined so
// this file stays pure.
const table: Opponent[] = Object.entries({
  "as-marsa": 66,
  "ca-bizertine": 70,
  "club-africain": 77,
  "cs-hammam-lif": 65,
  "cs-sfaxien": 77,
  "es-hammam-sousse": 65,
  "es-zarzis": 66,
  "esperance-sportive-de-tunis": 82,
  "etoile-sportive-de-metlaoui": 66,
  "etoile-sportive-du-sahel": 78,
  "jeunesse-sportive-d-el-omrane": 63,
  "olympique-beja": 68,
  "ps-sakiet-eddaier": 62,
  "stade-tunisien": 72,
  "us-ben-guerdane": 70,
  "us-monastir": 74,
}).map(([clubId, strength]) => ({ clubId, strength }));

const xiArb = fc
  .tuple(
    fc.array(fc.constantFrom(...table.map((o) => o.clubId)), {
      minLength: 11,
      maxLength: 11,
    }),
    fc.array(fc.integer({ min: 60, max: 99 }), {
      minLength: 11,
      maxLength: 11,
    }),
  )
  .map(([clubs, ratings]) =>
    FORMATION.map((line, i): RatedSlot => ({
      code: `p${i}_0`,
      line,
      clubId: clubs[i],
      rating: ratings[i],
    })),
  );
const dayArb = fc
  .date({ min: new Date("2026-01-01"), max: new Date("2030-12-31") })
  .map((d) => d.toISOString().slice(0, 10));
const day = "2026-10-07";

describe("simulateSeason", () => {
  it("the same day and squad give the same season", () =>
    fc.assert(
      // A block body: Vitest's toEqual returns a value fast-check reads as false.
      fc.property(xiArb, dayArb, (xi, day) => {
        expect(simulateSeason({ day, xi, table })).toEqual(
          simulateSeason({ day, xi, table }),
        );
      }),
    ));

  it("order within a line does not matter", () =>
    fc.assert(
      fc.property(xiArb, dayArb, (xi, day) => {
        const swapped = [xi[0], xi[2], xi[1], ...xi.slice(3)]; // two defenders
        expect(simulateSeason({ day, xi: swapped, table })).toEqual(
          simulateSeason({ day, xi, table }),
        );
      }),
    ));

  it("30 matches, each opponent once at home and once away, never the replaced club", () =>
    fc.assert(
      fc.property(xiArb, dayArb, (xi, day) => {
        const s = simulateSeason({ day, xi, table });
        expect(s.matches).toHaveLength(30);
        expect(s.w + s.d + s.l).toBe(30);
        expect(s.points).toBe(3 * s.w + s.d);
        expect(s.gf).toBe(s.matches.reduce((n, m) => n + m.for, 0));
        for (const m of s.matches)
          expect(
            m.for >= 0 && m.for <= 9 && m.against >= 0 && m.against <= 9,
          ).toBe(true);
        const legs = new Map<string, boolean[]>();
        for (const m of s.matches)
          legs.set(m.opponent, [...(legs.get(m.opponent) ?? []), m.home]);
        expect(legs.size).toBe(15);
        expect(legs.has(s.replaces)).toBe(false);
        for (const homes of legs.values())
          expect(homes.sort()).toEqual([false, true]);
      }),
    ));

  it("a better side never does worse on the same seed (monotonic)", () =>
    fc.assert(
      fc.property(
        xiArb,
        dayArb,
        fc.integer({ min: 1, max: 20 }),
        (xi, day, plus) => {
          const better = xi.map((s) => ({
            ...s,
            rating: Math.min(99, s.rating + plus),
          }));
          const a = simulateSeason({ day, xi, table }),
            b = simulateSeason({ day, xi: better, table });
          a.matches.forEach((m, i) => {
            expect(b.matches[i].for).toBeGreaterThanOrEqual(m.for);
            expect(b.matches[i].against).toBeLessThanOrEqual(m.against);
          });
          expect(b.points).toBeGreaterThanOrEqual(a.points);
        },
      ),
    ));

  it("the side replaces the club that gave it most footballers; a tie goes to the club id that sorts first", () => {
    const clubs = (ids: string[]) =>
      FORMATION.map((line, i) => ({
        code: `p${i}_0`,
        line,
        clubId: ids[i],
        rating: 80,
      }));
    const est = "esperance-sportive-de-tunis",
      ca = "club-africain",
      css = "cs-sfaxien";
    expect(
      simulateSeason({
        day,
        xi: clubs([ca, est, est, est, ca, ca, css, css, css, css, est]),
        table,
      }).replaces,
    ).toBe(css); // 4 EST, 4 CSS, 3 CA: "cs-sfaxien" sorts first
    expect(
      simulateSeason({
        day,
        xi: clubs([css, ca, ca, ca, ca, ca, est, est, est, est, est]),
        table,
      }).replaces,
    ).toBe(ca); // 5 CA, 5 EST: "club-africain" sorts first
  });

  it("boardScore orders by points, then goal difference, then goals scored", () => {
    const s = (points: number, gf: number, ga: number) =>
      ({ points, gf, ga }) as Season;
    expect(boardScore(s(80, 50, 10))).toBeGreaterThan(boardScore(s(79, 90, 0)));
    expect(boardScore(s(80, 50, 10))).toBeGreaterThan(
      boardScore(s(80, 49, 10)),
    );
    expect(boardScore(s(80, 60, 20))).toBeGreaterThan(boardScore(s(80, 40, 0)));
  });
});
