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

  it("drops them from the merged history and its rating too", () => {
    const merged = mergePlayer(wdPlayer(), {
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
    expect(merged?.draft.history.map((s) => s.clubName)).not.toContain(ariana);
    expect(
      merged?.flags.filter((f) => f.kind === "fr-undated-spell"),
    ).toHaveLength(1);
    expect(merged?.draft.provenance.history).toMatchObject({
      source: "frwiki",
      agreeing: ["frwiki"],
    });
  });
});

describe("pickPosition (D-S1-7)", () => {
  it("maps Wikidata and flags an English infobox that disagrees", () => {
    const pick = pickPosition({
      qid: "Q19956607",
      wikidata: ["midfielder"],
      en: box("en", { positionText: "Centre-back" }),
      fr: null,
      today,
    });
    expect(pick.line).toBe("midfielder");
    expect(pick.detail).toBe("Centre-back");
    expect(pick.flags.map((f) => f.kind)).toEqual(["position-disagrees"]);
  });

  it("lets an override fix the line without a flag", () => {
    const pick = pickPosition({
      qid: "Q19956607",
      wikidata: ["midfielder"],
      en: box("en", { positionText: "Centre-back" }),
      fr: null,
      override: { value: "defender", ...by },
      today,
    });
    expect(pick.line).toBe("defender");
    expect(pick.provenance.position?.source).toBe("override");
    expect(pick.flags).toEqual([]);
  });

  it("flags an unmappable Wikidata position and falls back to the infobox", () => {
    const pick = pickPosition({
      qid: "Q1",
      wikidata: ["association football manager"],
      en: box("en", { positionText: "Forward, winger" }),
      fr: null,
      today,
    });
    expect(pick.line).toBe("forward");
    expect(pick.provenance.position?.source).toBe("enwiki");
    expect(pick.flags.map((f) => f.kind)).toEqual(["position-unmapped"]);
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
      position: "midfielder",
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
      confidence: "low",
      agreeing: ["wikidata"],
    }); // Wikidata midfielder, en Centre-back
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
