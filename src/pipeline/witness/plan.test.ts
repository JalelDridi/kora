import { describe, expect, it } from "vitest";
import { describePlan, tmLeaguePath, tmSeason } from "./plan.ts";

const base = {
  mode: { kind: "weekly" as const },
  year: 2026,
  season: 2026,
  sites: ["transfermarkt" as const, "national-football-teams" as const],
  privateDir: "/w",
  mapping: null,
};

describe("the dry-run plan lists the unmapped clubs (fix round 1)", () => {
  it("names each Ligue 1 club with no Transfermarkt id and counts its footballers left unjudged", () => {
    const lines = describePlan({
      ...base,
      unmappedClubs: [
        { name: "Club A", footballers: 3 },
        { name: "Club B", footballers: 1 },
      ],
    });
    expect(lines).toContain(
      "Ligue 1 clubs without a Transfermarkt id in the last mapping, so no club verdict for their 4 footballers: Club A (3), Club B (1)",
    );
    expect(describePlan({ ...base, unmappedClubs: [] })).toContain(
      "Ligue 1 clubs without a Transfermarkt id in the last mapping: none",
    );
    expect(describePlan({ ...base, unmappedClubs: null })).toContain(
      "Ligue 1 clubs without a Transfermarkt id: unknown until the Wikidata query",
    );
  });
});

describe("the backfill plan counts the guessed links (fix round 2)", () => {
  it("says how many pages have the exact link and how many need a guess", () => {
    const backfill = { ...base, mode: { kind: "backfill" as const, pages: 5 } };
    expect(
      describePlan({ ...backfill, backfillPaths: { known: 30, guessed: 4 } }),
    ).toContain(
      "backfill links: 30 player pages not read yet have the exact link a country page gave; 4 would need a guessed name (UNVERIFIED form)",
    );
    expect(describePlan({ ...backfill, backfillPaths: null })).toContain(
      "backfill links: unknown until the Wikidata query",
    );
    // Not a backfill: no such line.
    expect(
      describePlan({ ...base, backfillPaths: { known: 1, guessed: 1 } }).some(
        (l) => l.startsWith("backfill links"),
      ),
    ).toBe(false);
  });
});

describe("Transfermarkt's season (squad-lists review, L3)", () => {
  it("runs from July to June and is named by its first year", () => {
    expect(tmSeason("2026-10-05")).toBe(2026);
    expect(tmSeason("2027-06-30")).toBe(2026);
    expect(tmSeason("2027-07-01")).toBe(2027);
    expect(tmLeaguePath(tmSeason("2027-08-15"))).toBe(
      "/ligue-professionnelle-1/startseite/wettbewerb/TUN1/saison_id/2027",
    );
  });

  it("the dry run plans the season it is given", () => {
    const lines = describePlan({ ...base, season: 2027 }).join("\n");
    expect(lines).toContain("/TUN1/saison_id/2027");
    expect(lines).toContain("/saison_id/2027 (each Ligue 1 club)");
    expect(lines).not.toContain("saison_id/2026");
  });
});
