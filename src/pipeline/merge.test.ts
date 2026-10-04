import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildClubIndex,
  mergePlayer,
  pickBirth,
  pickCaps,
  pickClub,
  pickHistory,
  pickPosition,
  type MergeContext,
} from "./merge.ts";
import type {
  Infobox,
  Line,
  Match,
  WdClub,
  WdMembership,
  WdPlayer,
} from "./types.ts";
import { parseEnInfobox } from "./wiki/infobox-en.ts";
import { parseFrInfobox } from "./wiki/infobox-fr.ts";

const today = "2026-10-04";
const by = { by: "jalel", at: "2026-10-05" };

function club(
  qid: string,
  nameEn: string,
  country: string | null,
  extra: Partial<WdClub> = {},
): WdClub {
  return {
    qid,
    nameEn,
    nameFr: null,
    nameAr: null,
    country,
    leagues: [],
    titleEn: nameEn,
    titleFr: null,
    ...extra,
  };
}

function box(lang: "en" | "fr", fields: Partial<Infobox> = {}): Infobox {
  return {
    lang,
    title: lang === "en" ? "Yassine Meriah" : "Yassine Meriah (football)",
    currentClub: null,
    currentClubIsStaff: false,
    positionText: null,
    spells: [],
    caps: null,
    goals: null,
    nationalOpen: false,
    clubsAsOf: null,
    capsAsOf: null,
    skipped: [],
    ...fields,
  };
}

function membership(
  teamQid: string,
  start: number | null,
  end: number | null,
  extra: Partial<WdMembership> = {},
): WdMembership {
  return {
    playerQid: "Q19956607",
    teamQid,
    teamName: teamQid,
    start,
    end,
    endUnknown: false,
    apps: null,
    goals: null,
    national: false,
    ...extra,
  };
}

const burnley = club("Q1", "Burnley F.C.", "GB");
const esperance = club("Q2", "Espérance Sportive de Tunis", "TN", {
  titleFr: "Espérance sportive de Tunis",
});
const sfaxien = club("Q3", "CS Sfaxien", "TN");
const index = buildClubIndex(
  [burnley, esperance, sfaxien],
  { en: new Map([["Burnley FC", "Burnley F.C."]]), fr: new Map() },
  { "fr:EST": "Q2" },
);

describe("buildClubIndex", () => {
  it("finds clubs by title, through redirects and pinned titles", () => {
    expect(index.resolve("en", "Burnley F.C.")).toBe(burnley);
    expect(index.resolve("en", "Burnley FC")).toBe(burnley);
    expect(index.resolve("fr", "Espérance sportive de Tunis")).toBe(esperance);
    expect(index.resolve("fr", "EST")).toBe(esperance);
    expect(index.resolve("en", "Nowhere United")).toBeNull();
  });
});

describe("pickCaps (D-S1-3)", () => {
  it("takes the newer dated source and flags it when it is lower", () => {
    const { chosen, flags } = pickCaps([
      { source: "enwiki", asOf: "2025-01-10", caps: 95, goals: 4, ref: "en" },
      { source: "frwiki", asOf: "2026-09-28", caps: 93, goals: 3, ref: "fr" },
    ]);
    expect(chosen?.caps).toBe(93);
    expect(flags.map((f) => f.kind)).toEqual(["caps-newer-but-lower"]);
  });

  it("flags two sources with the same date and different numbers, preferring English", () => {
    const { chosen, flags } = pickCaps([
      { source: "frwiki", asOf: "2026-09-01", caps: 41, goals: 0, ref: "fr" },
      { source: "enwiki", asOf: "2026-09-01", caps: 40, goals: 0, ref: "en" },
    ]);
    expect(chosen?.source).toBe("enwiki");
    expect(flags.map((f) => f.kind)).toEqual(["caps-sources-disagree"]);
  });

  it("is quiet when the newer source is higher, and uses Wikidata only when alone", () => {
    expect(
      pickCaps([
        { source: "enwiki", asOf: "2026-01-01", caps: 30, goals: 1, ref: "en" },
        { source: "frwiki", asOf: "2026-09-01", caps: 33, goals: 1, ref: "fr" },
      ]).flags,
    ).toEqual([]);
    expect(
      pickCaps([
        { source: "wikidata", asOf: null, caps: 74, goals: 25, ref: "P1350" },
      ]).chosen?.caps,
    ).toBe(74);
    expect(pickCaps([]).chosen).toBeNull();
  });
});

describe("pickClub (D-S1-2)", () => {
  it("treats a staff role as no club, without falling back to Wikidata", () => {
    const pick = pickClub({
      en: box("en", { currentClubIsStaff: true }),
      fr: null,
      memberships: [membership("Q2", 2024, null)],
      index,
      today,
    });
    expect(pick.club).toBeNull();
    expect(pick.flags.map((f) => f.kind)).toEqual(["club-staff-role"]);
  });

  it("takes the infobox with the newer date and flags a disagreement", () => {
    const pick = pickClub({
      en: box("en", { currentClub: "Burnley F.C.", clubsAsOf: "2026-08-01" }),
      fr: box("fr", {
        currentClub: "Espérance sportive de Tunis",
        clubsAsOf: "2026-09-28",
      }),
      memberships: [],
      index,
      today,
    });
    expect(pick.club).toBe(esperance);
    expect(pick.provenance).toEqual({
      source: "frwiki",
      retrievedAt: today,
      asOf: "2026-09-28",
      ref: "Yassine Meriah (football)",
    });
    expect(pick.flags.map((f) => f.kind)).toEqual(["club-sources-disagree"]);
  });

  it("lets an override win and flags the source that disagrees", () => {
    const pick = pickClub({
      en: box("en", { currentClub: "Burnley F.C." }),
      fr: null,
      memberships: [],
      index,
      override: { value: "Q2", ...by },
      today,
    });
    expect(pick.club).toBe(esperance);
    expect(pick.provenance).toEqual({
      source: "override",
      retrievedAt: "2026-10-05",
      by: "jalel",
    });
    expect(pick.flags.map((f) => f.kind)).toEqual(["club-override-disagrees"]);
  });

  it("flags a club link it cannot match", () => {
    const pick = pickClub({
      en: box("en", { currentClub: "Nowhere United" }),
      fr: null,
      memberships: [],
      index,
      today,
    });
    expect(pick.club).toBeNull();
    expect(pick.flags.map((f) => f.kind)).toEqual(["club-unresolved"]);
  });

  it("uses Wikidata only without an infobox, and only for one recent open club", () => {
    const recent = pickClub({
      en: null,
      fr: null,
      memberships: [membership("Q3", 2022, null), membership("Q2", 2015, 2021)],
      index,
      today,
    });
    expect(recent.club).toBe(sfaxien);
    expect(recent.provenance?.source).toBe("wikidata");

    const stale = pickClub({
      en: null,
      fr: null,
      memberships: [membership("Q3", 2010, null)],
      index,
      today,
    });
    expect(stale.club).toBeNull();
    // Fix round 1: the ignored club leaves a trace for the reviewer.
    expect(stale.flags).toEqual([
      { kind: "wd-club-too-old", detail: "Q3 since 2010, over 8 years ago" },
    ]);

    const two = pickClub({
      en: null,
      fr: null,
      memberships: [membership("Q3", 2022, null), membership("Q2", 2023, null)],
      index,
      today,
    });
    expect(two.club).toBeNull();
    expect(two.flags.map((f) => f.kind)).toEqual(["multiple-open-clubs"]);
  });
});

describe("pickHistory", () => {
  it("takes the newer infobox's career, matching clubs and keeping unmatched names", () => {
    const { spells, provenance } = pickHistory({
      en: box("en", {
        clubsAsOf: "2026-09-01",
        spells: [
          {
            clubTitle: "CS Sfaxien",
            from: 2013,
            to: 2018,
            apps: 86,
            goals: 4,
            loan: false,
          },
          {
            clubTitle: "Olympiakos F.C.",
            from: 2018,
            to: 2019,
            apps: 5,
            goals: 0,
            loan: true,
          },
        ],
      }),
      fr: box("fr", {
        clubsAsOf: "2025-01-01",
        spells: [
          {
            clubTitle: "X",
            from: 2000,
            to: 2001,
            apps: null,
            goals: null,
            loan: false,
          },
        ],
      }),
      memberships: [],
      index,
      today,
    });
    expect(
      spells.map((s) => [s.club?.qid ?? null, s.clubName, s.loan]),
    ).toEqual([
      ["Q3", "CS Sfaxien", false],
      [null, "Olympiakos F.C.", true],
    ]);
    expect(provenance?.source).toBe("enwiki");
  });

  it("falls back to Wikidata's club statements in order", () => {
    const { spells, provenance } = pickHistory({
      en: null,
      fr: null,
      memberships: [
        membership("Q2", 2016, null),
        membership("Q27971", 2015, null, { national: true }),
        membership("Q3", 2010, 2016),
      ],
      index,
      today,
    });
    expect(spells.map((s) => s.club?.qid)).toEqual(["Q3", "Q2"]);
    expect(provenance?.source).toBe("wikidata");
  });

  // Parked note: a reserve team is written as its own label but links to the
  // main club (en/ellyes-skhiri: "Montpellier B" → [[Montpellier HSC]]).
  it("collapses a reserve team into the main club by link target", () => {
    const fixture = (lang: "en" | "fr", slug: string) =>
      readFileSync(
        `src/pipeline/wiki/__fixtures__/${lang}/${slug}.wikitext`,
        "utf8",
      );
    const montpellier = club("Q9", "Montpellier HSC", "FR");
    const { spells } = pickHistory({
      en: parseEnInfobox("Ellyes Skhiri", fixture("en", "ellyes-skhiri")),
      fr: null,
      memberships: [],
      index: buildClubIndex(
        [montpellier],
        { en: new Map(), fr: new Map() },
        {},
      ),
      today,
    });
    expect(spells.slice(0, 2).map((s) => [s.club?.qid, s.from, s.to])).toEqual([
      ["Q9", 2014, 2015],
      ["Q9", 2015, 2019],
    ]);
  });
});

// Ruling R1 (preflight, 4 October), on the recorded fr/yassine-meriah: its first
// spell "?–2013" at AS Ariana is a youth spell by the English article. The
// French infobox is dated (2026-09-27) and the English one is not, so the
// French career is the newer one.
describe("undated French spells (ruling R1)", () => {
  const fixture = (lang: "en" | "fr") =>
    readFileSync(
      `src/pipeline/wiki/__fixtures__/${lang}/yassine-meriah.wikitext`,
      "utf8",
    );
  const en = parseEnInfobox("Yassine Meriah", fixture("en"))!;
  const fr = parseFrInfobox("Yassine Meriah (football)", fixture("fr"))!;
  const ariana = "Association sportive de l'Ariana (football)";

  it("drops them beside an English career, and says so", () => {
    expect(fr.spells[0]).toMatchObject({
      clubTitle: ariana,
      from: null,
      to: 2013,
    });
    const { spells, provenance, flags } = pickHistory({
      en,
      fr,
      memberships: [],
      index,
      today,
    });
    expect(provenance).toMatchObject({ source: "frwiki", asOf: "2026-09-27" });
    expect(spells).toHaveLength(fr.spells.length - 1);
    expect(spells.map((s) => s.clubName)).not.toContain(ariana);
    expect(spells[0]).toMatchObject({
      clubName: "Étoile sportive de Métlaoui",
      from: 2013,
      to: 2015,
    });
    expect(flags).toEqual([
      {
        kind: "fr-undated-spell",
        detail: `frwiki Yassine Meriah (football): ${ariana} (?–2013)`,
      },
    ]);
  });

  it("keeps them when there is no English career", () => {
    for (const english of [null, { ...en, spells: [] }]) {
      const { spells, flags } = pickHistory({
        en: english,
        fr,
        memberships: [],
        index,
        today,
      });
      expect(spells).toHaveLength(fr.spells.length);
      expect(spells[0]).toMatchObject({ clubName: ariana, from: null });
      expect(flags).toEqual([]);
    }
  });

  // Fix round 1, finding 4: every club resolves as on the real pages, through
  // the exact link targets of en/ and fr/yassine-meriah.wikitext.
  const meriahClubs: [qid: string, titleEn: string | null, titleFr: string][] =
    [
      ["Q101", null, ariana],
      ["Q102", "ES Métlaoui", "Étoile sportive de Métlaoui"],
      ["Q103", "CS Sfaxien", "Club sportif sfaxien (football)"],
      ["Q104", "Olympiacos F.C.", "Olympiakós (football)"],
      ["Q105", "Kasımpaşa S.K.", "Kasımpaşa SK"],
      ["Q106", "Çaykur Rizespor", "Çaykur Rizespor"],
      ["Q107", "Al Ain FC", "Al-Aïn Football Club"],
      [
        "Q108",
        "Espérance Sportive de Tunis",
        "Espérance sportive de Tunis (football)",
      ],
      ["Q109", "Club Africain", "Club africain (football)"],
    ];
  const meriahIndex = buildClubIndex(
    meriahClubs.map(([qid, titleEn, titleFr]) =>
      club(qid, titleEn ?? titleFr, "TN", { titleEn, titleFr }),
    ),
    { en: new Map(), fr: new Map() },
    {},
  );
  const meriahContext = (english: Infobox): MergeContext => ({
    today,
    memberships: new Map(),
    index: meriahIndex,
    infoboxes: {
      en: new Map([["Yassine Meriah", english]]),
      fr: new Map([["Yassine Meriah (football)", fr]]),
    },
    photos: new Map(),
    tunisiaMatches: [],
    overrides: { players: {}, clubTitles: {} },
    governorateIds,
  });

  it("drops them from the merged history and its rating too", () => {
    const merged = mergePlayer(wdPlayer(), meriahContext(en));
    expect(
      merged?.draft.history.map((s) => [s.club?.qid, s.from, s.to]),
    ).toEqual([
      ["Q102", 2013, 2015],
      ["Q103", 2015, 2018],
      ["Q104", 2018, 2021],
      ["Q105", 2020, 2020],
      ["Q106", 2020, 2021],
      ["Q107", 2021, 2022],
      ["Q108", 2022, 2026],
      ["Q109", 2026, 2026],
    ]);
    expect(
      merged?.flags.filter((f) => f.kind === "fr-undated-spell"),
    ).toHaveLength(1);
    // French chosen (dated); the undated English career gives the same eight
    // clubs once AS Ariana is dropped, so both sources agree.
    expect(merged?.draft.provenance.history).toMatchObject({
      source: "frwiki",
      asOf: "2026-09-27",
      confidence: "high",
      agreeing: ["enwiki", "frwiki"],
    });
  });

  it("rates the French career alone when the English one is empty", () => {
    const merged = mergePlayer(
      wdPlayer(),
      meriahContext({ ...en, spells: [] }),
    );
    expect(merged?.draft.history[0].club?.qid).toBe("Q101");
    expect(merged?.draft.history).toHaveLength(9);
    expect(merged?.flags.map((f) => f.kind)).not.toContain("fr-undated-spell");
    expect(merged?.draft.provenance.history).toMatchObject({
      source: "frwiki",
      confidence: "medium",
      agreeing: ["frwiki"],
      confidenceNote: "one fresh source",
    });
  });
});

// Decision P35 (replaces D-S1-7): the majority of the English page, the
// French page and Wikidata gives the line; overrides beat everything.
describe("pickPosition (P35)", () => {
  const pick = (
    en: string | null,
    fr: string | null,
    wikidata: string[],
    override?: Line,
  ) =>
    pickPosition({
      qid: "Q19956607",
      wikidata,
      en: en === null ? null : box("en", { positionText: en }),
      fr: fr === null ? null : box("fr", { positionText: fr }),
      override: override && { value: override, ...by },
      today,
    });
  /** The rated position, through the merge. */
  const rated = (en: string | null, fr: string | null, wikidata: string[]) =>
    mergePlayer(wdPlayer({ positions: wikidata }), {
      today,
      memberships: new Map(),
      index,
      infoboxes: {
        en: new Map(
          en === null
            ? []
            : [["Yassine Meriah", box("en", { positionText: en })]],
        ),
        fr: new Map(
          fr === null
            ? []
            : [["Yassine Meriah (football)", box("fr", { positionText: fr })]],
        ),
      },
      photos: new Map(),
      tunisiaMatches: [],
      overrides: { players: {}, clubTitles: {} },
      governorateIds,
    });

  it("takes the two pages over Wikidata on the recorded Meriah pages, and names Wikidata", () => {
    const fixture = (lang: "en" | "fr") =>
      readFileSync(
        `src/pipeline/wiki/__fixtures__/${lang}/yassine-meriah.wikitext`,
        "utf8",
      );
    const en = parseEnInfobox("Yassine Meriah", fixture("en"))!;
    const fr = parseFrInfobox("Yassine Meriah (football)", fixture("fr"))!;
    expect([en.positionText, fr.positionText]).toEqual([
      "Centre-back",
      "Défenseur central",
    ]);
    const merged = mergePlayer(wdPlayer({ positions: ["midfielder"] }), {
      today,
      memberships: new Map(),
      index,
      infoboxes: {
        en: new Map([["Yassine Meriah", en]]),
        fr: new Map([["Yassine Meriah (football)", fr]]),
      },
      photos: new Map(),
      tunisiaMatches: [],
      overrides: { players: {}, clubTitles: {} },
      governorateIds,
    });
    expect(merged?.draft.position).toBe("defender");
    // Two of three agree: the addendum's undated rule (§1.4) gives medium,
    // not high, while Wikidata dissents.
    expect(merged?.draft.provenance.position).toMatchObject({
      source: "enwiki",
      confidence: "medium",
      agreeing: ["enwiki", "frwiki"],
    });
    expect(
      merged?.flags.filter((f) => f.kind === "position-disagrees"),
    ).toEqual([
      {
        kind: "position-disagrees",
        detail: "wikidata midfielder against enwiki, frwiki defender",
      },
    ]);
  });

  it("rates two agreeing pages high when Wikidata has no position", () => {
    expect(pick("Centre-back", "Défenseur central", []).line).toBe("defender");
    expect(
      rated("Centre-back", "Défenseur central", [])?.draft.provenance.position,
    ).toMatchObject({
      source: "enwiki",
      confidence: "high",
      agreeing: ["enwiki", "frwiki"],
    });
  });

  it("follows Wikidata's side when the pages disagree", () => {
    const p = pick("Forward", "Milieu offensif", ["midfielder"]);
    expect(p.line).toBe("midfielder");
    expect(p.provenance.position?.source).toBe("frwiki");
    expect(p.flags).toEqual([
      {
        kind: "position-disagrees",
        detail: "enwiki forward against frwiki, wikidata midfielder",
      },
    ]);
    expect(
      rated("Forward", "Milieu offensif", ["midfielder"])?.draft.provenance
        .position,
    ).toMatchObject({
      confidence: "medium",
      agreeing: ["frwiki", "wikidata"],
    });
  });

  it("takes the English page when the two pages disagree and Wikidata has no position", () => {
    const p = pick("Forward", "Milieu offensif", []);
    expect(p.line).toBe("forward");
    expect(p.provenance.position?.source).toBe("enwiki");
    expect(p.flags).toEqual([
      {
        kind: "position-disagrees",
        detail: "no majority: enwiki forward, frwiki midfielder",
      },
    ]);
    expect(
      rated("Forward", "Milieu offensif", [])?.draft.provenance.position,
    ).toMatchObject({ confidence: "low", agreeing: ["enwiki"] });
  });

  it("takes the page over Wikidata when they are the only two", () => {
    const p = pick("Centre-back", null, ["midfielder"]);
    expect(p.line).toBe("defender");
    expect(p.detail).toBe("Centre-back");
    expect(p.flags).toEqual([
      {
        kind: "position-disagrees",
        detail: "no majority: enwiki defender, wikidata midfielder",
      },
    ]);
    expect(
      rated("Centre-back", null, ["midfielder"])?.draft.provenance.position,
    ).toMatchObject({ confidence: "low", agreeing: ["enwiki"] });
    expect(pick(null, "Défenseur central", ["midfielder"]).line).toBe(
      "defender",
    );
  });

  // Not in the dispatch: three different lines. P35 lets Wikidata decide when
  // the pages disagree with each other; the level is low.
  it("takes Wikidata when all three disagree", () => {
    const p = pick("Forward", "Défenseur central", ["midfielder"]);
    expect(p.line).toBe("midfielder");
    expect(p.flags).toEqual([
      {
        kind: "position-disagrees",
        detail:
          "no majority: enwiki forward, frwiki defender, wikidata midfielder",
      },
    ]);
    expect(
      rated("Forward", "Défenseur central", ["midfielder"])?.draft.provenance
        .position,
    ).toMatchObject({ confidence: "low", agreeing: ["wikidata"] });
  });

  it("lets an override fix the line without a flag", () => {
    const p = pick(
      "Centre-back",
      "Défenseur central",
      ["midfielder"],
      "forward",
    );
    expect(p.line).toBe("forward");
    expect(p.provenance.position?.source).toBe("override");
    expect(p.flags).toEqual([]);
  });

  it("flags an unmappable Wikidata position and falls back to the infobox", () => {
    const p = pick("Forward, winger", null, ["association football manager"]);
    expect(p.line).toBe("forward");
    expect(p.provenance.position?.source).toBe("enwiki");
    expect(p.flags.map((f) => f.kind)).toEqual(["position-unmapped"]);
  });
});

function wdPlayer(fields: Partial<WdPlayer> = {}): WdPlayer {
  return {
    qid: "Q19956607",
    nameEn: "Yassine Meriah",
    nameFr: "Yassine Meriah",
    nameAr: "ياسين مرياح",
    aliases: ["Meriah", "مرياح", "Yassine Meriah"],
    male: true,
    birthDate: "1993-07-02",
    positions: ["midfielder"],
    birthPlaceQid: "Q100",
    birthPlaceName: "Tunis",
    birthCountry: "TN",
    governorates: ["Tunis Governorate"],
    imageFile: "File:Meriah.jpg",
    titles: { en: "Yassine Meriah", fr: "Yassine Meriah (football)", ar: null },
    ...fields,
  };
}

const governorateIds = new Set(["tunis", "sfax"]);

describe("pickBirth (D-S1-4)", () => {
  it("resolves a Tunisian town to its governorate", () => {
    const birth = pickBirth(wdPlayer(), {}, governorateIds, today);
    expect([birth.birthCountry, birth.governorate]).toEqual(["TN", "tunis"]);
    expect(birth.flags).toEqual([]);
  });

  it("keeps the country for players born abroad, without a governorate or a flag", () => {
    const birth = pickBirth(
      wdPlayer({
        birthPlaceName: "Ajaccio",
        birthCountry: "FR",
        governorates: [],
      }),
      {},
      governorateIds,
      today,
    );
    expect([birth.birthCountry, birth.governorate]).toEqual(["FR", null]);
    expect(birth.flags).toEqual([]);
  });

  it("flags a birthplace that is only 'Tunisia'", () => {
    const birth = pickBirth(
      wdPlayer({
        birthPlaceQid: "Q948",
        birthPlaceName: "Tunisia",
        governorates: [],
      }),
      {},
      governorateIds,
      today,
    );
    expect(birth.flags.map((f) => f.kind)).toEqual([
      "birthplace-country-only",
      "governorate-unresolved",
    ]);
  });

  it("lets an override set the governorate", () => {
    const birth = pickBirth(
      wdPlayer({ governorates: [] }),
      { governorate: { value: "sfax", ...by } },
      governorateIds,
      today,
    );
    expect(birth.governorate).toBe("sfax");
    expect(birth.provenance.governorate?.source).toBe("override");
  });
});

describe("mergePlayer", () => {
  const matches: Match[] = ["2026-09-05", "2026-09-09", "2026-10-01"].map(
    (date) => ({
      date,
      home: "Tunisia",
      away: "X",
      homeScore: 1,
      awayScore: 0,
      tournament: "Friendly",
    }),
  );

  function context(
    overrides: MergeContext["overrides"]["players"] = {},
  ): MergeContext {
    return {
      today,
      memberships: new Map([
        [
          "Q19956607",
          [
            membership("Q27971", 2015, null, {
              national: true,
              apps: 80,
              goals: 2,
            }),
          ],
        ],
      ]),
      index,
      infoboxes: {
        en: new Map([
          [
            "Yassine Meriah",
            box("en", {
              caps: 90,
              goals: 3,
              capsAsOf: "2026-08-01",
              nationalOpen: true,
              currentClub: "CS Sfaxien",
              clubsAsOf: "2026-08-01",
              positionText: "Centre-back",
            }),
          ],
        ]),
        fr: new Map(),
      },
      photos: new Map([
        [
          "File:Meriah.jpg",
          {
            file: "File:Meriah.jpg",
            thumbUrl: "https://x",
            width: 250,
            height: 400,
            licence: "CC BY-SA 4.0",
            licenceUrl: null,
            author: "A",
            sourceUrl: "https://commons.wikimedia.org/wiki/File:Meriah.jpg",
            attributionRequired: true,
          },
        ],
      ]),
      tunisiaMatches: matches,
      overrides: { players: overrides, clubTitles: {} },
      governorateIds,
    };
  }

  it("builds a draft with every field's source, and the flags to review", () => {
    const merged = mergePlayer(wdPlayer(), context());
    expect(merged?.draft).toMatchObject({
      wikidataId: "Q19956607",
      nameLatin: "Yassine Meriah",
      nameArabic: "ياسين مرياح",
      aliases: ["Meriah", "مرياح"],
      position: "defender", // P35: the one page against Wikidata
      positionDetail: "Centre-back",
      governorate: "tunis",
      caps: 90,
      goals: 3,
      capsAsOf: "2026-08-01",
      club: sfaxien,
    });
    expect(Object.keys(merged!.draft.provenance).sort()).toEqual(
      [
        "birthDate",
        "birthPlace",
        "caps",
        "clubId",
        "goals",
        "governorate",
        "nameArabic",
        "nameLatin",
        "photo",
        "position",
        "positionDetail",
      ].sort(),
    );
    expect(merged!.flags.map((f) => f.kind).sort()).toEqual(
      ["caps-maybe-stale", "photo-small", "position-disagrees"].sort(),
    );
    const prov = merged!.draft.provenance;
    expect(prov.caps).toMatchObject({
      confidence: "medium",
      agreeing: ["enwiki"],
    }); // en 90 fresh; Wikidata 80 older and lower
    expect(prov.position).toMatchObject({
      source: "enwiki",
      confidence: "low",
      agreeing: ["enwiki"],
    }); // P35: en Centre-back chosen over Wikidata midfielder, one against one
    expect([
      prov.clubId?.confidence,
      prov.birthDate?.confidence,
      prov.governorate?.confidence,
    ]).toEqual(["medium", "low", "low"]);
    expect(
      Object.values(prov).every(
        (e) => e.confidence !== undefined && (e.agreeing?.length ?? 0) > 0,
      ),
    ).toBe(true);
  });

  it("drops an excluded footballer", () => {
    expect(
      mergePlayer(
        wdPlayer(),
        context({ Q19956607: { exclude: { value: true, ...by } } }),
      ),
    ).toBeNull();
  });

  it("applies caps overrides together, from the override", () => {
    const merged = mergePlayer(
      wdPlayer(),
      context({
        Q19956607: {
          caps: { value: 95, ...by },
          capsAsOf: { value: "2026-10-01", ...by },
        },
      }),
    );
    expect([
      merged?.draft.caps,
      merged?.draft.goals,
      merged?.draft.capsAsOf,
    ]).toEqual([95, 3, "2026-10-01"]);
    expect(merged?.draft.provenance.caps?.source).toBe("override");
    expect(merged?.flags.map((f) => f.kind)).not.toContain("caps-maybe-stale");
    expect(merged?.draft.provenance.caps).toMatchObject({
      confidence: "high",
      agreeing: ["override"],
    });
    expect(merged?.draft.provenance.goals?.source).toBe("enwiki");
  });

  // Fix round 1, finding 3: caps and goals always carry provenance; an
  // unknown count is never a silent, known-looking zero.
  describe("unknown caps and goals", () => {
    const noCaps = (
      en: Partial<Infobox> | null,
      fr: Partial<Infobox> | null,
      memberships: WdMembership[] = [],
    ): MergeContext => ({
      ...context(),
      memberships: new Map([["Q19956607", memberships]]),
      infoboxes: {
        en: new Map(en ? [["Yassine Meriah", box("en", en)]] : []),
        fr: new Map(fr ? [["Yassine Meriah (football)", box("fr", fr)]] : []),
      },
    });

    // Decision P34: a 0 inferred from absence. Witnesses, in this order:
    // enwiki and frwiki (a page with no senior row), wikidata (club
    // memberships listed, none of them the senior team Q27971). Two or more:
    // medium; one: low; never high; page dates play no part.
    const club2020 = membership("Q3", 2020, null);
    const absence = (
      merged: ReturnType<typeof mergePlayer>,
      source: string,
      confidence: string,
      agreeing: string[],
    ) => {
      expect([
        merged?.draft.caps,
        merged?.draft.goals,
        merged?.draft.capsAsOf,
      ]).toEqual([0, 0, null]);
      for (const field of ["caps", "goals"] as const) {
        const entry = merged?.draft.provenance[field];
        expect(entry).toMatchObject({
          source,
          confidence,
          agreeing,
          confidenceNote: "no senior national row",
        });
        expect(entry?.asOf).toBeUndefined();
      }
      expect(merged?.flags.map((f) => f.kind)).not.toContain("caps-unknown");
    };

    it("rates 0 caps medium when both pages are silent (P34)", () =>
      absence(
        mergePlayer(
          wdPlayer(),
          noCaps({ capsAsOf: "2026-01-01" }, { capsAsOf: "2026-09-01" }),
        ),
        "enwiki",
        "medium",
        ["enwiki", "frwiki"],
      ));

    it("rates 0 caps medium when one page and Wikidata agree on the absence (P34)", () =>
      absence(
        mergePlayer(
          wdPlayer(),
          noCaps({ capsAsOf: "2020-01-01" }, null, [club2020]),
        ),
        "enwiki",
        "medium",
        ["enwiki", "wikidata"],
      ));

    it("rates 0 caps low on one silent page alone, however fresh (P34)", () =>
      absence(
        mergePlayer(wdPlayer(), noCaps({ capsAsOf: "2026-09-30" }, null)),
        "enwiki",
        "low",
        ["enwiki"],
      ));

    it("never rates 0 caps high, even on three witnesses (P34)", () =>
      absence(
        mergePlayer(wdPlayer(), noCaps({}, {}, [club2020])),
        "enwiki",
        "medium",
        ["enwiki", "frwiki", "wikidata"],
      ));

    // Not in the dispatch: martj42 naming him as a Tunisia scorer contradicts
    // the absence, so his 0 goals stay low and the floor flag stays.
    it("keeps 0 goals low when martj42 lists goals by him (P34)", () => {
      const merged = mergePlayer(wdPlayer(), {
        ...noCaps({}, {}),
        goalsFloor: new Map([["Q19956607", 2]]),
      });
      expect(merged?.draft.provenance.caps).toMatchObject({
        confidence: "medium",
      });
      expect(merged?.draft.provenance.goals).toMatchObject({
        confidence: "low",
        confidenceNote: "no senior national row; martj42 lists 2 goals by him",
      });
      expect(merged?.flags.map((f) => f.kind)).toContain("goals-below-floor");
    });

    it("treats a footballer Wikidata lists in the senior team as unknown caps, not absent (P34)", () => {
      const merged = mergePlayer(
        wdPlayer(),
        noCaps({}, {}, [
          club2020,
          membership("Q27971", 2015, null, { national: true }),
        ]),
      );
      expect(merged?.draft.provenance.caps).toMatchObject({
        source: "none",
        confidence: "low",
      });
      expect(merged?.flags.map((f) => f.kind)).toContain("caps-unknown");
    });

    it("keeps caps unknown after a skipped national row, whatever Wikidata says (P34)", () => {
      const skipped = [
        {
          field: "nationalteam2",
          raw: "Tunisia B",
          reason: "no-club" as const,
        },
      ];
      const merged = mergePlayer(
        wdPlayer(),
        noCaps({ skipped }, {}, [club2020]),
      );
      expect(merged?.draft.provenance.caps).toMatchObject({
        source: "none",
        confidence: "low",
      });
      expect(merged?.flags.map((f) => f.kind)).toContain("caps-unknown");
    });

    it("does not read 0 from an infobox that skipped a national row", () => {
      const skipped = [
        {
          field: "sélection nationale",
          raw: "|2019 (janv.)|{{TUN football}}|3 (1)",
          reason: "years" as const,
        },
      ];
      const merged = mergePlayer(
        wdPlayer(),
        noCaps(null, { capsAsOf: "2026-09-01", skipped }),
      );
      expect(merged?.draft.provenance.caps).toMatchObject({
        source: "none",
        confidence: "low",
      });
      expect(merged?.flags.map((f) => f.kind)).toContain("caps-unknown");
    });

    // Fix round 2, I1: a skipped national row on either page means a Tunisia
    // row may exist, so the other page's silence is not a 0.
    it.each([
      ["en", "nationalteam1"],
      ["fr", "sélection nationale"],
    ] as const)(
      "reads no 0 from either infobox when the %s one skipped a national row",
      (skippedLang, field) => {
        const skipped = [
          { field, raw: "{{some-template|x}}", reason: "no-club" as const },
        ];
        const en = {
          capsAsOf: "2026-09-01",
          ...(skippedLang === "en" ? { skipped } : {}),
        };
        const fr = {
          capsAsOf: "2026-09-01",
          ...(skippedLang === "fr" ? { skipped } : {}),
        };
        const merged = mergePlayer(wdPlayer(), noCaps(en, fr));
        expect([merged?.draft.caps, merged?.draft.goals]).toEqual([0, 0]);
        for (const key of ["caps", "goals"] as const) {
          expect(merged?.draft.provenance[key]).toMatchObject({
            source: "none",
            confidence: "low",
          });
        }
        const kinds = merged?.flags.map((f) => f.kind);
        expect(kinds).toContain("caps-unknown");
        expect(kinds).toContain("caps-row-skipped");
      },
    );

    // Fix round 2, I1 and I2: an unlinked English cell the parser cannot read
    // is reported, so a silent French page cannot turn it into 0 caps.
    it("reads an unreadable English national cell beside a silent French page as unknown caps", () => {
      const parsed = parseEnInfobox(
        "Yassine Meriah",
        "{{Infobox football biography\n| nationalteam1 = {{some-template|x}}\n| nationalcaps1 = 5\n| nationalgoals1 = 1\n}}",
      )!;
      const merged = mergePlayer(
        wdPlayer(),
        noCaps(parsed, { capsAsOf: "2026-09-01" }),
      );
      expect(merged?.draft.provenance.caps).toMatchObject({
        source: "none",
        confidence: "low",
      });
      expect(merged?.flags).toContainEqual({
        kind: "caps-row-skipped",
        detail: "enwiki nationalteam1 (no-club): {{some-template|x}}",
      });
      expect(merged?.flags.map((f) => f.kind)).toContain("caps-unknown");
    });

    // Fix round 2, m1: a caps override does not make unknown goals known.
    it("flags unknown goals under a caps override", () => {
      const merged = mergePlayer(wdPlayer(), {
        ...noCaps(null, null),
        overrides: {
          players: { Q19956607: { caps: { value: 12, ...by } } },
          clubTitles: {},
        },
      });
      expect(merged?.draft.provenance.goals).toMatchObject({
        source: "none",
        confidence: "low",
      });
      expect(
        merged?.flags
          .filter((f) => f.kind.endsWith("-unknown"))
          .map((f) => f.kind),
      ).toEqual(["goals-unknown"]);
    });

    // Fix round 3 (iii): Jalel says he played, so the page's silence says
    // nothing about his goals.
    it("does not read 0 goals from a silent infobox beside overridden caps", () => {
      const merged = mergePlayer(wdPlayer(), {
        ...noCaps({ capsAsOf: "2026-09-01" }, null),
        overrides: {
          players: { Q19956607: { caps: { value: 7, ...by } } },
          clubTitles: {},
        },
      });
      expect([merged?.draft.caps, merged?.draft.goals]).toEqual([7, 0]);
      expect(merged?.draft.provenance.caps).toMatchObject({
        source: "override",
        confidence: "high",
      });
      expect(merged?.draft.provenance.goals).toMatchObject({
        source: "none",
        confidence: "low",
        agreeing: ["none"],
      });
      expect(
        merged?.flags
          .filter((f) => f.kind.endsWith("-unknown"))
          .map((f) => f.kind),
      ).toEqual(["goals-unknown"]);
    });

    it("flags caps no source gives, rated low on no source", () => {
      const merged = mergePlayer(wdPlayer(), noCaps(null, null));
      expect([
        merged?.draft.caps,
        merged?.draft.goals,
        merged?.draft.capsAsOf,
      ]).toEqual([0, 0, null]);
      for (const field of ["caps", "goals"] as const) {
        expect(merged?.draft.provenance[field]).toMatchObject({
          source: "none",
          confidence: "low",
          agreeing: ["none"],
        });
      }
      expect(
        merged?.flags
          .filter((f) => f.kind.endsWith("-unknown"))
          .map((f) => f.kind),
      ).toEqual(["caps-unknown"]);
    });

    it("flags goals when the caps source has none and no other source does", () => {
      const merged = mergePlayer(
        wdPlayer(),
        noCaps(null, null, [
          membership("Q27971", 2015, null, {
            national: true,
            apps: 80,
            goals: null,
          }),
        ]),
      );
      expect([merged?.draft.caps, merged?.draft.goals]).toEqual([80, 0]);
      expect(merged?.draft.provenance.caps).toMatchObject({
        source: "wikidata",
        confidence: "low",
      });
      expect(merged?.draft.provenance.goals).toMatchObject({
        source: "none",
        confidence: "low",
        agreeing: ["none"],
      });
      expect(
        merged?.flags
          .filter((f) => f.kind.endsWith("-unknown"))
          .map((f) => f.kind),
      ).toEqual(["goals-unknown"]);
    });
  });

  // Fix round 1, finding 2: an override rates only the field it overrides.
  it("lets a capsAsOf override date the caps without rating them as decided", () => {
    const merged = mergePlayer(
      wdPlayer(),
      context({ Q19956607: { capsAsOf: { value: "2026-10-01", ...by } } }),
    );
    expect([merged?.draft.caps, merged?.draft.capsAsOf]).toEqual([
      90,
      "2026-10-01",
    ]);
    expect(merged?.draft.provenance.caps).toMatchObject({
      source: "enwiki",
      asOf: "2026-10-01",
      by: "jalel",
      confidence: "medium",
      agreeing: ["enwiki"],
    });
    expect(merged?.flags.map((f) => f.kind)).not.toContain("caps-maybe-stale");
  });

  it("still checks wiki caps for staleness under a goals-only override", () => {
    const merged = mergePlayer(
      wdPlayer(),
      context({ Q19956607: { goals: { value: 4, ...by } } }),
    );
    expect(merged?.draft.goals).toBe(4);
    expect(merged?.draft.provenance.goals).toMatchObject({
      source: "override",
      confidence: "high",
    });
    expect(merged?.draft.provenance.caps).toMatchObject({
      source: "enwiki",
      confidence: "medium",
    });
    expect(merged?.flags.map((f) => f.kind)).toContain("caps-maybe-stale");
  });

  // Fix round 1, finding 1: Wikidata with apps (P1350) but no goals (P1351).
  it("takes no goals vote from a source that has caps but no goals", () => {
    const ctx = context();
    ctx.memberships.set("Q19956607", [
      membership("Q27971", 2015, null, {
        national: true,
        apps: 80,
        goals: null,
      }),
    ]);
    const merged = mergePlayer(wdPlayer(), ctx);
    expect(merged?.draft.goals).toBe(3);
    expect(merged?.draft.provenance.goals).toMatchObject({
      source: "enwiki",
      confidence: "medium",
      agreeing: ["enwiki"],
      confidenceNote: "one fresh source",
    });
  });

  it("rates goals low and flags them when the infobox is under the martj42 floor", () => {
    const merged = mergePlayer(wdPlayer(), {
      ...context(),
      goalsFloor: new Map([["Q19956607", 4]]),
    }); // infobox 3 goals
    expect([
      merged?.draft.provenance.goals?.confidence,
      merged?.flags.some((f) => f.kind === "goals-below-floor"),
    ]).toEqual(["low", true]);
  });

  it("rates the birth date high when both infoboxes give Wikidata's date (Step 6.0)", () => {
    const ctx = context();
    ctx.infoboxes.en.set("Yassine Meriah", {
      ...ctx.infoboxes.en.get("Yassine Meriah")!,
      birthDate: "1993-07-02",
    });
    ctx.infoboxes.fr.set(
      "Yassine Meriah (football)",
      box("fr", { birthDate: "1993-07-02" }),
    );
    expect(
      mergePlayer(wdPlayer(), ctx)?.draft.provenance.birthDate,
    ).toMatchObject({
      confidence: "high",
      agreeing: ["wikidata", "enwiki", "frwiki"],
    });
  });

  it("rates a history whose clubs all fail to match low, still naming its source", () => {
    const ctx = context();
    ctx.infoboxes.en.set(
      "Yassine Meriah",
      box("en", {
        clubsAsOf: "2026-08-01",
        spells: [
          {
            clubTitle: "Nowhere United",
            from: 2010,
            to: null,
            apps: null,
            goals: null,
            loan: false,
          },
        ],
      }),
    );
    expect(
      mergePlayer(wdPlayer(), ctx)?.draft.provenance.history,
    ).toMatchObject({
      source: "enwiki",
      confidence: "low",
      agreeing: ["enwiki"],
    });
  });
});

describe("skipped infobox rows (Task 4 review)", () => {
  const twoBoxes = (
    en: Partial<Infobox>,
    fr: Partial<Infobox>,
  ): MergeContext => ({
    today,
    memberships: new Map(),
    index,
    photos: new Map(),
    tunisiaMatches: [],
    overrides: { players: {}, clubTitles: {} },
    governorateIds,
    infoboxes: {
      en: new Map([["Yassine Meriah", box("en", en)]]),
      fr: new Map([["Yassine Meriah (football)", box("fr", fr)]]),
    },
  });
  const caps = { caps: 90, goals: 3, capsAsOf: "2026-08-01" };
  const skip = (field: string) => [
    {
      field,
      raw: "| 2010-11 | {{TUN football}} | 3 (0)",
      reason: "years" as const,
    },
  ];

  it("caps and goals drop from high to medium when one infobox skipped a national-team row, with a flag", () => {
    expect(
      mergePlayer(wdPlayer(), twoBoxes(caps, caps))?.draft.provenance.caps
        ?.confidence,
    ).toBe("high");
    const merged = mergePlayer(
      wdPlayer(),
      twoBoxes(caps, { ...caps, skipped: skip("sélection nationale") }),
    );
    expect([
      merged?.draft.provenance.caps?.confidence,
      merged?.draft.provenance.goals?.confidence,
    ]).toEqual(["medium", "medium"]);
    expect(merged?.flags).toContainEqual({
      kind: "caps-row-skipped",
      detail:
        "frwiki sélection nationale (years): | 2010-11 | {{TUN football}} | 3 (0)",
    });
  });

  it("the current club drops from high to medium when one infobox skipped a career row, with a flag", () => {
    const en = {
      currentClub: "Espérance Sportive de Tunis",
      clubsAsOf: "2026-08-01",
    };
    const fr = {
      currentClub: "Espérance sportive de Tunis",
      clubsAsOf: "2026-08-01",
    };
    expect(
      mergePlayer(wdPlayer(), twoBoxes(en, fr))?.draft.provenance.clubId
        ?.confidence,
    ).toBe("high");
    const merged = mergePlayer(
      wdPlayer(),
      twoBoxes({ ...en, skipped: skip("clubs") }, fr),
    );
    expect([
      merged?.draft.provenance.clubId?.confidence,
      merged?.flags.some((f) => f.kind === "career-row-skipped"),
    ]).toEqual(["medium", true]);
  });

  it("a skipped row in one kind of field leaves the other kind alone", () =>
    expect(
      mergePlayer(
        wdPlayer(),
        twoBoxes({ ...caps, skipped: skip("clubs") }, caps),
      )?.draft.provenance.caps?.confidence,
    ).toBe("high"));

  // Parked note: an English nationalteamN cell in a non-link form ({{fb|TUN}})
  // gives caps null. That is no vote, not zero caps, and no flag.
  it("treats English caps of null as no vote, not as zero", () => {
    const merged = mergePlayer(
      wdPlayer(),
      twoBoxes(
        { caps: null, goals: null },
        { caps: 41, goals: 0, capsAsOf: "2026-09-01" },
      ),
    );
    expect([merged?.draft.caps, merged?.draft.goals]).toEqual([41, 0]);
    expect(merged?.draft.provenance.caps).toMatchObject({
      source: "frwiki",
      confidence: "medium",
      agreeing: ["frwiki"],
      confidenceNote: "one fresh source",
    });
    expect(merged?.flags.filter((f) => f.kind.startsWith("caps"))).toEqual([]);
  });
});
