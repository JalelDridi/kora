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
  it("keeps earlier ids, then gives slugs, adding the Wikidata id on a clash", () => {
    const ids = assignIds(
      [
        { key: "Q5", name: "Ali Abdi" },
        { key: "Q9", name: "Ali Abdi" },
        { key: "Q7", name: "Wahbi Khazri" },
      ],
      new Map([["Q7", "khazri"]]),
    );
    expect(Object.fromEntries(ids)).toEqual({
      Q5: "ali-abdi",
      Q9: "ali-abdi-q9",
      Q7: "khazri",
    });
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
    };
  }

  it("keeps footballers in at least one pool, with ids, clubs and honours", () => {
    const pool = buildPool(input());

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
    const pool = buildPool(input());
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

  it("keeps ids and first-read dates from the previous pool", () => {
    const first = buildPool(input());
    const renamed = {
      ...first,
      players: first.players.map((p) =>
        p.wikidataId === "Q331918" ? { ...p, id: "jaidi" } : p,
      ),
    };
    const second = buildPool({
      ...input(),
      today: "2026-10-05",
      previous: renamed,
    });
    const jaidi = second.players.find((p) => p.wikidataId === "Q331918");
    expect(jaidi?.id).toBe("jaidi");
    expect(jaidi?.provenance.caps?.retrievedAt).toBe(today);
  });

  it("flags spell years the database cannot hold instead of dropping them silently", () => {
    const pool = buildPool(input());
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
    const pool = buildPool(input());
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

  it("keeps a Wikidata honour and a curated one for different editions of the same start year", () => {
    const pool = buildPool({
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
          by: "jalel",
          at: "2026-10-05",
        },
      ],
    });
    expect(
      pool.honours.map((h) => [h.seasonStart, h.seasonEnd, h.clubId, h.source]),
    ).toEqual([
      [2011, 2011, "esperance-sportive-de-tunis", "wikidata"],
      [2011, 2012, "cs-sfaxien", "curated"],
    ]);
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
      const pool = buildPool(withLeftOut());
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
      const pool = buildPool(withLeftOut());
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
      const pool = buildPool(withLeftOut());
      expect(
        pool.flags.filter((f) => f.subject === "Q600").map((f) => f.kind),
      ).toContain("dropped-missing-field");
      expect(
        pool.flags.filter((f) => f.subject === "Q600").length,
      ).toBeGreaterThan(1);
    });
  });
});
