import { describe, expect, it } from "vitest";
import { buildClubIndex } from "./merge.ts";
import {
  ageOn,
  assignIds,
  buildPool,
  carryProvenance,
  isCandidate,
  poolsFor,
  type BuildInput,
} from "./pool.ts";
import type {
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
  const none = { caps: 0, hasClub: false };
  it("takes Tunisia internationals since 2000", () => {
    expect(
      isCandidate(
        wd("Q1", "A", "1978-01-01"),
        [m("Q1", "Q27971", 1998, 2005)],
        index,
        none,
      ),
    ).toBe(true);
    expect(
      isCandidate(
        wd("Q1", "A", "1965-01-01"),
        [m("Q1", "Q27971", 1988, 1996)],
        index,
        none,
      ),
    ).toBe(false);
  });
  it("takes footballers born in 1986 or later with an open Ligue 1 or foreign club", () => {
    expect(
      isCandidate(
        wd("Q1", "A", "1996-01-01"),
        [m("Q1", "Q12", 2020, null)],
        index,
        none,
      ),
    ).toBe(true);
    expect(
      isCandidate(
        wd("Q1", "A", "1996-01-01"),
        [m("Q1", "Q10", 2020, null)],
        index,
        none,
      ),
    ).toBe(true);
    expect(
      isCandidate(
        wd("Q1", "A", "1996-01-01"),
        [m("Q1", "Q14", 2020, null)],
        index,
        none,
      ),
    ).toBe(false);
    expect(
      isCandidate(
        wd("Q1", "A", "1980-01-01"),
        [m("Q1", "Q12", 2020, null)],
        index,
        none,
      ),
    ).toBe(false);
  });
  it("also takes infobox caps or a current club, and never a woman", () => {
    expect(
      isCandidate(wd("Q1", "A", "1980-01-01"), [], index, {
        caps: 3,
        hasClub: false,
      }),
    ).toBe(true);
    expect(
      isCandidate(wd("Q1", "A", "1999-01-01"), [], index, {
        caps: 0,
        hasClub: true,
      }),
    ).toBe(true);
    expect(
      isCandidate(
        wd("Q1", "A", "1996-01-01", { male: false }),
        [m("Q1", "Q12", 2020, null)],
        index,
        none,
      ),
    ).toBe(false);
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
    clubsAsOf: null,
    capsAsOf: null,
    skipped: [],
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
      ids: {},
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

  it("flags what it dropped and what it could not match", () => {
    const pool = build(input());
    expect(
      pool.flags.filter((f) =>
        ["dropped-missing-field", "ligue1-club-unresolved"].includes(f.kind),
      ),
    ).toEqual([
      { subject: "Q600", kind: "dropped-missing-field", detail: "position" },
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
      ids: { ...first.ids, Q331918: "jaidi" },
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
      expect(flagsOf("Q500")).toContain("caps-unknown");
      expect(
        pool.dropped
          .flatMap((d) => d.flags)
          .every((f) => f.subject.startsWith("Q")),
      ).toBe(true);
    });

    it("keeps the merge flags of a footballer dropped for a missing field", () => {
      const pool = build(withLeftOut());
      expect(
        pool.flags.filter((f) => f.subject === "Q600").map((f) => f.kind),
      ).toContain("dropped-missing-field");
      expect(
        pool.flags.filter((f) => f.subject === "Q600").length,
      ).toBeGreaterThan(1);
    });
  });
  describe("ids are permanent (fix round 1, finding 2)", () => {
    const night = (players: WdPlayer[], ids: Record<string, string>) =>
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
    const nightWith = (players: WdPlayer[], ids: Record<string, string>) =>
      buildPool({ ...input(), players, ids, memberships });

    it("a namesake arriving after a footballer left does not take his id, and the footballer gets it back", () => {
      const first = night([jaidi], {});
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
      const first = night([jaidi], {});
      const before = { ...first.ids };
      const second = nightWith([namesake], first.ids);
      expect(first.ids).toEqual(before);
      expect(second.ids).toEqual({ ...before, Q777: "radhi-jaidi-q777" });
      const third = nightWith([], second.ids);
      expect(third.ids).toEqual(second.ids);
    });
  });
});
