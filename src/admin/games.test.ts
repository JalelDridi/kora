import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSeasonData, spinSummary } from "@/engine/season/data.ts";
import type { SeasonFiles } from "@/engine/season/data.ts";
import { footballer } from "@/pipeline/__fixtures__/calendar-pool.ts";
import type { Pool, PoolPlayer } from "@/pipeline/types.ts";
import {
  chkounView,
  parseGameQuery,
  seasonView,
  showRows,
  sortClubs,
  sortRows,
} from "./games";

// What each game makes of the pool (Task 5): the build's own values,
// counted and listed, nothing recomputed.

const buildDay = "2026-11-03";

function pool(players: PoolPlayer[]): Pool {
  return {
    version: 1,
    players,
    clubs: [
      {
        id: "cs-sfaxien",
        wikidataId: "Q11",
        nameLatin: "CS Sfaxien",
        nameArabic: null,
        nameFrench: null,
        country: "TN",
        confederation: "CAF",
        leagueWikidataId: null,
        ligue1: true,
      },
    ],
    honours: [],
    flags: [],
    dropped: [],
  };
}

const withClub = (p: PoolPlayer): PoolPlayer => ({
  ...p,
  clubId: "cs-sfaxien",
});
const unmeasured = (p: PoolPlayer): PoolPlayer => ({ ...p, fame: null });
const graceTill = (p: PoolPlayer, until: string): PoolPlayer => ({
  ...p,
  pools: { active: false, legend: false, graceUntil: until },
});
const legend = (p: PoolPlayer): PoolPlayer => ({
  ...p,
  pools: { active: false, legend: true },
  fame: null,
});

const small = pool([
  withClub(footballer("games-a", "A")),
  footballer("games-b", "B"),
  footballer("games-c", "C"),
  footballer("games-d", "D"),
  unmeasured(footballer("games-unmeasured", "C")),
  // Low caps: one field from answer-ready.
  footballer("games-away", "B", false),
  // Out of the active pool, still guessable until the 20th.
  graceTill(footballer("games-grace", "B"), "2026-11-20"),
  // His grace has passed: neither guessable nor counted.
  graceTill(footballer("games-gone", "B"), "2026-11-01"),
  legend(footballer("games-legend", "A")),
]);

describe("chkounView", () => {
  const view = chkounView(small, buildDay);
  const row = (id: string) => view.rows.find((r) => r.id === id);

  it("counts the active pool, and the tiers add up to it", () => {
    expect(view.counts.active).toBe(6);
    expect(view.counts.tiers).toEqual({
      A: 1,
      B: 2,
      C: 1,
      D: 1,
      unmeasured: 1,
    });
    const sum = Object.values(view.counts.tiers).reduce((a, b) => a + b, 0);
    expect(sum).toBe(view.counts.active);
  });

  it("counts a grace footballer once in grace and never as answer-ready", () => {
    expect(view.counts.grace).toBe(1);
    expect(row("games-grace")).toMatchObject({
      ready: false,
      graceUntil: "2026-11-20",
    });
    expect(view.counts.answerReady).toBe(5);
    expect(view.rows.filter((r) => r.ready)).toHaveLength(5);
    expect(row("games-gone")).toBeUndefined();
    expect(row("games-legend")).toBeUndefined();
    // Without a build day the date alone keeps him (graceInEffect's rule).
    expect(chkounView(small, "").counts.grace).toBe(2);
  });

  it("gives each row the build's values, and the field a one-field-away row lacks", () => {
    expect(row("games-a")).toMatchObject({
      qid: small.players[0].wikidataId,
      name: "games-a",
      club: "CS Sfaxien",
      tier: "A",
      fame: 5.5,
      ready: true,
      away: null,
      localStar: false,
    });
    expect(row("games-b")?.club).toBeNull();
    expect(row("games-away")).toMatchObject({ ready: false, away: "caps" });
    // Answer-ready, but no tier the calendar draws from: fame is the field.
    expect(row("games-d")).toMatchObject({ ready: true, away: "fame" });
    expect(row("games-unmeasured")).toMatchObject({
      ready: true,
      tier: "unmeasured",
      fame: null,
      away: "fame",
    });
    expect(view.counts.oneFieldAway).toBe(3);
  });

  it("filters by ?show= and sorts by ?sort=", () => {
    const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
    expect(ids(showRows(view.rows, "ready"))).toHaveLength(5);
    expect(ids(showRows(view.rows, "away"))).toEqual([
      "games-away",
      "games-d",
      "games-unmeasured",
    ]);
    expect(ids(showRows(view.rows, "grace"))).toEqual(["games-grace"]);
    expect(ids(showRows(view.rows, "tier-B"))).toEqual([
      "games-away",
      "games-b",
    ]);
    expect(ids(showRows(view.rows, "tier-unmeasured"))).toEqual([
      "games-unmeasured",
    ]);
    expect(showRows(view.rows, null)).toHaveLength(view.rows.length);
    // Fame best first, the unmeasured last; names A to Z.
    expect(ids(sortRows(view.rows, "fame")).at(0)).toBe("games-a");
    expect(ids(sortRows(view.rows, "fame")).at(-1)).toBe("games-unmeasured");
    expect(ids(sortRows(view.rows, "name"))).toEqual(
      [...ids(view.rows)].sort(),
    );
    expect(sortRows(view.rows, "tier").map((r) => r.tier)).toEqual([
      "A",
      "B",
      "B",
      "B",
      "C",
      "D",
      "unmeasured",
    ]);
  });

  it("reads the query: anything unknown is the default", () => {
    expect(parseGameQuery({ show: "tier-A", sort: "fame", page: "2" })).toEqual(
      { show: "tier-A", sort: "fame", page: 2 },
    );
    expect(
      parseGameQuery({ show: "tier-Z", sort: "__proto__", page: "-1" }),
    ).toEqual({ show: null, sort: null, page: 1 });
  });
});

describe("seasonView on the committed files", () => {
  const read = <T>(file: string) =>
    JSON.parse(readFileSync(`data/${file}`, "utf8")) as T;
  const committed = read<Pool>("pool.json");
  const data = buildSeasonData(
    committed,
    {
      strength: read<SeasonFiles["strength"]>("curated/ligue1-strength.json"),
      afcon: read<SeasonFiles["afcon"]>("curated/afcon-2004.json"),
    },
    2026,
  );
  const view = seasonView(data);

  it("lists every Ligue 1 club with its name and strength", () => {
    const ligue1 = committed.clubs.filter((c) => c.ligue1);
    expect(view.clubs.map((c) => c.clubId).sort()).toEqual(
      ligue1.map((c) => c.id).sort(),
    );
    for (const club of view.clubs) {
      expect(club.name).toBe(
        ligue1.find((c) => c.id === club.clubId)?.nameLatin,
      );
      expect(club.decades.map((d) => d.decade)).toEqual([
        1990, 2000, 2010, 2020,
      ]);
    }
    const strength = data.table.find((o) => o.clubId === view.clubs[0].clubId);
    expect(view.clubs[0].strength).toBe(strength?.strength ?? null);
  });

  it("puts each decade's candidates best first, with the counts per line as data", () => {
    let seen = 0;
    for (const club of view.clubs)
      for (const decade of club.decades) {
        const ratings = decade.candidates.map((c) => c.rating);
        expect(ratings).toEqual([...ratings].sort((a, b) => b - a));
        const total = Object.values(decade.lines).reduce((a, b) => a + b, 0);
        expect(total).toBe(decade.candidates.length);
        for (const c of decade.candidates) {
          expect(c.name).toBe(data.people.get(c.footballerId)?.nameLatin);
          seen++;
        }
      }
    expect(seen).toBeGreaterThan(0);
  });

  it("has the open triples spinSummary reports", () => {
    const last = spinSummary(data).at(-1)!;
    const [, open, total] = /^(\d+) of (\d+) triples/.exec(last)!;
    expect(view.openTriples).toBe(Number(open));
    expect(view.total).toBe(Number(total));
    expect(view.clubs.reduce((sum, c) => sum + c.open, 0)).toBe(
      view.openTriples,
    );
  });

  it("sorts the clubs by name, strength or open triples", () => {
    const by = (key: "name" | "strength" | "open" | null) =>
      sortClubs(view.clubs, key);
    expect(by("name").map((c) => c.name)).toEqual(
      [...view.clubs.map((c) => c.name)].sort((a, b) => a.localeCompare(b)),
    );
    const strengths = by("strength").map((c) => c.strength ?? -1);
    expect(strengths).toEqual([...strengths].sort((a, b) => b - a));
    const open = by("open").map((c) => c.open);
    expect(open).toEqual([...open].sort((a, b) => b - a));
    expect(by(null)).toEqual(by("name"));
  });
});
