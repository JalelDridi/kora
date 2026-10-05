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
