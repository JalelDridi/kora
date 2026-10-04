import { describe, expect, it } from "vitest";
import {
  ANSWER_READY_SQL,
  capForSkipped,
  capsCeiling,
  CHKOUN_FIELDS,
  rateCount,
  rateDated,
  rateFields,
  rateUndated,
  type Chosen,
  type Evidence,
  type Rating,
  type Vote,
} from "./confidence.ts";
import type { Match, SourceId } from "./types.ts";

// Rows of .superpowers/research/data-confidence-sheet.csv, carried inline.
const today = "2026-10-04";
const v = <T>(
  source: SourceId,
  value: T,
  asOf: string | null = null,
): Vote<T> => ({ source, value, asOf });
const same = (a: string | null, b: string | null) => a === b;
type Case<T> = [
  name: string,
  votes: Vote<T>[],
  chosen: number,
  expected: Partial<Rating>,
  floor?: number,
];
const counts: Case<number>[] = [
  [
    "high: Wahbi Khazri caps, en 74 undated, fr 74 (2025-07-01), Wikidata 74",
    [v("enwiki", 74), v("frwiki", 74, "2025-07-01"), v("wikidata", 74)],
    1,
    { confidence: "high", agreeing: ["enwiki", "frwiki", "wikidata"] },
  ],
  [
    "medium: Ferjani Sassi caps, fr 104 (2026-09-28) over older, lower en 101 and Wikidata 94",
    [
      v("enwiki", 101, "2026-01-03"),
      v("frwiki", 104, "2026-09-28"),
      v("wikidata", 94),
    ],
    1,
    { confidence: "medium", agreeing: ["frwiki"] },
  ],
  [
    "low: Aymen Abdennour caps, fr 57 alone and over 12 months old",
    [v("enwiki", 53, "2023-01-08"), v("frwiki", 57, "2024-09-19")],
    1,
    {
      confidence: "low",
      agreeing: ["frwiki"],
      confidenceNote: "one source, as of 2024-09-19",
    },
  ],
  [
    "low, newer but lower: Yassine Meriah caps, fr 93 (2026-09-27) under en 95 undated",
    [v("enwiki", 95), v("frwiki", 93, "2026-09-27")],
    1,
    { confidence: "low", confidenceNote: "enwiki 95 (undated) is higher" },
  ],
  [
    "low, newer but lower: Elias Achouri goals, fr 4 (2026-09-28) under en 5 (2026-06-26)",
    [v("enwiki", 5, "2026-06-26"), v("frwiki", 4, "2026-09-28")],
    1,
    { confidence: "low" },
  ],
  [
    "the floor never confirms: Youssef Msakni goals 23, martj42 floor 12",
    [v("enwiki", 23), v("frwiki", 23, "2026-07-26")],
    1,
    { confidence: "high", agreeing: ["enwiki", "frwiki"] },
    12,
  ],
  [
    "low under the floor: Msakni's row with goals edited to 11 (the sheet has no real case)",
    [v("enwiki", 11), v("frwiki", 11, "2026-07-26")],
    1,
    { confidence: "low", confidenceNote: "martj42 lists 12 goals by him" },
    12,
  ],
];
const clubs: Case<string | null>[] = [
  [
    "high: Mouez Hassen, en and fr Red Star; Wikidata's stale Cercle Brugge ignored",
    [
      v("enwiki", "Red Star", "2024-10-02"),
      v("frwiki", "Red Star", "2026-01-06"),
      v("wikidata", "Cercle Brugge"),
    ],
    1,
    { confidence: "high" },
  ],
  [
    "medium: Mohamed Ali Ben Romdhane, fr Al-Shamal (2026-09-28), en Al Ahly 146 days older",
    [
      v("enwiki", "Al Ahly", "2026-05-05"),
      v("frwiki", "Al-Shamal", "2026-09-28"),
      v("wikidata", "Ferencváros"),
    ],
    1,
    { confidence: "medium", agreeing: ["frwiki"] },
  ],
  [
    "low: Firas Chaouat, fr Al Ahly Benghazi (2026-09-11), en no club 44 days earlier",
    [
      v("enwiki", null, "2026-07-29"),
      v("frwiki", "Al Ahly Benghazi", "2026-09-11"),
    ],
    1,
    { confidence: "low" },
  ],
  [
    "low: Naïm Sliti, en Al Ahli (2026-04-27) chosen while the newer fr names no club",
    [
      v("enwiki", "Al Ahli", "2026-04-27"),
      v("frwiki", null, "2026-08-03"),
      v("wikidata", "Al Ahli"),
    ],
    0,
    { confidence: "low", confidenceNote: "frwiki none (2026-08-03) is newer" },
  ],
];
const undated: Case<string>[] = [
  [
    "high: Aymen Abdennour born 1989-08-06 in Wikidata, en and fr",
    [
      v("wikidata", "1989-08-06"),
      v("enwiki", "1989-08-06"),
      v("frwiki", "1989-08-06"),
    ],
    0,
    { confidence: "high" },
  ],
  [
    "low: a birth date from Wikidata alone (every one without Step 6.0)",
    [v("wikidata", "1989-08-06")],
    0,
    { confidence: "low", agreeing: ["wikidata"], confidenceNote: "one source" },
  ],
  [
    "low: Yassine Meriah's line, Wikidata midfielder chosen (D-S1-7) against en and fr defender",
    [
      v("wikidata", "midfielder"),
      v("enwiki", "defender"),
      v("frwiki", "defender"),
    ],
    0,
    { confidence: "low" },
  ],
  [
    "medium: Wahbi Khazri's line if the majority were chosen (en, fr midfielder; Wikidata forward)",
    [
      v("wikidata", "forward"),
      v("enwiki", "midfielder"),
      v("frwiki", "midfielder"),
    ],
    1,
    { confidence: "medium", agreeing: ["enwiki", "frwiki"] },
  ],
];
describe("P26 levels on real rows", () => {
  it.each(counts)("caps/goals %s", (_, votes, i, expected, floor) =>
    expect(rateCount({ chosen: votes[i], votes, today, floor })).toMatchObject(
      expected,
    ),
  );
  it.each(clubs)("club %s", (_, votes, i, expected) =>
    expect(rateDated({ chosen: votes[i], votes, today, same })).toMatchObject(
      expected,
    ),
  );
  it.each(undated)("undated %s", (_, votes, i, expected) =>
    expect(rateUndated({ chosen: votes[i], votes })).toMatchObject(expected),
  );
});
describe("ceiling and skipped rows", () => {
  const match = (date: string): Match => ({
    date,
    home: "Tunisia",
    away: "X",
    homeScore: 1,
    awayScore: 0,
    tournament: "Friendly",
  });
  it("counts the matches in the national years, and gives up when the file does not cover them", () => {
    const matches = [
      "2014-05-01",
      "2015-03-01",
      "2016-06-01",
      "2026-06-25",
    ].map(match);
    expect([
      capsCeiling(matches, 2015, 2016, null),
      capsCeiling(matches, 2015, null, "2026-09-27"),
      capsCeiling(matches, 2010, 2016, null),
    ]).toEqual([2, null, null]);
    expect(
      rateCount({
        chosen: v("enwiki", 3, "2017-01-01"),
        votes: [],
        today,
        ceiling: 2,
      }).confidence,
    ).toBe("low");
  });
  it("keeps high only with two sources that skipped nothing", () => {
    const high: Rating = { confidence: "high", agreeing: ["enwiki", "frwiki"] };
    expect(capForSkipped(high, ["frwiki"]).confidence).toBe("medium");
    expect(
      capForSkipped({ ...high, agreeing: ["enwiki", "frwiki", "wikidata"] }, [
        "frwiki",
      ]).confidence,
    ).toBe("high");
    expect(capForSkipped(high, [])).toBe(high);
  });
});

// Fix round 1, finding 3: a missing entry means not ready (P27). The query
// itself runs against Postgres in Task 9.
describe("ANSWER_READY_SQL", () => {
  it("requires an entry for every Chkoun? field, and none of them low", () => {
    for (const field of CHKOUN_FIELDS)
      expect(ANSWER_READY_SQL).toContain(`'${field}'`);
    expect(ANSWER_READY_SQL).toContain("p.provenance ?& ARRAY[");
    expect(ANSWER_READY_SQL).toContain("e.entry->>'confidence' = 'low'");
    expect(ANSWER_READY_SQL).not.toContain("$1");
  });
});

// Fix round 1, finding 4 (round 0, choice 2): sameSet never matches an empty
// set, so a history with no known club would name no agreeing source at all.
describe("rateFields on a history with no known club", () => {
  const chosen: Chosen = {
    caps: 0,
    goals: 0,
    clubQid: null,
    history: [],
    birthDate: null,
    position: null,
    positionDetailLine: null,
    nameLatin: null,
  };
  const evidence: Evidence = {
    caps: [],
    goals: [],
    goalsFloor: null,
    capsCeiling: null,
    clubId: [],
    birthDate: [],
    position: [],
    nameLatin: [],
    history: [
      v("enwiki", [] as string[], "2026-09-01"),
      v("frwiki", [] as string[], "2026-09-01"),
    ],
    skipped: { national: [], career: [] },
  };
  it("rates it low on its own source, however fresh and however many sources", () => {
    const { provenance } = rateFields(
      { history: { source: "enwiki", retrievedAt: today, asOf: "2026-09-01" } },
      chosen,
      evidence,
      today,
    );
    expect(provenance.history).toEqual({
      source: "enwiki",
      retrievedAt: today,
      asOf: "2026-09-01",
      confidence: "low",
      agreeing: ["enwiki"],
      confidenceNote: "no club in this history matches a known club",
    });
  });
});
