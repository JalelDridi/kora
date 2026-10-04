import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  latestPlayed,
  parseCsvLine,
  playedAfter,
  tunisiaMatches,
} from "./results.ts";

const csv = [
  "date,home_team,away_team,home_score,away_score,tournament,city,country,neutral",
  "2026-06-10,Tunisia,Mali,2,1,Friendly,Tunis,Tunisia,FALSE",
  '2026-06-14,France,Tunisia,1,1,FIFA World Cup,"Washington, D.C.",United States,TRUE',
  "2026-06-20,Brazil,Spain,0,0,Friendly,Madrid,Spain,FALSE",
  "2026-11-15,Tunisia,Egypt,NA,NA,Africa Cup of Nations qualification,Rades,Tunisia,FALSE",
].join("\n");

describe("tunisiaMatches", () => {
  it("keeps Tunisia's matches, quoted cities included, and future ones without scores", () => {
    expect(tunisiaMatches(csv)).toEqual([
      {
        date: "2026-06-10",
        home: "Tunisia",
        away: "Mali",
        homeScore: 2,
        awayScore: 1,
        tournament: "Friendly",
      },
      {
        date: "2026-06-14",
        home: "France",
        away: "Tunisia",
        homeScore: 1,
        awayScore: 1,
        tournament: "FIFA World Cup",
      },
      {
        date: "2026-11-15",
        home: "Tunisia",
        away: "Egypt",
        homeScore: null,
        awayScore: null,
        tournament: "Africa Cup of Nations qualification",
      },
    ]);
  });

  it("counts played matches after a date, and finds the latest", () => {
    const matches = tunisiaMatches(csv);
    expect(playedAfter(matches, "2026-06-10")).toBe(1);
    expect(playedAfter(matches, "2026-01-01")).toBe(2);
    expect(latestPlayed(matches)).toBe("2026-06-14");
  });

  it("refuses a file whose columns changed", () => {
    expect(() => tunisiaMatches("date,home,away\n2026-01-01,A,B")).toThrow(
      /home_team/,
    );
  });

  it("reads the recorded sample", () => {
    const matches = tunisiaMatches(
      readFileSync("src/pipeline/__fixtures__/results-sample.csv", "utf8"),
    );
    expect(matches.length).toBeGreaterThanOrEqual(40);
    expect(
      matches.every((m) => m.home === "Tunisia" || m.away === "Tunisia"),
    ).toBe(true);
  });
});

describe("parseCsvLine", () => {
  it("handles quotes and doubled quotes", () => {
    expect(parseCsvLine('a,"b, c","d ""e"""')).toEqual(["a", "b, c", 'd "e"']);
  });
});
