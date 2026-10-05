import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SAMPLE_PAGES } from "./plan.ts";
import { witnessDir } from "./safety.ts";
import { parseLeague, parseProfile, parseSquad } from "./transfermarkt.ts";

const fixture = (name: string) =>
  readFileSync(path.join(import.meta.dirname, "__fixtures__", name), "utf8");

describe("Transfermarkt pages (synthetic fixtures, S28)", () => {
  it("follows only the exact path shapes (fix round 1)", () => {
    const row = (href: string) =>
      `<table class="items"><tbody><tr class="odd"><td class="hauptlink"><a href="${href}">Name</a></td><td>Mar 3, 1999 (27)</td></tr></tbody></table>`;
    for (const odd of [
      "//other.host/x/profil/spieler/1",
      "https://other.host/x/profil/spieler/1",
      "/x/profil/spieler/1/../../../y",
      "/x/profil/spieler/1?next=//other.host",
      "/X/profil/spieler/1",
    ])
      expect(parseSquad(row(odd)), odd).toEqual([]);
    expect(parseSquad(row("/ali-invente/profil/spieler/1"))).toHaveLength(1);
    const league = (href: string) =>
      `<table class="items"><tbody><tr class="odd"><td class="hauptlink"><a title="C" href="${href}">C</a></td></tr></tbody></table>`;
    for (const odd of [
      "//other.host/startseite/verein/1/saison_id/2026",
      "/c/startseite/verein/1/saison_id/2026/../x",
      "https://x/c/startseite/verein/1/saison_id/2026",
    ])
      expect(parseLeague(league(odd)), odd).toEqual([]);
  });

  it("league page gives 16 club ids and squad URLs", () => {
    const clubs = parseLeague(fixture("tm-league.html"));
    expect(clubs).toHaveLength(16);
    expect(clubs[0]).toEqual({
      id: "90001",
      slug: "invented-fc",
      name: "Invented FC",
      squadPath: "/invented-fc/kader/verein/90001/saison_id/2026",
    });
    expect(new Set(clubs.map((c) => c.id)).size).toBe(16);
    // The hidden "keys" list and a later table are not read.
    expect(clubs.some((c) => c.id === "99999")).toBe(false);
  });

  it("squad page gives player ids, names, birth dates (UNVERIFIED until the sample run)", () => {
    expect(parseSquad(fixture("tm-squad.html"))).toEqual([
      {
        id: "700001",
        path: "/ali-invente/profil/spieler/700001",
        name: "Ali Inventé",
        birthDate: "1999-03-03",
        loan: false,
      },
      {
        id: "700002",
        path: "/sami-exemple/profil/spieler/700002",
        name: "Sami Exemple",
        birthDate: "2002-11-21",
        loan: true,
      },
      {
        id: "700003",
        path: "/karim-fictif/profil/spieler/700003",
        name: "Karim Fictif",
        birthDate: "1997-07-14",
        loan: false,
      },
    ]);
  });

  it("a player profile gives his id, name, birth date and club (UNVERIFIED until the sample run)", () => {
    expect(parseProfile(fixture("tm-profile.html"))).toEqual({
      id: "700001",
      name: "Ali Inventé",
      birthDate: "1999-03-03",
      clubId: "90001",
    });
  });

  it("an empty or foreign page gives nothing, never a guess", () => {
    expect(parseLeague("<html></html>")).toEqual([]);
    expect(parseSquad("<html>Just text</html>")).toEqual([]);
    expect(parseProfile("<html></html>")).toEqual({
      id: null,
      name: null,
      birthDate: null,
      clubId: null,
    });
  });
});

// B5: the pages the sample run saved on Jalel's PC, when they exist. Only
// shapes are checked, so a failure names no value of theirs in a commit.
const pages = path.join(
  witnessDir(process.env, homedir()),
  "pages",
  "transfermarkt",
);
const saved = (name: string) => path.join(pages, `${name}.html`);
const hasSample = existsSync(saved(SAMPLE_PAGES.transfermarkt.squad));

describe("local real pages (the private sample, when present)", () => {
  it.skipIf(!hasSample)(
    "the saved squad page parses into players with ids and birth dates",
    () => {
      const players = parseSquad(
        readFileSync(saved(SAMPLE_PAGES.transfermarkt.squad), "utf8"),
      );
      expect(players.length).toBeGreaterThan(15);
      expect(players.every((p) => /^\d+$/.test(p.id))).toBe(true);
      expect(
        players.filter((p) => p.birthDate !== null).length,
      ).toBeGreaterThan(15);
    },
  );

  it.skipIf(!existsSync(saved(SAMPLE_PAGES.transfermarkt.profile)))(
    "the saved profile parses its id and club",
    () => {
      const profile = parseProfile(
        readFileSync(saved(SAMPLE_PAGES.transfermarkt.profile), "utf8"),
      );
      expect(profile.id).toMatch(/^\d+$/);
      expect(profile.clubId).toMatch(/^\d+$/);
    },
  );
});
