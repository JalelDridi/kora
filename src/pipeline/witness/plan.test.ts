import { describe, expect, it } from "vitest";
import { describePlan } from "./plan.ts";

const base = {
  mode: { kind: "weekly" as const },
  year: 2026,
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
