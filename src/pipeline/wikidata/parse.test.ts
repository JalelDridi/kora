import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  fileFromImage,
  parseAliases,
  parseClubs,
  parseHonours,
  parseHonoursReport,
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

  it("orders positions by their Wikidata id, whatever order the query returns", () => {
    const parse = (positions: string) =>
      parsePlayers(result({ p: uri("Q1"), positions: lit(positions) }))[0]
        .positions;
    const a = parse("Q1930187=striker|Q336286=defender|Q193592=midfielder");
    const b = parse("Q336286=defender|Q193592=midfielder|Q1930187=striker");
    expect(a).toEqual(["midfielder", "defender", "striker"]);
    expect(b).toEqual(a);
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
    const report = parseHonoursReport(
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
        {
          compName: lit("Tunisian Cup"),
          seasonLabel: lit("1999–2000 Tunisian Cup"),
          winner: uri("Q301"),
        },
      ),
    );
    expect(report).toEqual({
      honours: [
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
      ],
      issues: [],
      skipped: { unlabelled: 0, noStart: 0 },
    });
  });

  it("reads slash labels like dash labels", () => {
    expect(
      parseHonoursReport(
        result(
          {
            compName: lit("Tunisian Cup"),
            seasonLabel: lit("2018/19 Tunisian Cup"),
            winner: uri("Q300"),
          },
          {
            compName: lit("Tunisian Ligue Professionnelle 1"),
            seasonLabel: lit("2018/2019 Tunisian Ligue Professionnelle 1"),
            winner: uri("Q301"),
          },
        ),
      ),
    ).toEqual({
      honours: [
        {
          competition: "tn_cup",
          seasonStart: 2018,
          seasonEnd: 2019,
          winnerQid: "Q300",
        },
        {
          competition: "tn_ligue1",
          seasonStart: 2018,
          seasonEnd: 2019,
          winnerQid: "Q301",
        },
      ],
      issues: [],
      skipped: { unlabelled: 0, noStart: 0 },
    });
  });

  it("reports an end date out of range and falls back to the label", () => {
    const report = parseHonoursReport(
      result({
        compName: lit("Tunisian Cup"),
        season: uri("Q4000"),
        seasonLabel: lit("2013-14 Tunisian Cup"),
        end: lit("2025-01-01T00:00:00Z"),
        winner: uri("Q300"),
      }),
    );
    expect(report.honours).toEqual([
      {
        competition: "tn_cup",
        seasonStart: 2013,
        seasonEnd: 2014,
        winnerQid: "Q300",
      },
    ]);
    expect(report.issues).toEqual([
      {
        kind: "end-out-of-range",
        competition: "tn_cup",
        seasonStart: 2013,
        detail:
          '"2013-14 Tunisian Cup" (Q4000): end date year 2025 is neither 2013 nor 2014; stored end 2014, from the label',
      },
    ]);
  });

  it("reports a label whose end year cannot be read, and the single-year label it does not", () => {
    const report = parseHonoursReport(
      result(
        {
          compName: lit("CAF Champions League"),
          season: uri("Q4001"),
          seasonLabel: lit("CAF Champions League, season of 2018"),
          start: lit("2018-11-27T00:00:00Z"),
          winner: uri("Q200"),
        },
        {
          compName: lit("CAF Confederation Cup"),
          seasonLabel: lit("2007 CAF Confederation Cup"),
          winner: uri("Q201"),
        },
      ),
    );
    expect(report.honours).toEqual([
      {
        competition: "caf_cc",
        seasonStart: 2007,
        seasonEnd: 2007,
        winnerQid: "Q201",
      },
      {
        competition: "caf_cl",
        seasonStart: 2018,
        seasonEnd: 2018,
        winnerQid: "Q200",
      },
    ]);
    expect(report.issues).toEqual([
      {
        kind: "label-unreadable",
        competition: "caf_cl",
        seasonStart: 2018,
        detail:
          '"CAF Champions League, season of 2018" (Q4001): no end year in the label, so the end is the start year 2018',
      },
    ]);
  });

  it("keeps the lowest Q-id among an edition's winners, whatever the row order", () => {
    const row = {
      compName: lit("Tunisian Ligue Professionnelle 1"),
      seasonLabel: lit("2012–13 Tunisian Ligue Professionnelle 1"),
    };
    const rows = [
      { ...row, winner: uri("Q900") },
      { ...row, winner: uri("Q100") },
      { ...row, winner: uri("Q2000") },
      { ...row, winner: uri("Q100") },
    ];
    const forward = parseHonoursReport(result(...rows));
    const backward = parseHonoursReport(result(...[...rows].reverse()));
    expect(forward.honours).toEqual([
      {
        competition: "tn_ligue1",
        seasonStart: 2012,
        seasonEnd: 2013,
        winnerQid: "Q100",
      },
    ]);
    expect(forward.issues).toEqual([
      {
        kind: "duplicate-edition",
        competition: "tn_ligue1",
        seasonStart: 2012,
        detail:
          '"2012–13 Tunisian Ligue Professionnelle 1": edition 2012–2013 has winners Q100, Q900, Q2000; kept Q100',
      },
    ]);
    expect(backward).toEqual(forward);
  });

  it("states the start year as the stored end when neither date nor label gives one", () => {
    const report = parseHonoursReport(
      result({
        compName: lit("CAF Confederation Cup"),
        season: uri("Q4002"),
        seasonLabel: lit("2007 CAF Confederation Cup"),
        end: lit("2010-01-01T00:00:00Z"),
        winner: uri("Q201"),
      }),
    );
    expect(report.issues).toEqual([
      {
        kind: "end-out-of-range",
        competition: "caf_cc",
        seasonStart: 2007,
        detail:
          '"2007 CAF Confederation Cup" (Q4002): end date year 2010 is neither 2007 nor 2008; stored end 2007, the start year',
      },
    ]);
  });

  it("counts the seasons it drops for a missing label or a missing start", () => {
    const report = parseHonoursReport(
      result(
        // No English label: counted once per season, not per row.
        {
          compName: lit("Tunisian Cup"),
          season: uri("Q5001"),
          winner: uri("Q300"),
        },
        {
          compName: lit("Tunisian Cup"),
          season: uri("Q5001"),
          winner: uri("Q301"),
        },
        // The label is only the season's id.
        {
          compName: lit("Tunisian Cup"),
          season: uri("Q5002"),
          seasonLabel: lit("Q5002"),
          winner: uri("Q300"),
        },
        // No start date and no year at the start of the label.
        {
          compName: lit("CAF Champions League"),
          season: uri("Q5003"),
          seasonLabel: lit("CAF Champions League final"),
          winner: uri("Q200"),
        },
      ),
    );
    expect(report).toEqual({
      honours: [],
      issues: [],
      skipped: { unlabelled: 2, noStart: 1 },
    });
  });

  it("says nothing about rows that SPARQL merely repeats", () => {
    const row = {
      compName: lit("Tunisian Ligue Professionnelle 1"),
      seasonLabel: lit("2012–13 Tunisian Ligue Professionnelle 1"),
      winner: uri("Q100"),
    };
    expect(parseHonoursReport(result(row, row))).toEqual({
      honours: [
        {
          competition: "tn_ligue1",
          seasonStart: 2012,
          seasonEnd: 2013,
          winnerQid: "Q100",
        },
      ],
      issues: [],
      skipped: { unlabelled: 0, noStart: 0 },
    });
    expect(parseHonours(result(row, row))).toHaveLength(1);
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
