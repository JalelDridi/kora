import { describe, expect, it } from "vitest";
import { parseMapping } from "./mapping.ts";
import {
  capsVerdicts,
  clubVerdicts,
  emptyWitness,
  mergeChecks,
  validateWitness,
  witnessJson,
} from "./verdicts.ts";

// Invented ids throughout: Q1.. footballers, Q900.. clubs, tm 7xxxxx,
// nft 8xxxxx, Transfermarkt clubs 900xx.
const uri = (q: string) => ({
  type: "uri",
  value: `http://www.wikidata.org/entity/${q}`,
});
const lit = (value: string) => ({ type: "literal", value });
const mapping = parseMapping({
  results: {
    bindings: [
      { item: uri("Q1"), tm: lit("700001"), nft: lit("800001") },
      { item: uri("Q2"), tm: lit("700002"), nft: lit("800002") },
      { item: uri("Q3"), tm: lit("700003"), nft: lit("800003") },
      { item: uri("Q4"), tm: lit("700004") },
      { item: uri("Q5") },
      { item: uri("Q900"), tmClub: lit("90001") },
      { item: uri("Q901"), tmClub: lit("90002") },
    ],
  },
});
const squads = new Map([
  ["90001", new Set(["700001", "700003"])],
  ["90002", new Set(["700002"])],
]);
const today = "2026-10-05";

describe("club verdicts (B6)", () => {
  it("club agrees when the Transfermarkt page of his pool club lists him", () => {
    const { checks } = clubVerdicts({
      players: [{ qid: "Q1", clubQid: "Q900" }],
      mapping,
      squads,
      today,
    });
    expect(checks).toEqual([
      {
        qid: "Q1",
        field: "clubId",
        check: {
          site: "transfermarkt",
          checkedOn: today,
          verdict: "agrees",
          checked: "Q900",
        },
      },
    ]);
  });

  it("differs when another Ligue 1 page lists him, or he is listed but the pool puts him abroad or nowhere", () => {
    const { checks } = clubVerdicts({
      players: [
        { qid: "Q2", clubQid: "Q900" }, // listed at 90002
        { qid: "Q3", clubQid: "Q777" }, // abroad in the pool, listed at 90001
        { qid: "Q1", clubQid: null }, // no club in the pool, listed at 90001
      ],
      mapping,
      squads,
      today,
    });
    expect(
      checks.map((c) => [c.qid, c.check.verdict, c.check.checked]),
    ).toEqual([
      ["Q2", "differs", "Q900"],
      ["Q3", "differs", "Q777"],
      ["Q1", "differs", null],
    ]);
  });

  it("not-found when his Ligue 1 club's page lacks him", () => {
    const { checks, unjudged } = clubVerdicts({
      players: [
        { qid: "Q4", clubQid: "Q901" },
        // Abroad and listed nowhere: nothing to say.
        { qid: "Q4", clubQid: "Q777" },
      ],
      mapping,
      squads,
      today,
    });
    expect(checks.map((c) => c.check.verdict)).toEqual(["not-found"]);
    expect(unjudged).toBe(1);
  });

  it("no id: no verdict, counted", () => {
    expect(
      clubVerdicts({
        players: [
          { qid: "Q5", clubQid: "Q900" },
          { qid: "Q6", clubQid: "Q900" },
        ],
        mapping,
        squads,
        today,
      }),
    ).toEqual({ checks: [], noId: 2, unjudged: 0 });
  });
});

describe("caps verdicts (B6, S19)", () => {
  const careers = new Map<string, number | null>([
    ["800001", 30],
    ["800002", 12],
    ["800003", null],
  ]);
  const verdict = (caps: number, capsAsOf: string | null, qid = "Q1") =>
    capsVerdicts({
      players: [{ qid, caps, capsAsOf }],
      mapping,
      careers,
      latestMatch: "2026-09-28",
      today,
    }).checks[0]?.check;

  it("caps agrees on equal FIFA counts", () => {
    expect(verdict(30, "2026-09-28")).toEqual({
      site: "national-football-teams",
      checkedOn: today,
      verdict: "agrees",
      checked: 30,
    });
  });

  it("caps differs with reason same-date or older", () => {
    expect(verdict(29, "2026-09-28")).toMatchObject({
      verdict: "differs",
      reason: "same-date",
      checked: 29,
    });
    expect(verdict(29, null)).toMatchObject({
      verdict: "differs",
      reason: "older",
    });
  });

  it("not-comparable when the pool date is older and Tunisia played since", () => {
    expect(verdict(29, "2026-09-01")).toEqual({
      site: "national-football-teams",
      checkedOn: today,
      verdict: "not-comparable",
      checked: 29,
    });
  });

  it("not-found when his page is missing; no id or no page read: no verdict, counted", () => {
    expect(verdict(5, "2026-09-28", "Q3")?.verdict).toBe("not-found");
    expect(
      capsVerdicts({
        players: [
          { qid: "Q4", caps: 1, capsAsOf: null },
          { qid: "Q5", caps: 1, capsAsOf: null },
        ],
        mapping,
        careers: new Map(),
        latestMatch: null,
        today,
      }),
    ).toEqual({ checks: [], noId: 2, unjudged: 0 });
    expect(
      capsVerdicts({
        players: [{ qid: "Q1", caps: 1, capsAsOf: null }],
        mapping,
        careers: new Map(),
        latestMatch: null,
        today,
      }).unjudged,
    ).toBe(1);
  });
});

describe("data/witness.json (B6, S18)", () => {
  it("merging keeps the newest verdict per footballer, field and site", () => {
    const first = mergeChecks(emptyWitness(), [
      {
        qid: "Q1",
        field: "caps",
        check: {
          site: "national-football-teams",
          checkedOn: "2026-10-05",
          verdict: "agrees",
          checked: 30,
        },
      },
    ]);
    const older = mergeChecks(first, [
      {
        qid: "Q1",
        field: "caps",
        check: {
          site: "national-football-teams",
          checkedOn: "2026-09-28",
          verdict: "differs",
          reason: "older",
          checked: 29,
        },
      },
      {
        qid: "Q1",
        field: "clubId",
        check: {
          site: "transfermarkt",
          checkedOn: "2026-09-28",
          verdict: "agrees",
          checked: "Q900",
        },
      },
    ]);
    expect(older.checks.Q1.caps?.checkedOn).toBe("2026-10-05");
    expect(older.checks.Q1.clubId?.verdict).toBe("agrees");
    const newer = mergeChecks(older, [
      {
        qid: "Q1",
        field: "caps",
        check: {
          site: "national-football-teams",
          checkedOn: "2026-10-12",
          verdict: "agrees",
          checked: 31,
        },
      },
    ]);
    expect(newer.checks.Q1.caps).toMatchObject({
      checkedOn: "2026-10-12",
      checked: 31,
    });
    expect(first.checks.Q1.caps?.checked).toBe(30); // inputs untouched
  });

  it("the committed file holds only verdicts and our values (S29 sentinel)", () => {
    // The sites' values in this test: 777 caps, club "Invented FC".
    const careers = new Map<string, number | null>([["800001", 777]]);
    const club = clubVerdicts({
      players: [{ qid: "Q2", clubQid: "Q900" }],
      mapping,
      squads,
      today,
    });
    const caps = capsVerdicts({
      players: [{ qid: "Q1", caps: 30, capsAsOf: "2026-09-28" }],
      mapping,
      careers,
      latestMatch: "2026-09-28",
      today,
    });
    const text = witnessJson(
      mergeChecks(emptyWitness(), [...club.checks, ...caps.checks]),
    );
    expect(text).not.toContain("777");
    expect(text).not.toContain("Invented FC");
    expect(text).not.toContain("90002"); // their club id for him
    expect(text).not.toContain("700002"); // their player id
    expect(validateWitness(JSON.parse(text))).toEqual([]);
  });

  it("validates shape, ISO dates, known sites and verdicts", () => {
    expect(validateWitness({ version: 1, checks: {} })).toEqual([]);
    expect(validateWitness({ version: 2, checks: {} })).toEqual([
      'must be { "version": 1, "checks": { ... } }',
    ]);
    expect(
      validateWitness({
        version: 1,
        checks: {
          X1: {},
          Q1: {
            caps: {
              site: "elsewhere",
              checkedOn: "5 October 2026",
              verdict: "maybe",
              checked: 3.5,
              theirs: 31,
            },
            clubId: {
              site: "transfermarkt",
              checkedOn: "2026-10-05",
              verdict: "agrees",
              checked: "Invented FC",
              reason: "older",
            },
            goals: {},
          },
        },
      }),
    ).toEqual([
      "checks.X1: not a Wikidata id",
      "checks.Q1.caps: unknown key theirs (a verdict holds no value of the site's)",
      "checks.Q1.caps: unknown site elsewhere",
      "checks.Q1.caps: checkedOn must be an ISO date",
      "checks.Q1.caps: unknown verdict maybe",
      "checks.Q1.caps: checked must be our caps, a whole number",
      "checks.Q1.clubId: checked must be our club's Wikidata id or null",
      'checks.Q1.clubId: a reason goes only with a caps "differs"',
      "checks.Q1.goals: unknown field",
    ]);
  });
});
