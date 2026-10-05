import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { latestFifaMatch, parseCountryPage, parsePlayerPage } from "./nft.ts";
import { SAMPLE_PAGES } from "./plan.ts";
import { witnessDir } from "./safety.ts";

const fixture = (name: string) =>
  readFileSync(path.join(import.meta.dirname, "__fixtures__", name), "utf8");

describe("national-football-teams.com pages (synthetic fixtures, S28)", () => {
  it("follows only the exact player path shape (fix round 1)", () => {
    const page = (href: string) =>
      `<table class="table player"><tbody><tr><td class="name"><a href="${href}">A, B</a></td><td class="stats matches">1</td></tr></tbody></table>`;
    for (const odd of [
      "//other.host/player/1/A.html",
      "https://other.host/player/1/A.html",
      "/player/1/../../x.html",
      "/player/1/A.html?x=//other.host",
      "/player/1/a/b.html",
    ])
      expect(parseCountryPage(page(odd)).players, odd).toEqual([]);
    expect(parseCountryPage(page("/player/1/A_B.html")).players).toHaveLength(
      1,
    );
  });

  it("country page gives player ids, birth dates, FIFA matches this year, the match dates, and the last update", () => {
    const page = parseCountryPage(fixture("nft-country.html"));
    expect(page.players).toEqual([
      {
        id: "800001",
        path: "/player/800001/Ali_Invente.html",
        name: "Inventé, Ali",
        birthDate: "1999-03-03",
        club: "Invented FC",
        fifaMatches: 7,
      },
      {
        id: "800002",
        path: "/player/800002/Sami_Exemple.html",
        name: "Exemple, Sami",
        birthDate: "2002-11-21",
        club: "Club Imaginaire",
        fifaMatches: 3,
      },
    ]);
    expect(page.matches).toEqual([
      { date: "2026-09-20", fifa: true },
      { date: "2026-09-25", fifa: false },
      { date: "2026-03-01", fifa: true },
    ]);
    // A friendly outside the FIFA count is no A match.
    expect(latestFifaMatch(page)).toBe("2026-09-20");
    expect(page.lastUpdate).toBe("2026-09-27");
  });

  it("player page gives career FIFA matches (UNVERIFIED until the sample run)", () => {
    expect(parsePlayerPage(fixture("nft-player.html"))).toEqual({
      careerFifa: 21,
    });
    // Without a total row: the sum of the year rows.
    const noTotal = fixture("nft-player.html").replace(
      /<tfoot>[\s\S]*<\/tfoot>/,
      "",
    );
    expect(parsePlayerPage(noTotal)).toEqual({ careerFifa: 21 });
    expect(parsePlayerPage("<html></html>")).toEqual({ careerFifa: null });
  });
});

// B5: the pages the sample run saved on Jalel's PC, when they exist.
const pages = path.join(
  witnessDir(process.env, homedir()),
  "pages",
  "national-football-teams",
);
const saved = (name: string) => path.join(pages, `${name}.html`);

describe("local real pages (the private sample, when present)", () => {
  it.skipIf(
    !existsSync(saved(SAMPLE_PAGES["national-football-teams"].country)),
  )(
    "the saved country page parses into players, FIFA counts and dated matches",
    () => {
      const page = parseCountryPage(
        readFileSync(
          saved(SAMPLE_PAGES["national-football-teams"].country),
          "utf8",
        ),
      );
      expect(page.players.length).toBeGreaterThan(20);
      expect(page.players.every((p) => /^\d+$/.test(p.id))).toBe(true);
      expect(page.players.every((p) => p.fifaMatches !== null)).toBe(true);
      expect(latestFifaMatch(page)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(page.lastUpdate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    },
  );

  it.skipIf(!existsSync(saved(SAMPLE_PAGES["national-football-teams"].player)))(
    "the saved player page gives a career FIFA count",
    () => {
      const page = parsePlayerPage(
        readFileSync(
          saved(SAMPLE_PAGES["national-football-teams"].player),
          "utf8",
        ),
      );
      expect(page.careerFifa).not.toBeNull();
    },
  );
});
