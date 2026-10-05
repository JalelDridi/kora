import { describe, expect, it } from "vitest";
import { buildClubIndex } from "./merge.ts";
import {
  ageOn,
  assignIds,
  buildPool,
  carryProvenance,
  emptyRegistry,
  isCandidate,
  poolsFor,
  type BuildInput,
} from "./pool.ts";
import type {
  IdRegistry,
  Infobox,
  PoolPlayer,
  WdClub,
  WdMembership,
  WdPlayer,
} from "./types.ts";

const today = "2026-10-04";

function club(
  qid: string,
  nameEn: string,
  country: string | null,
  leagues: string[] = [],
): WdClub {
  return {
    qid,
    nameEn,
    nameFr: null,
    nameAr: null,
    country,
    leagues,
    titleEn: nameEn,
    titleFr: null,
  };
}
const esperance = club("Q10", "Espérance Sportive de Tunis", "TN", ["Q794235"]);
const sfaxien = club("Q11", "CS Sfaxien", "TN", ["Q794235"]);
const gent = club("Q12", "K.A.A. Gent", "BE");
const noCountry = club("Q13", "Old Club", null);
const minor = club("Q14", "AS Minor", "TN");
const index = buildClubIndex(
  [esperance, sfaxien, gent, noCountry, minor],
  { en: new Map(), fr: new Map() },
  {},
);

function m(
  playerQid: string,
  teamQid: string,
  start: number | null,
  end: number | null,
  extra: Partial<WdMembership> = {},
): WdMembership {
  return {
    playerQid,
    teamQid,
    teamName: null,
    start,
    end,
    endUnknown: false,
    apps: null,
    goals: null,
    national: false,
    ...extra,
  };
}

function wd(
  qid: string,
  nameEn: string,
  birthDate: string,
  fields: Partial<WdPlayer> = {},
): WdPlayer {
  return {
    qid,
    nameEn,
    nameFr: null,
    nameAr: null,
    aliases: [],
    male: true,
    birthDate,
    positions: ["defender"],
    birthPlaceQid: null,
    birthPlaceName: null,
    birthCountry: "TN",
    governorates: [],
    imageFile: null,
    titles: { en: nameEn, fr: null, ar: null },
    ...fields,
  };
}

describe("ageOn and poolsFor (D-S1-1)", () => {
  it("counts birthdays", () => {
    expect(ageOn("1988-10-05", today)).toBe(37);
    expect(ageOn("1988-10-04", today)).toBe(38);
  });

  it("puts a club and 38 or less in the active pool, 20 caps or more in the legends", () => {
    expect(
      poolsFor({ club: {}, caps: 5, birthDate: "1998-01-01" }, today),
    ).toEqual({ active: true, legend: false });
    expect(
      poolsFor({ club: {}, caps: 25, birthDate: "1985-01-01" }, today),
    ).toEqual({ active: false, legend: true });
    expect(
      poolsFor({ club: null, caps: 105, birthDate: "1975-08-30" }, today),
    ).toEqual({ active: false, legend: true });
  });
});

describe("isCandidate (research rule, probe §2)", () => {
  // The merged birth date (P37); Wikidata's here, as no page is given.
  const cand = (
    p: WdPlayer,
    ms: WdMembership[],
    draft: { caps: number; hasClub: boolean } = { caps: 0, hasClub: false },
  ) => isCandidate(p, ms, index, { ...draft, birthDate: p.birthDate });
  it("takes Tunisia internationals since 2000", () => {
    expect(
      cand(wd("Q1", "A", "1978-01-01"), [m("Q1", "Q27971", 1998, 2005)]),
    ).toBe(true);
    expect(
      cand(wd("Q1", "A", "1965-01-01"), [m("Q1", "Q27971", 1988, 1996)]),
    ).toBe(false);
  });
  it("takes footballers born in 1986 or later with an open Ligue 1 or foreign club", () => {
    expect(
      cand(wd("Q1", "A", "1996-01-01"), [m("Q1", "Q12", 2020, null)]),
    ).toBe(true);
    expect(
      cand(wd("Q1", "A", "1996-01-01"), [m("Q1", "Q10", 2020, null)]),
    ).toBe(true);
    expect(
      cand(wd("Q1", "A", "1996-01-01"), [m("Q1", "Q14", 2020, null)]),
    ).toBe(false);
    expect(
      cand(wd("Q1", "A", "1980-01-01"), [m("Q1", "Q12", 2020, null)]),
    ).toBe(false);
  });
  it("also takes infobox caps or a current club, and never a woman", () => {
    expect(
      cand(wd("Q1", "A", "1980-01-01"), [], { caps: 3, hasClub: false }),
    ).toBe(true);
    expect(
      cand(wd("Q1", "A", "1999-01-01"), [], { caps: 0, hasClub: true }),
    ).toBe(true);
    expect(
      cand(wd("Q1", "A", "1996-01-01", { male: false }), [
        m("Q1", "Q12", 2020, null),
      ]),
    ).toBe(false);
  });

  // Final wave, A1 (D-S1-1): "Legend: 20 or more Tunisia caps, any age."
  // Tarak Dhiab (Q958968), born 1954, Wikidata P1350 101 caps.
  it("takes 20 caps or more whatever the age: Tarak Dhiab", () => {
    const dhiab = wd("Q958968", "Tarak Dhiab", "1954-07-15");
    expect(cand(dhiab, [m("Q958968", "Q27971", 1975, 1990)])).toBe(false);
    expect(
      cand(dhiab, [m("Q958968", "Q27971", 1975, 1990)], {
        caps: 101,
        hasClub: false,
      }),
    ).toBe(true);
  });

  // Chokri El Ouaer (Q1075865), born 1966, 93 caps on the French page.
  it("takes 20 caps or more whatever the age: Chokri El Ouaer", () => {
    const elOuaer = wd("Q1075865", "Chokri El Ouaer", "1966-08-15");
    expect(cand(elOuaer, [], { caps: 93, hasClub: false })).toBe(true);
    expect(cand(elOuaer, [], { caps: 19, hasClub: false })).toBe(false);
  });

  it("reads the merged birth date, not Wikidata's (P37, hand-made)", () => {
    const p = wd("Q1", "A", "1969-12-31");
    const draft = { caps: 3, hasClub: false };
    expect(
      isCandidate(p, [], index, { ...draft, birthDate: p.birthDate }),
    ).toBe(false);
    expect(
      isCandidate(p, [], index, { ...draft, birthDate: "1970-01-02" }),
    ).toBe(true);
  });
});

describe("assignIds", () => {
  it("keeps registered ids, then gives slugs, adding the Wikidata id on a clash", () => {
    const { ids } = assignIds(
      [
        { key: "Q5", name: "Ali Abdi" },
        { key: "Q9", name: "Ali Abdi" },
        { key: "Q7", name: "Wahbi Khazri" },
      ],
      { Q7: "khazri" },
    );
    expect(Object.fromEntries(ids)).toEqual({
      Q5: "ali-abdi",
      Q9: "ali-abdi-q9",
      Q7: "khazri",
    });
  });

  it("never gives a new footballer an id the registry holds, even for someone absent tonight", () => {
    const registry = { Q5: "ali-abdi", Q6: "ali-abdi-q9" };
    const { ids, registry: next } = assignIds(
      [
        { key: "Q9", name: "Ali Abdi" },
        { key: "Q7", name: "Wahbi Khazri" },
      ],
      registry,
    );
    expect(Object.fromEntries(ids)).toEqual({
      Q9: "ali-abdi-q9-2",
      Q7: "wahbi-khazri",
    });
    expect(next).toEqual({
      Q5: "ali-abdi",
      Q6: "ali-abdi-q9",
      Q9: "ali-abdi-q9-2",
      Q7: "wahbi-khazri",
    });
    expect(registry).toEqual({ Q5: "ali-abdi", Q6: "ali-abdi-q9" });
  });
});

describe("carryProvenance", () => {
  const base = {
    id: "x",
    wikidataId: "Q1",
    nameLatin: "X",
    nameArabic: null,
    nameFrench: null,
    aliases: [],
    position: "defender",
    positionDetail: null,
    birthDate: "1990-01-01",
    birthPlace: null,
    birthCountry: null,
    governorate: null,
    clubId: "a",
    caps: 10,
    goals: 1,
    capsAsOf: "2026-01-01",
    history: [],
    photo: null,
    wiki: { en: null, fr: null, ar: null },
    pools: { active: true, legend: false },
  } satisfies Omit<PoolPlayer, "provenance">;

  it("keeps the first date for an unchanged value and takes the new one for a change", () => {
    const before: PoolPlayer = {
      ...base,
      provenance: {
        clubId: { source: "enwiki", retrievedAt: "2026-10-01" },
        caps: { source: "enwiki", retrievedAt: "2026-10-01" },
      },
    };
    const after: PoolPlayer = {
      ...base,
      caps: 11,
      provenance: {
        clubId: { source: "enwiki", retrievedAt: today },
        caps: { source: "enwiki", retrievedAt: today },
      },
    };
    const carried = carryProvenance(before, after);
    expect(carried.provenance.clubId?.retrievedAt).toBe("2026-10-01");
    expect(carried.provenance.caps?.retrievedAt).toBe(today);
  });

  // P30: the copy's path is the run's, not the source's: a photo already
  // copied is the same Commons photo as tonight's draft without a path.
  it("dates the photo by its Commons file, not by the copy's path", () => {
    const photo = {
      file: "File:X.jpg",
      thumbUrl: "https://upload.wikimedia.org/x.jpg",
      width: 1,
      height: 1,
      licence: "CC BY-SA 4.0",
      licenceUrl: null,
      author: "Someone",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:X.jpg",
      attributionRequired: true,
    };
    const before: PoolPlayer = {
      ...base,
      photo: { ...photo, path: "/photos/x.jpg" },
      provenance: { photo: { source: "commons", retrievedAt: "2026-10-01" } },
    };
    const after: PoolPlayer = {
      ...base,
      photo,
      provenance: { photo: { source: "commons", retrievedAt: today } },
    };
    expect(carryProvenance(before, after).provenance.photo?.retrievedAt).toBe(
      "2026-10-01",
    );
  });

  it("dates goals on their own: unchanged goals keep their date when the caps change", () => {
    const before: PoolPlayer = {
      ...base,
      provenance: {
        caps: { source: "enwiki", retrievedAt: "2026-10-01" },
        goals: { source: "enwiki", retrievedAt: "2026-10-01" },
      },
    };
    const after: PoolPlayer = {
      ...base,
      caps: 11,
      provenance: {
        caps: { source: "enwiki", retrievedAt: today },
        goals: { source: "enwiki", retrievedAt: today },
      },
    };
    const carried = carryProvenance(before, after);
    expect([
      carried.provenance.caps?.retrievedAt,
      carried.provenance.goals?.retrievedAt,
    ]).toEqual([today, "2026-10-01"]);
  });
});

/** The pool only; the registry is checked in "ids are permanent". */
const build = (i: BuildInput) => buildPool(i).pool;

describe("buildPool", () => {
  const en = (title: string, fields: Partial<Infobox>): Infobox => ({
    lang: "en",
    title,
    currentClub: null,
    currentClubIsStaff: false,
    positionText: null,
    spells: [],
    caps: null,
    goals: null,
    nationalOpen: false,
    nationalEnd: null,
    clubsAsOf: null,
    capsAsOf: null,
    skipped: [],
    seniorRow: false,
    ...fields,
  });

  function input(): BuildInput {
    return {
      today,
      players: [
        wd("Q331918", "Radhi Jaïdi", "1975-08-30"),
        wd("Q96755704", "Hannibal Mejbri", "2003-01-21", {
          birthCountry: "FR",
        }),
        wd("Q500", "Old Reserve", "1960-05-05"),
        wd("Q600", "No Position", "1999-03-03", { positions: [] }),
      ],
      memberships: new Map([
        [
          "Q331918",
          [
            m("Q331918", "Q27971", 1996, 2009, {
              national: true,
              apps: 105,
              goals: 7,
            }),
          ],
        ],
        ["Q500", [m("Q500", "Q14", 1980, 1990)]],
        ["Q600", [m("Q600", "Q12", 2022, null)]],
      ]),
      index,
      infoboxes: {
        en: new Map([
          [
            "Hannibal Mejbri",
            en("Hannibal Mejbri", {
              currentClub: "K.A.A. Gent",
              clubsAsOf: "2026-09-01",
              caps: 40,
              goals: 1,
              capsAsOf: "2026-09-01",
              spells: [
                {
                  clubTitle: "Old Club",
                  from: 2019,
                  to: 2021,
                  apps: 1,
                  goals: 0,
                  loan: false,
                },
                {
                  clubTitle: "K.A.A. Gent",
                  from: 2024,
                  to: 1800,
                  apps: 30,
                  goals: 2,
                  loan: false,
                },
              ],
            }),
          ],
        ]),
        fr: new Map(),
      },
      photos: new Map(),
      tunisiaMatches: [],
      overrides: { players: {}, clubTitles: {} },
      governorateIds: new Set(),
      honours: [
        {
          competition: "tn_ligue1",
          seasonStart: 2011,
          seasonEnd: 2012,
          winnerQid: "Q10",
        },
        {
          competition: "caf_cl",
          seasonStart: 2011,
          seasonEnd: 2011,
          winnerQid: "Q999",
        },
      ],
      curatedHonours: [
        {
          competition: "tn_ligue1",
          seasonStart: 2011,
          seasonEnd: 2012,
          clubWikidataId: "Q11",
          by: "jalel",
          at: "2026-10-05",
        },
      ],
      ligue1Titles: ["Espérance Sportive de Tunis", "Unknown FC"],
      previous: null,
      ids: emptyRegistry(),
    };
  }

  it("keeps footballers in at least one pool, with ids, clubs and honours", () => {
    const pool = build(input());

    expect(pool.players.map((p) => [p.id, p.pools])).toEqual([
      ["hannibal-mejbri", { active: true, legend: true }],
      ["radhi-jaidi", { active: false, legend: true }],
    ]);
    const mejbri = pool.players[0];
    expect(mejbri.clubId).toBe("k-a-a-gent");
    expect(
      mejbri.history.map((s) => [s.clubId, s.clubName, s.from, s.to]),
    ).toEqual([
      [null, "Old Club", 2019, 2021],
      ["k-a-a-gent", "K.A.A. Gent", 2024, null],
    ]);
    expect(
      pool.clubs.map((c) => [c.id, c.country, c.confederation, c.ligue1]),
    ).toEqual([
      ["cs-sfaxien", "TN", "CAF", false],
      ["esperance-sportive-de-tunis", "TN", "CAF", true],
      ["k-a-a-gent", "BE", "UEFA", false],
    ]);
    expect(pool.honours).toEqual([
      {
        competition: "tn_ligue1",
        seasonStart: 2011,
        seasonEnd: 2012,
        clubId: "cs-sfaxien",
        source: "curated",
      },
    ]);
  });

  // Fix round 2, item 3: the footballer missing a field is listed in
  // `dropped` (below), no longer in the pool's flags.
  it("flags what it dropped and what it could not match", () => {
    const pool = build(input());
    expect(
      pool.flags.filter((f) =>
        ["dropped-missing-field", "ligue1-club-unresolved"].includes(f.kind),
      ),
    ).toEqual([
      {
        subject: "Unknown FC",
        kind: "ligue1-club-unresolved",
        detail: "no Wikidata item with this English title",
      },
    ]);
  });

  it("keeps ids from the registry and first-read dates from the previous pool", () => {
    const first = buildPool(input());
    const second = build({
      ...input(),
      today: "2026-10-05",
      previous: first.pool,
      ids: {
        ...first.ids,
        players: { ...first.ids.players, Q331918: "jaidi" },
      },
    });
    const jaidi = second.players.find((p) => p.wikidataId === "Q331918");
    expect(jaidi?.id).toBe("jaidi");
    expect(jaidi?.provenance.caps?.retrievedAt).toBe(today);
  });

  it("flags spell years the database cannot hold instead of dropping them silently", () => {
    const pool = build(input());
    expect(pool.flags.filter((f) => f.kind === "spell-years-unusable")).toEqual(
      [
        {
          subject: "Q96755704",
          kind: "spell-years-unusable",
          detail: "K.A.A. Gent 2024–1800: stored as 2024–(no end)",
        },
      ],
    );
  });

  it("flags an honour it leaves out because the winner has no club", () => {
    const pool = build(input());
    expect(
      pool.flags.filter((f) => f.kind === "honour-winner-unresolved"),
    ).toEqual([
      {
        subject: "Q999",
        kind: "honour-winner-unresolved",
        detail:
          "wikidata caf_cl 2011–2011: no club with a country for this winner",
      },
    ]);
  });

  describe("a curated honour replaces Wikidata for its season (fix round 1, finding 3)", () => {
    const by = { by: "jalel", at: "2026-10-05" };
    const replaced = (pool: ReturnType<typeof build>) =>
      pool.flags.filter((f) => f.kind === "honour-replaced-by-curated");

    it("replaces a Wikidata edition with another end year, with a flag naming both", () => {
      const pool = build({
        ...input(),
        honours: [
          {
            competition: "tn_cup",
            seasonStart: 2011,
            seasonEnd: 2011,
            winnerQid: "Q10",
          },
        ],
        curatedHonours: [
          {
            competition: "tn_cup",
            seasonStart: 2011,
            seasonEnd: 2012,
            clubWikidataId: "Q11",
            ...by,
          },
        ],
      });
      expect(
        pool.honours.map((h) => [
          h.competition,
          h.seasonStart,
          h.seasonEnd,
          h.clubId,
          h.source,
        ]),
      ).toEqual([["tn_cup", 2011, 2012, "cs-sfaxien", "curated"]]);
      expect(replaced(pool)).toEqual([
        {
          subject: "tn_cup 2011",
          kind: "honour-replaced-by-curated",
          detail:
            "wikidata 2011–2011 Q10 (esperance-sportive-de-tunis) replaced by curated 2011–2012 Q11 (cs-sfaxien)",
        },
      ]);
    });

    it("flags the replacement of the same edition too, even with no club for the Wikidata winner", () => {
      const pool = build({
        ...input(),
        honours: [
          {
            competition: "tn_ligue1",
            seasonStart: 2011,
            seasonEnd: 2012,
            winnerQid: "Q10",
          },
          {
            competition: "caf_cl",
            seasonStart: 2011,
            seasonEnd: 2011,
            winnerQid: "Q999",
          },
        ],
        curatedHonours: [
          {
            competition: "tn_ligue1",
            seasonStart: 2011,
            seasonEnd: 2012,
            clubWikidataId: "Q11",
            ...by,
          },
          {
            competition: "caf_cl",
            seasonStart: 2011,
            seasonEnd: 2011,
            clubWikidataId: "Q10",
            ...by,
          },
        ],
      });
      expect(replaced(pool).map((f) => f.detail)).toEqual([
        "wikidata 2011–2011 Q999 (no club) replaced by curated 2011–2011 Q10 (esperance-sportive-de-tunis)",
        "wikidata 2011–2012 Q10 (esperance-sportive-de-tunis) replaced by curated 2011–2012 Q11 (cs-sfaxien)",
      ]);
      expect(
        pool.flags.some((f) => f.kind === "honour-winner-unresolved"),
      ).toBe(false);
    });

    it("keeps two curated editions that start the same year (the two CAF editions of 2018)", () => {
      const pool = build({
        ...input(),
        honours: [
          {
            competition: "caf_cc",
            seasonStart: 2018,
            seasonEnd: 2018,
            winnerQid: "Q12",
          },
        ],
        curatedHonours: [
          {
            competition: "caf_cc",
            seasonStart: 2018,
            seasonEnd: 2018,
            clubWikidataId: "Q10",
            ...by,
          },
          {
            competition: "caf_cc",
            seasonStart: 2018,
            seasonEnd: 2019,
            clubWikidataId: "Q11",
            ...by,
          },
        ],
      });
      expect(
        pool.honours.map((h) => [
          h.seasonStart,
          h.seasonEnd,
          h.clubId,
          h.source,
        ]),
      ).toEqual([
        [2018, 2018, "esperance-sportive-de-tunis", "curated"],
        [2018, 2019, "cs-sfaxien", "curated"],
      ]);
      expect(replaced(pool)).toHaveLength(1);
    });

    it("keeps Wikidata's editions of seasons nobody curated", () => {
      const pool = build({
        ...input(),
        honours: [
          {
            competition: "tn_cup",
            seasonStart: 2012,
            seasonEnd: 2012,
            winnerQid: "Q10",
          },
        ],
        curatedHonours: [
          {
            competition: "tn_cup",
            seasonStart: 2011,
            seasonEnd: 2012,
            clubWikidataId: "Q11",
            ...by,
          },
        ],
      });
      expect(pool.honours.map((h) => [h.seasonStart, h.source])).toEqual([
        [2011, "curated"],
        [2012, "wikidata"],
      ]);
      expect(replaced(pool)).toEqual([]);
    });
  });

  describe("who was left out (fix round 1, finding 1)", () => {
    function withLeftOut(): BuildInput {
      const base = input();
      return {
        ...base,
        players: [
          ...base.players,
          wd("Q700", "Excluded One", "1995-01-01"),
          wd("Q800", "Few Caps", "1980-01-01"),
          wd("Q900", "Unread Caps", "1980-02-02"),
        ],
        memberships: new Map([
          ...base.memberships,
          [
            "Q800",
            [
              m("Q800", "Q27971", 2001, 2005, {
                national: true,
                apps: 8,
                goals: 0,
              }),
            ],
          ],
          ["Q900", [m("Q900", "Q27971", 2001, 2004, { national: true })]],
        ]),
        overrides: {
          players: {
            Q700: { exclude: { value: true, by: "jalel", at: "2026-10-05" } },
          },
          clubTitles: {},
        },
      };
    }

    it("lists every footballer left out, with the reason, by Wikidata number", () => {
      const pool = build(withLeftOut());
      expect(pool.dropped.map((d) => [d.wikidataId, d.name, d.reason])).toEqual(
        [
          ["Q500", "Old Reserve", "not-candidate"],
          ["Q600", "No Position", "missing-field"],
          ["Q700", "Excluded One", "excluded"],
          ["Q800", "Few Caps", "no-pool"],
          ["Q900", "Unread Caps", "no-pool"],
        ],
      );
    });

    it("keeps the merge flags of those the merge ran for: a former international whose caps are unknown", () => {
      const pool = build(withLeftOut());
      const flagsOf = (qid: string) =>
        pool.dropped
          .find((d) => d.wikidataId === qid)
          ?.flags.map((f) => f.kind);
      expect(flagsOf("Q700")).toEqual([]);
      expect(flagsOf("Q900")).toContain("caps-unknown");
      // Fix round 2, item 4: a non-candidate keeps no flags (the list stays light).
      expect(flagsOf("Q500")).toEqual([]);
      expect(
        pool.dropped
          .flatMap((d) => d.flags)
          .every((f) => f.subject.startsWith("Q")),
      ).toBe(true);
    });

    it("lists a footballer missing a field in dropped, with his merge flags and the missing fields (fix round 2, item 3)", () => {
      const pool = build(withLeftOut());
      const q600 = pool.dropped.find((d) => d.wikidataId === "Q600");
      expect(q600?.reason).toBe("missing-field");
      expect(q600?.flags.at(-1)).toEqual({
        subject: "Q600",
        kind: "dropped-missing-field",
        detail: "position",
      });
      expect(q600?.flags.length).toBeGreaterThan(1);
      expect(pool.flags.some((f) => f.subject === "Q600")).toBe(false);
    });

    it("names a footballer missing a field by his Arabic label when he has no Latin one", () => {
      const pool = build({
        ...withLeftOut(),
        players: [
          wd("Q600", "x", "1999-03-03", {
            nameEn: null,
            nameAr: "لاعب",
            positions: [],
          }),
        ],
      });
      expect(pool.dropped.map((d) => [d.wikidataId, d.name, d.reason])).toEqual(
        [["Q600", "لاعب", "missing-field"]],
      );
      expect(pool.dropped[0].flags.at(-1)?.detail).toBe("name, position");
    });

    it("names him by his Wikidata id when he has no label at all (fix round 3)", () => {
      const pool = build({
        ...withLeftOut(),
        players: [
          wd("Q600", "x", "1999-03-03", {
            nameEn: null,
            nameAr: null,
            positions: [],
          }),
        ],
      });
      expect(pool.dropped.map((d) => [d.wikidataId, d.name, d.reason])).toEqual(
        [["Q600", "Q600", "missing-field"]],
      );
    });
  });
  describe("ids are permanent (fix round 1, finding 2)", () => {
    const night = (players: WdPlayer[], ids: IdRegistry) =>
      buildPool({ ...input(), players, ids });
    const jaidi = wd("Q331918", "Radhi Jaïdi", "1975-08-30");
    const namesake = wd("Q777", "Radhi Jaïdi", "1976-01-01");
    const memberships = new Map([
      ...input().memberships,
      [
        "Q777",
        [
          m("Q777", "Q27971", 1998, 2006, {
            national: true,
            apps: 30,
            goals: 1,
          }),
        ],
      ],
    ]);
    const nightWith = (players: WdPlayer[], ids: IdRegistry) =>
      buildPool({ ...input(), players, ids, memberships });

    it("a namesake arriving after a footballer left does not take his id, and the footballer gets it back", () => {
      const first = night([jaidi], emptyRegistry());
      expect(first.pool.players.map((p) => p.id)).toEqual(["radhi-jaidi"]);
      const second = nightWith([namesake], first.ids);
      expect(second.pool.players.map((p) => [p.wikidataId, p.id])).toEqual([
        ["Q777", "radhi-jaidi-q777"],
      ]);
      const third = nightWith([namesake, jaidi], second.ids);
      expect(third.pool.players.map((p) => [p.wikidataId, p.id])).toEqual([
        ["Q331918", "radhi-jaidi"],
        ["Q777", "radhi-jaidi-q777"],
      ]);
    });

    it("the registry only grows, and is not changed in place", () => {
      const first = night([jaidi], emptyRegistry());
      const before = structuredClone(first.ids);
      const second = nightWith([namesake], first.ids);
      expect(first.ids).toEqual(before);
      expect(second.ids).toEqual({
        ...before,
        players: { ...before.players, Q777: "radhi-jaidi-q777" },
      });
      const third = nightWith([], second.ids);
      expect(third.ids).toEqual(second.ids);
    });
  });
  describe("club ids are permanent too (fix round 2, items 1 and 2)", () => {
    // Same name, another club (another article title).
    const gentTwo = {
      ...club("Q15", "K.A.A. Gent", "BE"),
      titleEn: "K.A.A. Gent (1900)",
    };
    const both = buildClubIndex(
      [esperance, sfaxien, gent, noCountry, minor, gentTwo],
      { en: new Map(), fr: new Map() },
      {},
    );
    const cup = (winnerQid: string) => ({
      competition: "caf_cc" as const,
      seasonStart: 2020,
      seasonEnd: 2020,
      winnerQid,
    });
    const clubNight = (
      ids: IdRegistry,
      players: WdPlayer[],
      honours: ReturnType<typeof cup>[],
    ) =>
      buildPool({
        ...input(),
        index: both,
        players,
        honours,
        curatedHonours: [],
        ligue1Titles: [],
        ids,
      });

    it("a namesake club arriving after a club left does not take its id, and the club gets it back", () => {
      const mejbri = input().players[1];
      const first = clubNight(emptyRegistry(), [mejbri], []);
      expect(first.pool.clubs.map((c) => [c.wikidataId, c.id])).toEqual([
        ["Q12", "k-a-a-gent"],
      ]);
      expect(first.ids.clubs).toEqual({ Q12: "k-a-a-gent" });
      const second = clubNight(first.ids, [], [cup("Q15")]);
      expect(second.pool.clubs.map((c) => [c.wikidataId, c.id])).toEqual([
        ["Q15", "k-a-a-gent-q15"],
      ]);
      const third = clubNight(second.ids, [mejbri], [cup("Q15")]);
      expect(third.pool.clubs.map((c) => [c.wikidataId, c.id])).toEqual([
        ["Q12", "k-a-a-gent"],
        ["Q15", "k-a-a-gent-q15"],
      ]);
      expect(third.ids.clubs).toEqual({
        Q12: "k-a-a-gent",
        Q15: "k-a-a-gent-q15",
      });
    });

    it("refuses a registry in which one id serves two footballers or two clubs", () => {
      expect(() =>
        buildPool({
          ...input(),
          ids: { players: { Q1: "ali", Q2: "ali" }, clubs: {} },
        }),
      ).toThrow("id registry: players id ali given to Q1 and Q2");
      expect(() =>
        buildPool({
          ...input(),
          ids: { players: {}, clubs: { Q1: "club", Q2: "club" } },
        }),
      ).toThrow("id registry: clubs id club given to Q1 and Q2");
    });

    it("seeds an empty registry from the previous pool", () => {
      const first = buildPool(input()).pool;
      const renamed = {
        ...first,
        players: first.players.map((p) =>
          p.wikidataId === "Q331918" ? { ...p, id: "jaidi" } : p,
        ),
        clubs: first.clubs.map((c) =>
          c.wikidataId === "Q12" ? { ...c, id: "gent" } : c,
        ),
      };
      const next = buildPool({
        ...input(),
        previous: renamed,
        ids: emptyRegistry(),
      });
      expect(
        next.pool.players.find((p) => p.wikidataId === "Q331918")?.id,
      ).toBe("jaidi");
      expect(next.pool.clubs.find((c) => c.wikidataId === "Q12")?.id).toBe(
        "gent",
      );
      expect(next.ids.players.Q331918).toBe("jaidi");
      expect(next.ids.clubs.Q12).toBe("gent");
    });

    it("seeds each empty namespace on its own (fix round 3)", () => {
      const first = buildPool(input()).pool;
      const renamed = {
        ...first,
        players: first.players.map((p) =>
          p.wikidataId === "Q331918" ? { ...p, id: "jaidi" } : p,
        ),
        clubs: first.clubs.map((c) =>
          c.wikidataId === "Q12" ? { ...c, id: "gent" } : c,
        ),
      };
      const clubsOnly = buildPool({
        ...input(),
        previous: renamed,
        ids: { players: { Q331918: "radhi" }, clubs: {} },
      });
      expect(clubsOnly.ids.clubs.Q12).toBe("gent");
      expect(clubsOnly.ids.players.Q331918).toBe("radhi");
      const playersOnly = buildPool({
        ...input(),
        previous: renamed,
        ids: { players: {}, clubs: { Q12: "kaa-gent" } },
      });
      expect(playersOnly.ids.players.Q331918).toBe("jaidi");
      expect(playersOnly.ids.clubs.Q12).toBe("kaa-gent");
    });
  });
  describe("a light left-out list, and no club for a replaced winner (fix round 2, items 4 and 6)", () => {
    it("keeps no flags for footballers who are not candidates", () => {
      const pool = build({
        ...input(),
        players: [wd("Q500", "Old Reserve", "1960-05-05")],
      });
      expect(pool.dropped).toEqual([
        {
          wikidataId: "Q500",
          name: "Old Reserve",
          reason: "not-candidate",
          flags: [],
        },
      ]);
    });

    it("does not add the winner of a replaced Wikidata honour to the clubs", () => {
      const pool = build({
        ...input(),
        players: [wd("Q331918", "Radhi Jaïdi", "1975-08-30")],
        honours: [
          {
            competition: "tn_cup",
            seasonStart: 2011,
            seasonEnd: 2011,
            winnerQid: "Q12",
          },
        ],
        curatedHonours: [
          {
            competition: "tn_cup",
            seasonStart: 2011,
            seasonEnd: 2012,
            clubWikidataId: "Q11",
            by: "jalel",
            at: "2026-10-05",
          },
        ],
        ligue1Titles: [],
      });
      expect(pool.clubs.map((c) => c.id)).toEqual(["cs-sfaxien"]);
      expect(
        pool.flags.find((f) => f.kind === "honour-replaced-by-curated")?.detail,
      ).toBe(
        "wikidata 2011–2011 Q12 (no club) replaced by curated 2011–2012 Q11 (cs-sfaxien)",
      );
    });
  });
  describe("a pools override adds a footballer (fix round 2, item 5)", () => {
    const by = { by: "jalel", at: "2026-10-05" };
    const legend = { pools: { value: { active: false, legend: true }, ...by } };
    const withOverrides = (
      players: WdPlayer[],
      overrides: BuildInput["overrides"]["players"],
    ) =>
      build({
        ...input(),
        players,
        overrides: { players: overrides, clubTitles: {} },
      });

    it("brings in a footballer who is not a candidate, with provenance override", () => {
      const pool = withOverrides([wd("Q500", "Old Reserve", "1960-05-05")], {
        Q500: legend,
      });
      expect(pool.players.map((p) => [p.id, p.pools])).toEqual([
        ["old-reserve", { active: false, legend: true }],
      ]);
      expect(pool.players[0].provenance.pools).toEqual({
        source: "override",
        retrievedAt: "2026-10-05",
        by: "jalel",
        confidence: "high",
        agreeing: ["override"],
        confidenceNote: "decided by Jalel",
      });
      expect(pool.dropped).toEqual([]);
    });

    it("drops him, visibly, as missing-field when he still lacks a position", () => {
      const pool = withOverrides(
        [wd("Q500", "Old Reserve", "1960-05-05", { positions: [] })],
        { Q500: legend },
      );
      expect(pool.players).toEqual([]);
      expect(
        pool.dropped.map((d) => [
          d.wikidataId,
          d.reason,
          d.flags.at(-1)?.detail,
        ]),
      ).toEqual([["Q500", "missing-field", "position"]]);
    });

    it("applies his other overrides first, so one can supply the missing field", () => {
      const pool = withOverrides(
        [wd("Q500", "Old Reserve", "1960-05-05", { positions: [] })],
        {
          Q500: { ...legend, position: { value: "goalkeeper", ...by } },
        },
      );
      expect(
        pool.players.map((p) => [
          p.id,
          p.position,
          p.provenance.position?.source,
        ]),
      ).toEqual([["old-reserve", "goalkeeper", "override"]]);
    });

    it("gives pools provenance only when an override decided them", () => {
      expect(
        build(input()).players.every((p) => p.provenance.pools === undefined),
      ).toBe(true);
    });
  });
});
