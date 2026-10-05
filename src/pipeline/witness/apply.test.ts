import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildClubIndex, mergePlayer } from "../merge.ts";
import type { MergeContext } from "../merge.ts";
import { diffPools, renderReport } from "../report.ts";
import type { Infobox, Pool, WdPlayer } from "../types.ts";
import { verdictUse, witnessEvidence, witnessSummary } from "./apply.ts";
import { parseMapping } from "./mapping.ts";
import { latestFifaMatch, parseCountryPage, parsePlayerPage } from "./nft.ts";
import { parseSquad } from "./transfermarkt.ts";
import {
  capsVerdicts,
  clubVerdicts,
  emptyWitness,
  mergeChecks,
  witnessJson,
} from "./verdicts.ts";
import type { WitnessCheck, WitnessFile } from "./verdicts.ts";

const today = "2026-10-05";
const agrees = (
  checked: string | number | null,
  checkedOn = "2026-10-01",
): WitnessCheck => ({
  site:
    typeof checked === "number" ? "national-football-teams" : "transfermarkt",
  checkedOn,
  verdict: "agrees",
  checked,
});
const file = (checks: WitnessFile["checks"]): WitnessFile => ({
  version: 1,
  checks,
});

describe("witnessEvidence (B7)", () => {
  it("a fresh agrees whose checked value equals the chosen one is a vote dated checkedOn", () => {
    expect(
      witnessEvidence(
        file({ Q1: { clubId: agrees("Q900"), caps: agrees(30) } }),
        "Q1",
        { clubQid: "Q900", caps: 30 },
        today,
      ),
    ).toEqual({
      clubVotes: [
        { source: "transfermarkt", value: "Q900", asOf: "2026-10-01" },
      ],
      capsVotes: [
        { source: "national-football-teams", value: 30, asOf: "2026-10-01" },
      ],
      differs: [],
    });
  });

  it("stale after 21 days", () => {
    expect(verdictUse(agrees(30, "2026-09-14"), 30, today)).toBe("used"); // 21 days
    expect(verdictUse(agrees(30, "2026-09-13"), 30, today)).toBe("stale"); // 22 days
    expect(verdictUse(agrees(30, "2026-10-06"), 30, today)).toBe("stale"); // the future
    expect(
      witnessEvidence(
        file({ Q1: { caps: agrees(30, "2026-09-01") } }),
        "Q1",
        { clubQid: null, caps: 30 },
        today,
      ).capsVotes,
    ).toEqual([]);
  });

  it("ignored when the value changed", () => {
    expect(
      witnessEvidence(
        file({ Q1: { clubId: agrees("Q900"), caps: agrees(30) } }),
        "Q1",
        { clubQid: "Q901", caps: 31 },
        today,
      ),
    ).toEqual({ clubVotes: [], capsVotes: [], differs: [] });
  });
});

// The merge, on a hand-made footballer.
const club = {
  qid: "Q900",
  nameEn: "Our Club",
  nameFr: null,
  nameAr: null,
  country: "TN",
  leagues: [],
  titleEn: "Our Club",
  titleFr: null,
};
const player: WdPlayer = {
  qid: "Q1",
  nameEn: "Test Player",
  nameFr: null,
  nameAr: null,
  aliases: [],
  male: true,
  birthDate: "1995-01-01",
  positions: ["defender"],
  birthPlaceQid: null,
  birthPlaceName: null,
  birthCountry: "TN",
  governorates: [],
  imageFile: null,
  titles: { en: "Test Player", fr: null, ar: null },
};
const box: Infobox = {
  lang: "en",
  title: "Test Player",
  currentClub: "Our Club",
  currentClubIsStaff: false,
  positionText: "Defender",
  spells: [],
  caps: 30,
  goals: 1,
  nationalOpen: true,
  nationalEnd: null,
  clubsAsOf: "2026-09-01",
  capsAsOf: "2026-09-28",
  skipped: [],
  seniorRow: true,
  birthDate: "1995-01-01",
};
const context = (
  witness?: WitnessFile,
  overrides: MergeContext["overrides"]["players"] = {},
): MergeContext => ({
  today,
  memberships: new Map(),
  index: buildClubIndex([club], { en: new Map(), fr: new Map() }, {}),
  infoboxes: { en: new Map([["Test Player", box]]), fr: new Map() },
  photos: new Map(),
  tunisiaMatches: [],
  overrides: { players: overrides, clubTitles: {} },
  governorateIds: new Set(),
  ...(witness ? { witness } : {}),
});

describe("the merge with verdicts (B7)", () => {
  const differs = (field: "clubId" | "caps"): WitnessCheck =>
    field === "caps"
      ? {
          site: "national-football-teams",
          checkedOn: "2026-10-01",
          verdict: "differs",
          reason: "same-date",
          checked: 30,
        }
      : {
          site: "transfermarkt",
          checkedOn: "2026-10-01",
          verdict: "differs",
          checked: "Q900",
        };

  it("differs gives a flag and, under S21b, rates the field low", () => {
    const merged = mergePlayer(
      player,
      context(
        file({ Q1: { clubId: differs("clubId"), caps: differs("caps") } }),
      ),
    )!;
    expect(merged.flags.filter((f) => f.kind.includes("witness"))).toEqual([
      {
        kind: "club-witness-differs",
        detail: "transfermarkt checked on 2026-10-01: differs from Our Club",
      },
      {
        kind: "caps-witness-differs",
        detail:
          "national-football-teams checked on 2026-10-01: differs from 30",
      },
    ]);
    expect(merged.draft.provenance.clubId).toMatchObject({
      confidence: "low",
      confidenceNote: "transfermarkt checked on 2026-10-01: differs (P48)",
    });
    expect(merged.draft.provenance.caps?.confidence).toBe("low");
    // The values themselves are untouched: a verdict never chooses.
    expect(merged.draft.club?.qid).toBe("Q900");
    expect(merged.draft.caps).toBe(30);
  });

  it("an override stays high; the differs is still flagged", () => {
    const merged = mergePlayer(
      player,
      context(file({ Q1: { caps: differs("caps") } }), {
        Q1: { caps: { value: 30, by: "jalel", at: "2026-10-05" } },
      }),
    )!;
    expect(merged.draft.provenance.caps?.confidence).toBe("high");
    expect(merged.flags.map((f) => f.kind)).toContain("caps-witness-differs");
  });

  it("an empty file changes nothing", () => {
    expect(JSON.stringify(mergePlayer(player, context(emptyWitness())))).toBe(
      JSON.stringify(mergePlayer(player, context())),
    );
  });
});

describe("the S29 sentinel: no site value in data/witness.json, the report, or any flag", () => {
  it('keeps 777 caps and "Invented FC" out of everything public', () => {
    const fixture = (name: string) =>
      readFileSync(
        path.join(import.meta.dirname, "__fixtures__", name),
        "utf8",
      );
    // The sites say: club Invented FC (Transfermarkt id 90001) for him, and
    // 777 career FIFA matches.
    const squad = parseSquad(fixture("tm-squad.html"));
    const career = parsePlayerPage(
      fixture("nft-player.html").replace(">21<", ">777<"),
    ).careerFifa;
    const country = parseCountryPage(fixture("nft-country.html"));
    expect(career).toBe(777);
    const uri = (q: string) => ({
      type: "uri",
      value: `http://www.wikidata.org/entity/${q}`,
    });
    const lit = (value: string) => ({ type: "literal", value });
    const mapping = parseMapping({
      results: {
        bindings: [
          { item: uri("Q1"), tm: lit(squad[0].id), nft: lit("800001") },
          { item: uri("Q900"), tmClub: lit("90009") },
          { item: uri("Q901"), tmClub: lit("90001") },
        ],
      },
    });
    const checks = [
      ...clubVerdicts({
        players: [{ qid: "Q1", clubQid: "Q900" }],
        mapping,
        squads: new Map([
          ["90009", new Set<string>()],
          ["90001", new Set(squad.map((p) => p.id))],
        ]),
        today,
      }).checks,
      ...capsVerdicts({
        players: [{ qid: "Q1", caps: 30, capsAsOf: "2026-09-28" }],
        mapping,
        careers: new Map([["800001", career]]),
        latestMatch: latestFifaMatch(country),
        today,
      }).checks,
    ];
    const witness = mergeChecks(emptyWitness(), checks);
    expect(witness.checks.Q1.clubId?.verdict).toBe("differs");
    expect(witness.checks.Q1.caps?.verdict).toBe("differs");
    const merged = mergePlayer(player, context(witness))!;
    const pool: Pool = {
      version: 1,
      players: [
        {
          id: "test-player",
          wikidataId: "Q1",
          nameLatin: "Test Player",
          nameArabic: null,
          nameFrench: null,
          aliases: [],
          position: "defender",
          positionDetail: null,
          birthDate: "1995-01-01",
          birthPlace: null,
          birthCountry: "TN",
          governorate: null,
          clubId: "our-club",
          caps: 30,
          goals: 1,
          capsAsOf: "2026-09-28",
          history: [],
          photo: null,
          wiki: { en: "Test Player", fr: null, ar: null },
          pools: { active: true, legend: false },
          provenance: merged.draft.provenance,
        },
      ],
      clubs: [
        {
          id: "our-club",
          wikidataId: "Q900",
          nameLatin: "Our Club",
          nameArabic: null,
          nameFrench: null,
          country: "TN",
          confederation: "CAF",
          leagueWikidataId: null,
          ligue1: true,
        },
      ],
      honours: [],
      flags: merged.flags.map((f) => ({ subject: "Q1", ...f })),
      dropped: [],
    };
    const report = renderReport({
      pool,
      diff: diffPools(null, pool),
      statuses: {},
      today,
      witness: witnessSummary(witness, pool, today),
    });
    const published = [
      witnessJson(witness),
      report,
      JSON.stringify(pool),
      ...merged.flags.map((f) => f.detail),
    ].join("\n");
    for (const theirs of ["777", "Invented FC", "90001", squad[0].id, "800001"])
      expect(published).not.toContain(theirs);
    expect(report).toContain(
      "- Test Player (Q1): club Our Club: transfermarkt checked on 2026-10-05: differs",
    );
    expect(report).toContain(
      "- Test Player (Q1): caps 30 (as of 2026-09-28): national-football-teams checked on 2026-10-05: differs (same-date)",
    );
  });
});

describe("the Private checks (P43) report section", () => {
  it("Private checks (P43): verdicts by field and site, stale and unused counts, each differs listed with our value only", () => {
    const pool: Pool = {
      version: 1,
      players: [
        {
          id: "a",
          wikidataId: "Q1",
          nameLatin: "Player A",
          nameArabic: null,
          nameFrench: null,
          aliases: [],
          position: "defender",
          positionDetail: null,
          birthDate: "1995-01-01",
          birthPlace: null,
          birthCountry: "TN",
          governorate: null,
          clubId: null,
          caps: 12,
          goals: 0,
          capsAsOf: null,
          history: [],
          photo: null,
          wiki: { en: null, fr: null, ar: null },
          pools: { active: true, legend: false },
          provenance: {},
        },
      ],
      clubs: [],
      honours: [],
      flags: [],
      dropped: [],
    };
    const witness = file({
      Q1: {
        caps: {
          site: "national-football-teams",
          checkedOn: "2026-10-01",
          verdict: "differs",
          reason: "older",
          checked: 12,
        },
        clubId: agrees("Q900"), // we publish no club now: unused
      },
      Q2: { caps: agrees(3) }, // not in the pool: unused
      Q3: { caps: agrees(3, "2026-08-01") }, // not in the pool, but stale first? unused
    });
    const summary = witnessSummary(witness, pool, today);
    expect(summary).toEqual({
      counts: [
        {
          field: "caps",
          site: "national-football-teams",
          verdicts: {
            agrees: 0,
            differs: 1,
            "not-found": 0,
            "not-comparable": 0,
          },
        },
      ],
      stale: 0,
      unused: 3,
      differs: [
        "Player A (Q1): caps 12: national-football-teams checked on 2026-10-01: differs (older)",
      ],
    });
    const report = renderReport({
      pool,
      diff: diffPools(null, pool),
      statuses: {},
      today,
      witness: summary,
    });
    expect(report).toContain("## Private checks (P43): 1 verdicts in use");
    expect(report).toContain(
      "| caps | national-football-teams | 0 | 1 | 0 | 0 |",
    );
    expect(report).toContain(
      "Stale (over 21 days): 0. Unused (our value changed, or no longer in the pool): 3.",
    );
  });
});
