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

  it("player page gives his A matches, FIFA plus non-FIFA, from the chart data, and the career table agrees", () => {
    // Chart: "fifa" 21 + "nonfifa" 2. Table, Tunisia A rows only: FIFA
    // 7 + 14, non-FIFA 0 + 2; the U23 row and the footer are not counted.
    expect(parsePlayerPage(fixture("nft-player.html"))).toEqual({
      careerA: 23,
      careerFifa: 21,
      chartFifa: 21,
      chartNonFifa: 2,
      tableFifa: 21,
      tableNonFifa: 2,
      latestMatch: "2026-09-20",
    });
  });

  it("falls back to the career table without the chart block, and gives null with neither", () => {
    const html = fixture("nft-player.html");
    const noChart = html.replace(/<script[\s\S]*?<\/script>/, "");
    expect(parsePlayerPage(noChart)).toMatchObject({
      careerA: 23,
      careerFifa: 21,
      chartFifa: null,
      chartNonFifa: null,
      tableFifa: 21,
      tableNonFifa: 2,
    });
    const noTable = html.replace(/<table[\s\S]*<\/table>/, "");
    expect(parsePlayerPage(noTable)).toEqual({
      careerA: 23,
      careerFifa: 21,
      chartFifa: 21,
      chartNonFifa: 2,
      tableFifa: null,
      tableNonFifa: null,
      latestMatch: null,
    });
    const neither = noChart.replace(/<table[\s\S]*<\/table>/, "");
    expect(parsePlayerPage(neither)).toEqual({
      careerA: null,
      careerFifa: null,
      chartFifa: null,
      chartNonFifa: null,
      tableFifa: null,
      tableNonFifa: null,
      latestMatch: null,
    });
    // Youth rows only: no senior count from the table.
    expect(
      parsePlayerPage(noChart.replaceAll("Tunisia_A_M_2", "Tunisia_U20_M_2"))
        .tableFifa,
    ).toBeNull();
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
      // Both shapes are on the real page, and they agree, FIFA and non-FIFA.
      expect(page.chartFifa).not.toBeNull();
      expect(page.tableFifa).toBe(page.chartFifa);
      expect(page.tableNonFifa).toBe(page.chartNonFifa ?? 0);
      expect(page.careerA).not.toBeNull();
      expect(page.latestMatch).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    },
  );
});
