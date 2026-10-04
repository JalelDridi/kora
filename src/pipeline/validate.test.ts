import { describe, expect, it } from "vitest";
import type { Pool, PoolPlayer } from "./types.ts";
import { validateIdRegistry, validatePool } from "./validate.ts";

const player: PoolPlayer = {
  id: "ali-maaloul",
  wikidataId: "Q2836275",
  nameLatin: "Ali Maâloul",
  nameArabic: null,
  nameFrench: null,
  aliases: [],
  position: "defender",
  positionDetail: null,
  birthDate: "1990-01-01",
  birthPlace: "Sfax",
  birthCountry: "TN",
  governorate: "sfax",
  clubId: "cs-sfaxien",
  caps: 80,
  goals: 1,
  capsAsOf: "2026-09-01",
  history: [
    {
      clubId: "cs-sfaxien",
      clubName: "CS Sfaxien",
      from: 2010,
      to: 2016,
      apps: null,
      goals: null,
      loan: false,
    },
  ],
  photo: null,
  wiki: { en: null, fr: null, ar: null },
  pools: { active: true, legend: true },
  provenance: {},
};
const pool: Pool = {
  version: 1,
  players: [player],
  clubs: [
    {
      id: "cs-sfaxien",
      wikidataId: "Q1",
      nameLatin: "CS Sfaxien",
      nameArabic: null,
      nameFrench: null,
      country: "TN",
      confederation: "CAF",
      leagueWikidataId: null,
      ligue1: true,
    },
  ],
  honours: [
    {
      competition: "tn_ligue1",
      seasonStart: 2012,
      seasonEnd: 2013,
      clubId: "cs-sfaxien",
      source: "wikidata",
    },
  ],
  flags: [],
  dropped: [],
};
const governorates = new Set(["sfax"]);

describe("validatePool", () => {
  it("accepts a valid pool", () => {
    expect(validatePool(pool, governorates)).toEqual([]);
  });

  it("names each broken rule", () => {
    const broken: Pool = {
      ...pool,
      players: [
        {
          ...player,
          clubId: "nowhere",
          birthCountry: "FR",
          photo: {
            file: "File:x.jpg",
            thumbUrl: "u",
            width: 1,
            height: 1,
            licence: "",
            licenceUrl: null,
            author: null,
            sourceUrl: "",
            attributionRequired: true,
          },
        },
        {
          ...player,
          history: [{ ...player.history[0], from: 2016, to: 2010 }],
          pools: { active: false, legend: false },
        },
      ],
    };
    expect(validatePool(broken, governorates)).toEqual([
      "player ali-maaloul: unknown club nowhere",
      "player ali-maaloul: governorate sfax but born in FR",
      "player ali-maaloul: photo without licence or source page",
      "player ali-maaloul: duplicate id",
      "player ali-maaloul: duplicate Wikidata id Q2836275",
      "player ali-maaloul: spell at CS Sfaxien ends before it starts",
      "player ali-maaloul: in neither pool",
    ]);
  });

  it("rejects something that is not a pool", () => {
    expect(validatePool({ version: 2 }, governorates)).toEqual([
      "not a version 1 pool",
    ]);
  });

  it("requires a confidence and its sources on every provenance entry (P26)", () => {
    const base = { source: "frwiki" as const, retrievedAt: "2026-10-04" };
    const rated = {
      ...player,
      provenance: {
        caps: {
          ...base,
          confidence: "medium" as const,
          agreeing: ["frwiki" as const],
        },
      },
    };
    expect(validatePool({ ...pool, players: [rated] }, governorates)).toEqual(
      [],
    );
    const bare = {
      ...player,
      provenance: {
        caps: base,
        clubId: { ...base, confidence: "high" as const, agreeing: [] },
      },
    };
    expect(validatePool({ ...pool, players: [bare] }, governorates)).toEqual([
      "player ali-maaloul: caps has no confidence",
      "player ali-maaloul: clubId names no agreeing source",
    ]);
  });

  it("accepts a placeholder that no source gives, rated low (Task 6)", () => {
    const placeholder = {
      ...player,
      provenance: {
        caps: {
          source: "none" as const,
          retrievedAt: "2026-10-04",
          confidence: "low" as const,
          agreeing: ["none" as const],
        },
      },
    };
    expect(
      validatePool({ ...pool, players: [placeholder] }, governorates),
    ).toEqual([]);
  });

  it("checks each edition's end year and refuses the same edition twice, as the database does", () => {
    const honour = pool.honours[0];
    const honours = [
      { ...honour, seasonStart: 2018, seasonEnd: 2018 },
      { ...honour, seasonStart: 2019, seasonEnd: 2021 },
      { ...honour, seasonStart: 2020, seasonEnd: 2019 },
      honour,
      honour,
    ];
    expect(validatePool({ ...pool, honours }, governorates)).toEqual([
      "honour tn_ligue1 2019–2021: invalid",
      "honour tn_ligue1 2020–2019: invalid",
      "honour tn_ligue1 2012–2013: duplicate edition",
    ]);
  });
  it("checks the left-out list: shape, reasons, and nobody both in and out (fix round 1)", () => {
    const left = {
      wikidataId: "Q5",
      name: "Gone",
      reason: "no-pool" as const,
      flags: [],
    };
    expect(validatePool({ ...pool, dropped: [left] }, governorates)).toEqual(
      [],
    );
    expect(
      validatePool(
        {
          ...pool,
          dropped: [
            { ...left, wikidataId: "Q2836275" },
            { ...left, reason: "gone" },
            null,
            { ...left, flags: "x" },
          ],
        },
        governorates,
      ),
    ).toEqual([
      "dropped row 3: not an object",
      "dropped Q2836275: also in the pool",
      "dropped Q5: reason gone",
      "dropped Q5: needs a Wikidata id, a name and a list of flags",
    ]);
    const withoutList = { ...pool, dropped: undefined };
    expect(validatePool(withoutList, governorates)).toEqual([
      "not a version 1 pool",
    ]);
  });

  it("names a row that is not an object instead of failing", () => {
    expect(
      validatePool(
        {
          ...pool,
          players: [null],
          clubs: [...pool.clubs, 7],
          honours: [null],
        },
        governorates,
      ),
    ).toEqual([
      "club row 2: not an object",
      "player row 1: not an object",
      "honour row 1: not an object",
    ]);
  });
});

describe("the id registry (fix round 1, finding 2)", () => {
  it("requires each footballer's id to be his registered one", () => {
    expect(
      validatePool(pool, governorates, { Q2836275: "ali-maaloul" }),
    ).toEqual([]);
    expect(validatePool(pool, governorates, { Q2836275: "maaloul" })).toEqual([
      "player ali-maaloul: id differs from data/ids.json (maaloul)",
    ]);
    expect(validatePool(pool, governorates, {})).toEqual([
      "player ali-maaloul: no entry in data/ids.json",
    ]);
  });

  it("refuses an id given to two footballers, and a malformed registry", () => {
    expect(validateIdRegistry({ Q1: "ali-abdi", Q2: "wahbi-khazri" })).toEqual(
      [],
    );
    expect(
      validateIdRegistry({
        Q1: "ali-abdi",
        Q2: "ali-abdi",
        x: "y",
        Q3: "Not A Slug",
      }),
    ).toEqual([
      "x: not a Wikidata id with an id",
      "Q3: not a Wikidata id with an id",
      "id ali-abdi given to Q1 and Q2",
    ]);
    expect(validateIdRegistry([])).toEqual([
      "must be an object of Wikidata id to id",
    ]);
  });
});
