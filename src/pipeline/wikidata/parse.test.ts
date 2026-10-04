import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  fileFromImage,
  parseAliases,
  parseClubs,
  parseHonours,
  parseMemberships,
  parsePlayers,
} from "./parse.ts";

const uri = (id: string) => ({
  type: "uri",
  value: `http://www.wikidata.org/entity/${id}`,
});
const lit = (value: string) => ({ type: "literal", value });
const result = (...bindings: object[]) => ({ results: { bindings } });

describe("parsePlayers", () => {
  it("reads one row per player", () => {
    const [player] = parsePlayers(
      result({
        p: uri("Q27794"),
        enLabel: lit("Wahbi Khazri"),
        arLabel: lit("وهبي الخزري"),
        birth: lit("1991-02-08T00:00:00Z"),
        positions: lit("midfielder|forward"),
        birthPlace: uri("Q40104"),
        birthPlaceName: lit("Ajaccio"),
        birthCountry: lit("fr"),
        image: {
          type: "uri",
          value:
            "http://commons.wikimedia.org/wiki/Special:FilePath/Wahbi%20Khazri_2018.jpg",
        },
        enwiki: lit("Wahbi Khazri"),
      }),
    );
    expect(player).toEqual({
      qid: "Q27794",
      nameEn: "Wahbi Khazri",
      nameFr: null,
      nameAr: "وهبي الخزري",
      aliases: [],
      male: true,
      birthDate: "1991-02-08",
      positions: ["midfielder", "forward"],
      birthPlaceQid: "Q40104",
      birthPlaceName: "Ajaccio",
      birthCountry: "FR",
      governorates: [],
      imageFile: "File:Wahbi Khazri 2018.jpg",
      titles: { en: "Wahbi Khazri", fr: null, ar: null },
    });
  });

  it("knows women from P21", () => {
    const [player] = parsePlayers(
      result({ p: uri("Q9"), gender: uri("Q6581072") }),
    );
    expect(player.male).toBe(false);
  });

  it("finds the recorded players with their titles", () => {
    const players = parsePlayers(
      JSON.parse(
        readFileSync("src/pipeline/wikidata/__fixtures__/players.json", "utf8"),
      ),
    );
    const khazri = players.find((p) => p.qid === "Q27794");
    expect(khazri?.titles.en).toBe("Wahbi Khazri");
    expect(khazri?.nameAr).not.toBeNull();
  });

  it("refuses something that is not a SPARQL result", () => {
    expect(() => parsePlayers({ error: "timeout" })).toThrow(/SPARQL/);
  });
});

describe("parseMemberships", () => {
  it("dedupes rows multiplied by leagues and reads an unknown end as ended", () => {
    const row = {
      p: uri("Q1"),
      team: uri("Q2"),
      teamEn: lit("CS Sfaxien"),
      start: lit("2010-01-01T00:00:00Z"),
      end: { type: "bnode", value: "t123" },
    };
    expect(
      parseMemberships(
        result(row, row, {
          p: uri("Q1"),
          team: uri("Q27971"),
          apps: lit("74"),
          goals: lit("25"),
          isNational: lit("1"),
        }),
      ),
    ).toEqual([
      {
        playerQid: "Q1",
        teamQid: "Q2",
        teamName: "CS Sfaxien",
        start: 2010,
        end: null,
        endUnknown: true,
        apps: null,
        goals: null,
        national: false,
      },
      {
        playerQid: "Q1",
        teamQid: "Q27971",
        teamName: null,
        start: null,
        end: null,
        endUnknown: false,
        apps: 74,
        goals: 25,
        national: true,
      },
    ]);
  });
});

describe("parseClubs, parseAliases, parseHonours", () => {
  it("keeps the first row per club", () => {
    const clubs = parseClubs(
      result(
        {
          club: uri("Q5"),
          en: lit("Burnley F.C."),
          iso: lit("GB"),
          leagues: lit("Q9448"),
          enTitle: lit("Burnley F.C."),
        },
        { club: uri("Q5"), en: lit("Burnley F.C."), iso: lit("XX") },
      ),
    );
    expect(clubs).toEqual([
      {
        qid: "Q5",
        nameEn: "Burnley F.C.",
        nameFr: null,
        nameAr: null,
        country: "GB",
        leagues: ["Q9448"],
        titleEn: "Burnley F.C.",
        titleFr: null,
      },
    ]);
  });

  it("groups aliases per player", () => {
    expect(
      parseAliases(result({ p: uri("Q1"), aliases: lit("Maaloul|معلول") })),
    ).toEqual([["Q1", ["Maaloul", "معلول"]]]);
  });

  it("reads winners by competition and season, skipping unlabelled seasons", () => {
    const honours = parseHonours(
      result(
        {
          compName: lit("Tunisian Ligue Professionnelle 1"),
          seasonLabel: lit("2012–13 Tunisian Ligue Professionnelle 1"),
          winner: uri("Q100"),
        },
        {
          compName: lit("CAF Champions League"),
          seasonLabel: lit("2018–19 CAF Champions League"),
          start: lit("2018-11-27T00:00:00Z"),
          winner: uri("Q200"),
        },
        {
          compName: lit("Tunisian Cup"),
          seasonLabel: lit("Q138900001"),
          winner: uri("Q300"),
        },
        {
          compName: lit("Africa Cup of Nations"),
          seasonLabel: lit("2004 Africa Cup of Nations"),
          winner: uri("Q948"),
        },
      ),
    );
    expect(honours).toEqual([
      {
        competition: "caf_cl",
        seasonStart: 2018,
        seasonEnd: 2019,
        winnerQid: "Q200",
      },
      {
        competition: "tn_ligue1",
        seasonStart: 2012,
        seasonEnd: 2013,
        winnerQid: "Q100",
      },
    ]);
  });

  it("keeps two editions that start in the same year, ending by date, label or start", () => {
    const honours = parseHonours(
      result(
        {
          compName: lit("CAF Champions League"),
          seasonLabel: lit("2018–19 CAF Champions League"),
          start: lit("2018-11-27T00:00:00Z"),
          end: lit("2019-05-31T00:00:00Z"),
          winner: uri("Q44897"),
        },
        {
          compName: lit("CAF Champions League"),
          seasonLabel: lit("2018 CAF Champions League"),
          start: lit("2018-02-09T00:00:00Z"),
          winner: uri("Q44897"),
        },
        {
          compName: lit("CAF Confederation Cup"),
          seasonLabel: lit("2007 CAF Confederation Cup"),
          end: lit("2007-11-24T00:00:00Z"),
          winner: uri("Q1024482"),
        },
        // An end date out of reach of the start falls back to the label.
        {
          compName: lit("Tunisian Cup"),
          seasonLabel: lit("2013-14 Tunisian Cup"),
          end: lit("2025-01-01T00:00:00Z"),
          winner: uri("Q300"),
        },
        {
          compName: lit("Tunisian Cup"),
          seasonLabel: lit("1999–2000 Tunisian Cup"),
          winner: uri("Q301"),
        },
      ),
    );
    expect(honours).toEqual([
      {
        competition: "caf_cc",
        seasonStart: 2007,
        seasonEnd: 2007,
        winnerQid: "Q1024482",
      },
      {
        competition: "caf_cl",
        seasonStart: 2018,
        seasonEnd: 2018,
        winnerQid: "Q44897",
      },
      {
        competition: "caf_cl",
        seasonStart: 2018,
        seasonEnd: 2019,
        winnerQid: "Q44897",
      },
      {
        competition: "tn_cup",
        seasonStart: 1999,
        seasonEnd: 2000,
        winnerQid: "Q301",
      },
      {
        competition: "tn_cup",
        seasonStart: 2013,
        seasonEnd: 2014,
        winnerQid: "Q300",
      },
    ]);
  });
});

describe("fileFromImage", () => {
  it("turns a Special:FilePath URL into a file title", () => {
    expect(
      fileFromImage(
        "http://commons.wikimedia.org/wiki/Special:FilePath/A%C3%AFssa_Laidouni.jpg",
      ),
    ).toBe("File:Aïssa Laidouni.jpg");
  });
});
