import { describe, expect, it } from "vitest";
import { buildClubIndex, mergePlayer } from "../merge.ts";
import type { MergeContext } from "../merge.ts";
import type { Infobox, WdClub, WdPlayer } from "../types.ts";
import type { SquadList } from "../wiki/squads.ts";
import { squadEvidence } from "./evidence.ts";
import type { SquadContext } from "./evidence.ts";
import type { Sighting } from "./match.ts";

// The research cases (data-sources-2b-wikipedia-squads.md §1 to §4), with
// the numbers it measured; club ids and the lists are hand-made.

const today = "2026-10-04";

const club = (qid: string, nameEn: string, titleFr: string | null = null) =>
  ({
    qid,
    nameEn,
    nameFr: null,
    nameAr: null,
    country: "TN",
    leagues: [],
    titleEn: nameEn,
    titleFr,
  }) satisfies WdClub;

const africain = club("Q2001", "Club Africain", "Club africain (football)");
const sahel = club("Q2002", "Étoile Sportive du Sahel");
const benGuerdane = club("Q2003", "US Ben Guerdane");
const omrane = club("Q2004", "JS El Omrane");
const sfaxien = club("Q2005", "CS Sfaxien");
const esperance = club(
  "Q2006",
  "Espérance Sportive de Tunis",
  "Espérance sportive de Tunis (football)",
);
const index = buildClubIndex(
  [africain, sahel, benGuerdane, omrane, sfaxien, esperance],
  { en: new Map(), fr: new Map() },
  {},
);

const list = (
  lang: "en" | "fr",
  page: string,
  over: Partial<SquadList> = {},
): SquadList => ({
  lang,
  page,
  kind: "club",
  date: lang === "fr" ? "2026-07-01" : "2026-09-15",
  season: lang === "fr" ? "2026-2027" : null,
  status: "current",
  rows: [],
  ...over,
});
const enAfricain = list("en", "Club Africain", { date: "2026-09-27" });
const frAfricain = list("fr", "Club africain (football)");
const enSahel = list("en", "Étoile Sportive du Sahel");
const enOmrane = list("en", "JS El Omrane", { date: "2026-09-27" });
const frEsperance = list("fr", "Espérance sportive de Tunis (football)");
const enEsperance = list("en", "Espérance Sportive de Tunis", {
  date: null,
  status: "undated",
});
const enBizertin = list("en", "CA Bizertin", {
  date: "2025-01-13",
  status: "stale",
});
const national = list("en", "Tunisia national football team", {
  kind: "national",
  date: "2026-09-28",
});
const lists = [
  enAfricain,
  frAfricain,
  enSahel,
  enOmrane,
  frEsperance,
  enEsperance,
  enBizertin,
  national,
];

const seen = (
  qid: string,
  on: SquadList,
  over: Partial<Sighting> = {},
): Sighting => ({
  qid,
  list: on,
  part: "squad",
  asOf: on.date,
  by: "link",
  ...over,
});

function wd(qid: string, name: string): WdPlayer {
  return {
    qid,
    nameEn: name,
    nameFr: name,
    nameAr: null,
    aliases: [],
    male: true,
    birthDate: "1995-01-01",
    positions: ["defender"],
    birthPlaceQid: null,
    birthPlaceName: null,
    birthCountry: "TN",
    governorates: [],
    imageFile: null,
    titles: { en: name, fr: null, ar: null },
  };
}

function box(title: string, fields: Partial<Infobox> = {}): Infobox {
  return {
    lang: "en",
    title,
    currentClub: null,
    currentClubIsStaff: false,
    positionText: "Defender",
    spells: [],
    caps: null,
    goals: null,
    nationalOpen: true,
    nationalEnd: null,
    clubsAsOf: null,
    capsAsOf: null,
    skipped: [],
    seniorRow: false,
    birthDate: "1995-01-01",
    ...fields,
  };
}

function context(
  p: WdPlayer,
  en: Infobox,
  squads?: SquadContext,
  overrides: MergeContext["overrides"]["players"] = {},
): MergeContext {
  return {
    today,
    memberships: new Map(),
    index,
    infoboxes: { en: new Map([[p.titles.en!, en]]), fr: new Map() },
    photos: new Map(),
    tunisiaMatches: [],
    overrides: { players: overrides, clubTitles: {} },
    governorateIds: new Set(),
    ...(squads ? { squads } : {}),
  };
}

const squads = (qid: string, sightings: Sighting[]): SquadContext => ({
  sightings: new Map([[qid, sightings]]),
  lists,
});

describe("squadEvidence and the merge (P42, P47)", () => {
  it("Amri: a current list of another club is a vote and a club-squad-list-differs flag; the infobox club stays, rated low", () => {
    const amri = wd("Q101", "Abdallah Amri");
    const merged = mergePlayer(
      amri,
      context(
        amri,
        box("Abdallah Amri", {
          currentClub: "US Ben Guerdane",
          clubsAsOf: "2025-09-17",
        }),
        squads("Q101", [seen("Q101", enSahel)]),
      ),
    )!;
    expect(merged.draft.club?.qid).toBe("Q2003");
    expect(merged.draft.provenance.clubId).toMatchObject({
      source: "enwiki",
      confidence: "low",
      agreeing: ["enwiki"],
    });
    expect(merged.draft.provenance.clubId?.confidenceNote).toContain(
      "enwiki-squad Q2002 (2026-09-15) is newer",
    );
    expect(merged.flags.filter((f) => f.kind.includes("squad"))).toEqual([
      {
        kind: "club-squad-list-differs",
        detail:
          "enwiki-squad Étoile Sportive du Sahel (2026-09-15) lists him at Étoile Sportive du Sahel; chosen: US Ben Guerdane",
      },
    ]);
  });

  it("Meriah: no club in the pool, listed by Club Africain: a flag, no club", () => {
    const meriah = wd("Q102", "Yassine Meriah");
    const merged = mergePlayer(
      meriah,
      context(
        meriah,
        box("Yassine Meriah"),
        squads("Q102", [seen("Q102", frAfricain, { by: "name-birth" })]),
      ),
    )!;
    expect(merged.draft.club).toBeNull();
    expect(merged.draft.provenance.clubId).toBeUndefined();
    expect(merged.flags.filter((f) => f.kind.includes("squad"))).toEqual([
      {
        kind: "club-squad-list-differs",
        detail:
          "frwiki-squad Club africain (football) (2026-07-01) lists him at Club Africain; chosen: none",
      },
    ]);
  });

  it("Skhiri: the national table and the infobox agree: high", () => {
    const skhiri = wd("Q103", "Ellyes Skhiri");
    const merged = mergePlayer(
      skhiri,
      context(
        skhiri,
        box("Ellyes Skhiri", { caps: 85, goals: 4, capsAsOf: "2026-09-10" }),
        squads("Q103", [
          seen("Q103", national, { caps: 85, goals: 4, clubLink: "Nowhere" }),
        ]),
      ),
    )!;
    expect(merged.draft.caps).toBe(85);
    expect(merged.draft.provenance.caps).toMatchObject({
      confidence: "high",
      agreeing: ["enwiki", "enwiki-national"],
    });
  });

  it("Dahmen: the national table is newer and higher: it is chosen, medium, the infobox explained by its date", () => {
    const dahmen = wd("Q104", "Aymen Dahmen");
    const merged = mergePlayer(
      dahmen,
      context(
        dahmen,
        box("Aymen Dahmen", {
          caps: 40,
          goals: 0,
          capsAsOf: "2026-06-10",
          currentClub: "CS Sfaxien",
          clubsAsOf: "2026-08-01",
        }),
        squads("Q104", [
          seen("Q104", national, {
            caps: 41,
            goals: 0,
            clubLink: "CS Sfaxien",
          }),
        ]),
      ),
    )!;
    expect(merged.draft.caps).toBe(41);
    expect(merged.draft.capsAsOf).toBe("2026-09-28");
    expect(merged.draft.provenance.caps).toMatchObject({
      source: "enwiki-national",
      asOf: "2026-09-28",
      ref: "Tunisia national football team",
      confidence: "medium",
      agreeing: ["enwiki-national"],
      confidenceNote:
        "one fresh source; the others are explained by their dates",
    });
    // Its club column agrees with the infobox: high (S9).
    expect(merged.draft.provenance.clubId).toMatchObject({
      confidence: "high",
      agreeing: ["enwiki", "enwiki-national"],
    });
    expect(merged.flags.map((f) => f.kind)).not.toContain(
      "caps-newer-but-lower",
    );
  });

  it("Ben Hessen: the table and the infobox disagree at different dates: the existing caps flags", () => {
    const benHessen = wd("Q105", "Sabri Ben Hessen");
    const merged = mergePlayer(
      benHessen,
      context(
        benHessen,
        box("Sabri Ben Hessen", { caps: 2, goals: 0, capsAsOf: "2026-05-15" }),
        squads("Q105", [seen("Q105", national, { caps: 1, goals: 0 })]),
      ),
    )!;
    expect(merged.draft.caps).toBe(1);
    expect(merged.flags.filter((f) => f.kind.startsWith("caps"))).toEqual([
      {
        kind: "caps-newer-but-lower",
        detail: "enwiki-national 1 (2026-09-28) < enwiki 2 (2026-05-15)",
      },
    ]);
    expect(merged.draft.provenance.caps?.confidence).toBe("low");
  });

  it("Kanzari: chosen club is a Ligue 1 club with a current list, absent: club-not-on-squad-list only", () => {
    const kanzari = wd("Q106", "Maher Kanzari");
    const merged = mergePlayer(
      kanzari,
      context(
        kanzari,
        box("Maher Kanzari", {
          currentClub: "Espérance Sportive de Tunis",
          clubsAsOf: "2026-08-01",
        }),
        squads("Q106", []),
      ),
    )!;
    expect(merged.flags.filter((f) => f.kind.includes("squad"))).toEqual([
      {
        kind: "club-not-on-squad-list",
        detail:
          "frwiki-squad Espérance sportive de Tunis (football) (2026-07-01) does not list him at Espérance Sportive de Tunis",
      },
    ]);
    // Absence is no vote: the infobox alone, fresh, stays medium.
    expect(merged.draft.provenance.clubId?.confidence).toBe("medium");
  });

  it("Ben Amor 1992: link to a namesake whose twin has that club: squad-namesake, no vote", () => {
    const out = squadEvidence({
      sightings: [seen("Q107", enOmrane)],
      lists,
      chosenClub: null,
      index,
      namesakes: [{ qid: "Q108", clubQid: "Q2004" }],
    });
    expect(out.clubVotes).toEqual([]);
    expect(out.flags).toEqual([
      {
        kind: "squad-namesake",
        detail:
          "enwiki-squad JS El Omrane (2026-09-27) lists him at JS El Omrane, the club of his namesake Q108; no vote",
      },
    ]);
  });

  it("two current lists name him: squad-lists-disagree, no vote", () => {
    const out = squadEvidence({
      sightings: [seen("Q109", enAfricain), seen("Q109", enSahel)],
      lists,
      chosenClub: "Q2001",
      index,
    });
    expect(out.clubVotes).toEqual([]);
    expect(out.flags.map((f) => f.kind)).toEqual(["squad-lists-disagree"]);
    expect(out.flags[0].detail).toBe(
      "enwiki-squad Club Africain (2026-09-27): Club Africain; enwiki-squad Étoile Sportive du Sahel (2026-09-15): Étoile Sportive du Sahel; no vote",
    );
  });

  it("an English and a French list of the same club are two votes", () => {
    const out = squadEvidence({
      sightings: [seen("Q110", enAfricain), seen("Q110", frAfricain)],
      lists,
      chosenClub: "Q2001",
      index,
    });
    expect(out.clubVotes).toEqual([
      { source: "enwiki-squad", value: "Q2001", asOf: "2026-09-27" },
      { source: "frwiki-squad", value: "Q2001", asOf: "2026-07-01" },
    ]);
    expect(out.flags).toEqual([]);
  });

  it("stale and undated lists give no vote", () => {
    const out = squadEvidence({
      sightings: [seen("Q111", enBizertin), seen("Q111", enEsperance)],
      lists,
      chosenClub: "Q2003",
      index,
    });
    expect(out).toEqual({ clubVotes: [], capsCandidates: [], flags: [] });
  });

  it("a loan or under-contract row gives no vote", () => {
    const out = squadEvidence({
      sightings: [
        seen("Q112", enAfricain, { part: "loan" }),
        seen("Q112", enSahel, { part: "other" }),
      ],
      lists,
      chosenClub: "Q2001",
      index,
    });
    expect(out.clubVotes).toEqual([]);
    // On his club's list, if only as a loan: not absent either.
    expect(out.flags).toEqual([]);
  });

  it("an override still wins and is still high", () => {
    const amri = wd("Q113", "Abdallah Amri");
    const merged = mergePlayer(
      amri,
      context(
        amri,
        box("Abdallah Amri", {
          currentClub: "US Ben Guerdane",
          clubsAsOf: "2025-09-17",
        }),
        squads("Q113", [seen("Q113", enSahel)]),
        { Q113: { club: { value: "Q2005", by: "jalel", at: "2026-10-05" } } },
      ),
    )!;
    expect(merged.draft.club?.qid).toBe("Q2005");
    expect(merged.draft.provenance.clubId).toMatchObject({
      source: "override",
      confidence: "high",
      agreeing: ["override"],
    });
  });

  it("a squad vote's ref is the article title", () => {
    const out = squadEvidence({
      sightings: [seen("Q114", national, { caps: 7, goals: 1 })],
      lists,
      chosenClub: null,
      index,
    });
    expect(out.capsCandidates).toEqual([
      {
        source: "enwiki-national",
        asOf: "2026-09-28",
        caps: 7,
        goals: 1,
        ref: "Tunisia national football team",
      },
    ]);
  });

  it("without squads the merge is exactly what it was", () => {
    const amri = wd("Q115", "Abdallah Amri");
    const en = box("Abdallah Amri", {
      currentClub: "US Ben Guerdane",
      clubsAsOf: "2025-09-17",
      caps: 3,
      goals: 0,
      capsAsOf: "2025-09-17",
    });
    const without = mergePlayer(amri, context(amri, en));
    expect(
      JSON.stringify(
        mergePlayer(
          amri,
          context(amri, en, { sightings: new Map(), lists: [] }),
        ),
      ),
    ).toBe(JSON.stringify(without));
  });
});
