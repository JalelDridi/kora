import { describe, expect, it } from "vitest";
import {
  computeConfidence,
  computeCoverage,
  diffPools,
  guardChange,
  lowFields,
  missingSeasons,
  renderReport,
} from "./report.ts";
import type { Pool, PoolPlayer } from "./types.ts";

function player(id: string, fields: Partial<PoolPlayer> = {}): PoolPlayer {
  return {
    id,
    wikidataId: `Q${id.length}${id.charCodeAt(0)}`,
    nameLatin: id,
    nameArabic: null,
    nameFrench: null,
    aliases: [],
    position: "forward",
    positionDetail: null,
    birthDate: "1995-01-01",
    birthPlace: null,
    birthCountry: "TN",
    governorate: null,
    clubId: null,
    caps: 0,
    goals: 0,
    capsAsOf: null,
    history: [],
    photo: null,
    wiki: { en: null, fr: null, ar: null },
    pools: { active: true, legend: false },
    provenance: {},
    ...fields,
  };
}

function pool(players: PoolPlayer[]): Pool {
  return {
    version: 1,
    players,
    clubs: [
      {
        id: "a",
        wikidataId: "Q1",
        nameLatin: "Club A",
        nameArabic: null,
        nameFrench: null,
        country: "TN",
        confederation: "CAF",
        leagueWikidataId: null,
        ligue1: true,
      },
      {
        id: "b",
        wikidataId: "Q2",
        nameLatin: "Club B",
        nameArabic: null,
        nameFrench: null,
        country: "FR",
        confederation: "UEFA",
        leagueWikidataId: null,
        ligue1: false,
      },
    ],
    honours: [
      {
        competition: "tn_ligue1",
        seasonStart: 2024,
        seasonEnd: 2025,
        clubId: "a",
        source: "curated",
      },
    ],
    flags: [
      { subject: "Q999", kind: "club-unresolved", detail: "enwiki: Nowhere" },
    ],
    dropped: [],
  };
}

describe("computeCoverage", () => {
  it("counts each field over the pool", () => {
    const rows = computeCoverage([
      player("x", { nameArabic: "س", clubId: "a" }),
      player("y", { birthCountry: "FR" }),
    ]);
    expect(rows.find((r) => r.field === "Arabic name")).toEqual({
      field: "Arabic name",
      count: 1,
      total: 2,
    });
    expect(
      rows.find((r) => r.field === "Governorate or born abroad")?.count,
    ).toBe(1);
    expect(rows.find((r) => r.field === "Current club")?.count).toBe(1);
  });
});

describe("diffPools and guardChange", () => {
  const before = pool([
    player("x", { clubId: "a", caps: 3 }),
    player("y"),
    player("z"),
  ]);
  const after = pool([
    player("x", { clubId: "b", caps: 4 }),
    player("y", { nameArabic: "ي" }),
    player("w"),
  ]);

  it("lists additions, removals, club changes and counts the rest", () => {
    expect(diffPools(before, after)).toEqual({
      added: ["w"],
      removed: ["z"],
      clubChanges: [{ id: "x", from: "a", to: "b" }],
      capsChanged: 1,
      otherChanged: 1,
      changed: true,
    });
    expect(diffPools(after, after).changed).toBe(false);
  });

  it("refuses a pool that shrinks by more than a tenth", () => {
    const big = pool(Array.from({ length: 100 }, (_, i) => player(`p${i}`)));
    const small = pool(Array.from({ length: 89 }, (_, i) => player(`p${i}`)));
    expect(guardChange(big, small)).toMatch(/shrink from 100 to 89/);
    expect(
      guardChange(
        big,
        pool(Array.from({ length: 90 }, (_, i) => player(`p${i}`))),
      ),
    ).toBeNull();
    expect(guardChange(null, small)).toBeNull();
  });
});

describe("renderReport", () => {
  it("leads with sources and club changes, then coverage, flags and honour gaps", () => {
    const before = pool([player("x", { clubId: "a" })]);
    const after = pool([player("x", { clubId: "b" })]);
    const report = renderReport({
      pool: after,
      diff: diffPools(before, after),
      statuses: {
        wikidata: { status: "fresh", retrievedAt: "2026-10-04" },
        "infobox-en": {
          status: "cached",
          retrievedAt: "2026-10-02",
          note: "HTTP 429",
        },
      },
      today: "2026-10-04",
    });
    expect(report).toContain("# Nightly pool, 2026-10-04");
    expect(report).toContain("| infobox-en | cached | 2026-10-02 | HTTP 429 |");
    expect(report).toContain("- x: Club A → Club B");
    expect(report).toContain("| Current club | 1 of 1 | 100% |");
    expect(report).toContain("### club-unresolved (1)");
    expect(report).toMatch(
      /Ligue 1 seasons without a winner since 1990–91: [^\n]*2023–24, 2025–26\n/,
    );
  });

  it("lists the seasons without a winner", () => {
    expect(
      missingSeasons(
        [
          {
            competition: "tn_cup",
            seasonStart: 2020,
            seasonEnd: 2021,
            clubId: "a",
            source: "curated",
          },
        ],
        "tn_cup",
        2019,
        2021,
      ),
    ).toEqual([2019, 2021]);
  });
});

describe("confidence in the report (P26)", () => {
  const rated = (
    confidence: "high" | "medium" | "low",
    confidenceNote?: string,
  ) => ({
    source: "frwiki" as const,
    retrievedAt: "2026-10-04",
    confidence,
    agreeing: ["frwiki" as const],
    confidenceNote,
  });
  const meriah = player("yassine-meriah", {
    caps: 93,
    capsAsOf: "2026-09-27",
    provenance: {
      caps: rated("low", "enwiki 95 (undated) is higher"),
      governorate: rated("low", "one source"),
    },
  });
  const sassi = player("ferjani-sassi", {
    provenance: {
      caps: rated("medium"),
      governorate: rated("low", "one source"),
    },
  });
  it("counts each field per level", () => {
    expect(
      computeConfidence([meriah, sassi]).find((r) => r.field === "caps"),
    ).toEqual({ field: "caps", high: 0, medium: 1, low: 1, none: 0 });
  });
  it("lists low cross-checked fields and skipped rows before the club changes", () => {
    const p = pool([meriah, sassi]);
    p.flags.push({
      subject: "Q1",
      kind: "caps-row-skipped",
      detail: "frwiki sélection nationale (years): 2010-11 {{TUN football}}",
    });
    const report = renderReport({
      pool: p,
      diff: diffPools(null, p),
      statuses: {},
      today: "2026-10-04",
    });
    expect(report).toContain("## Low confidence, review first (1)");
    expect(report).toContain(
      "- yassine-meriah: caps 93 (as of 2026-09-27): enwiki 95 (undated) is higher",
    );
    expect(report).toContain("governorate 2");
    expect(report).toContain("### Rows the infobox parsers skipped (1)");
    expect(report).toContain("| caps | 0 | 1 | 1 | 0 |");
    expect(report.indexOf("## Low confidence")).toBeLessThan(
      report.indexOf("## Club changes"),
    );
  });
});

describe("the report puts doubt first", () => {
  const low = (
    note: string,
    agreeing: ("enwiki" | "frwiki" | "wikidata" | "none")[],
  ) => ({
    source: agreeing[0],
    retrievedAt: "2026-10-04",
    confidence: "low" as const,
    agreeing,
    confidenceNote: note,
  });
  const meriah = player("yassine-meriah", {
    wikidataId: "Q3571155",
    nameLatin: "Yassine Meriah",
    caps: 0,
    history: [
      {
        clubId: null,
        clubName: "CS Sfaxien",
        from: 2013,
        to: 2018,
        apps: 70,
        goals: 2,
        loan: false,
      },
    ],
    provenance: {
      position: low(
        "enwiki defender (undated), frwiki defender (undated) differs",
        ["wikidata"],
      ),
      caps: low("no source gives a value", ["none"]),
      history: low("no club in this history matches a known club", ["frwiki"]),
    },
  });
  const abdi = player("ali-abdi", {
    provenance: { birthDate: low("one source", ["wikidata"]) },
  });
  const doubtful = pool([meriah, abdi]);
  doubtful.flags.push(
    {
      subject: "Q3571155",
      kind: "fr-undated-spell",
      detail: "frwiki Yassine Meriah (football): AS Ariana (?–2013)",
    },
    {
      subject: "Q3571155",
      kind: "career-row-skipped",
      detail: "enwiki clubs3 (years): | 2014 | [[Club]]",
    },
  );

  it("lists low fields by footballer, with the value, its sources and the note; none is no source", () => {
    expect(
      lowFields(doubtful.players).map((l) => [l.id, l.field, l.sources]),
    ).toEqual([
      ["ali-abdi", "birthDate", "wikidata"],
      ["yassine-meriah", "caps", "no source"],
      ["yassine-meriah", "position", "wikidata"],
      ["yassine-meriah", "history", "frwiki"],
    ]);
    const report = renderReport({
      pool: doubtful,
      diff: diffPools(null, doubtful),
      statuses: {},
      today: "2026-10-04",
    });
    expect(report).toContain(
      "- yassine-meriah: caps 0: no source gives a value; sources: no source",
    );
    expect(report).toContain(
      "- yassine-meriah: history 1 spells: no club in this history matches a known club; sources: frwiki",
    );
    expect(report).not.toMatch(/sources: [^\n]*\bnone\b/);
    expect(report).toContain("Club histories are often low on a first build");
    expect(report).toContain("1 of the 4 are club histories");
  });

  it("orders the sections: low fields, skipped rows and undated spells, honours issues, coverage, confidence, changes", () => {
    const report = renderReport({
      pool: doubtful,
      diff: diffPools(null, doubtful),
      statuses: {},
      today: "2026-10-04",
      honoursReading: {
        issues: [
          {
            kind: "label-unreadable",
            competition: "tn_cup",
            seasonStart: 2004,
            detail:
              '"Coupe 2004" (Q1): no end year in the label, so the end is the start year 2004',
          },
        ],
        skipped: { unlabelled: 3, noStart: 1 },
      },
    });
    expect(report).toContain(
      "- Yassine Meriah (Q3571155): enwiki clubs3 (years): | 2014 | [[Club]]",
    );
    expect(report).toContain(
      "### French spells without a start year, left out beside an English career (1)",
    );
    expect(report).toContain(
      "- Yassine Meriah (Q3571155): frwiki Yassine Meriah (football): AS Ariana (?–2013)",
    );
    expect(report).toContain(
      '- label-unreadable: tn_cup 2004: "Coupe 2004" (Q1): no end year in the label, so the end is the start year 2004',
    );
    expect(report).toContain(
      "Seasons left out: 3 without an English label, 1 without a start year.",
    );
    const order = [
      "## Low confidence",
      "### Rows the infobox parsers skipped",
      "### French spells without a start year",
      "## Honours read from Wikidata",
      "## Coverage",
      "## Confidence",
      "## Changes since the previous pool",
      "## Club changes",
      "## Flags",
    ];
    const at = order.map((heading) => report.indexOf(heading));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("says when Wikidata's honours were not read", () => {
    const report = renderReport({
      pool: doubtful,
      diff: diffPools(null, doubtful),
      statuses: {},
      today: "2026-10-04",
    });
    expect(report).toContain(
      "## Honours read from Wikidata: corrections and drops (not read)",
    );
  });

  it("shows the shrink guard against the previous pool, and changes that touch only provenance", () => {
    const big = pool(Array.from({ length: 10 }, (_, i) => player(`p${i}`)));
    const small = pool(Array.from({ length: 8 }, (_, i) => player(`p${i}`)));
    const refused = renderReport({
      pool: small,
      diff: diffPools(big, small),
      statuses: {},
      today: "2026-10-04",
    });
    expect(refused).toContain(
      "10 footballers before, 8 now. **Refused:** the pool would shrink from 10 to 8 footballers",
    );
    const first = renderReport({
      pool: small,
      diff: diffPools(null, small),
      statuses: {},
      today: "2026-10-04",
    });
    expect(first).toContain("No previous pool to compare with");
    const rerated = pool(
      big.players.map((p) => ({
        ...p,
        provenance: { caps: low("one source", ["wikidata"]) },
      })),
    );
    const quiet = renderReport({
      pool: rerated,
      diff: diffPools(big, rerated),
      statuses: {},
      today: "2026-10-04",
    });
    expect(quiet).toContain(
      "10 footballers before, 10 now. Shrink guard passed",
    );
    expect(quiet).toContain(
      "- Only dates, sources or confidence ratings changed.",
    );
  });
});

describe("who was left out, in the report (fix round 1, finding 1)", () => {
  const flag = (
    subject: string,
    kind: "caps-unknown" | "governorate-unresolved" | "career-row-skipped",
    detail: string,
  ) => ({ subject, kind, detail });
  const kept = pool([player("x")]);
  kept.dropped = [
    {
      wikidataId: "Q500",
      name: "Old Reserve",
      reason: "not-candidate",
      flags: [
        flag(
          "Q500",
          "caps-unknown",
          "no source gives his Tunisia caps or goals",
        ),
      ],
    },
    { wikidataId: "Q700", name: "Excluded One", reason: "excluded", flags: [] },
    {
      wikidataId: "Q800",
      name: "Few Caps",
      reason: "no-pool",
      flags: [flag("Q800", "governorate-unresolved", "no birthplace")],
    },
    {
      wikidataId: "Q900",
      name: "Unread Caps",
      reason: "no-pool",
      flags: [
        flag(
          "Q900",
          "caps-unknown",
          "no source gives his Tunisia caps or goals",
        ),
        flag("Q900", "governorate-unresolved", "no birthplace"),
      ],
    },
    {
      wikidataId: "Q1000",
      name: "Skipped Row",
      reason: "no-pool",
      flags: [
        flag(
          "Q1000",
          "career-row-skipped",
          "enwiki clubs2 (years): | ? | [[X]]",
        ),
      ],
    },
  ];
  const report = renderReport({
    pool: kept,
    diff: diffPools(null, kept),
    statuses: {},
    today: "2026-10-04",
  });

  it("counts each reason and names the no-pool footballers with unknown caps or skipped rows, with their flags", () => {
    expect(report).toContain(
      [
        "## Left out of the pool (5)",
        "",
        "- excluded: 1",
        "- not-candidate: 1",
        "- no-pool: 3",
        "",
      ].join("\n"),
    );
    expect(report).toContain(
      "### In neither pool, with unknown caps or goals or skipped rows (2)",
    );
    expect(report).toContain(
      "- Unread Caps (Q900): caps-unknown: no source gives his Tunisia caps or goals; governorate-unresolved: no birthplace",
    );
    expect(report).toContain(
      "- Skipped Row (Q1000): career-row-skipped: enwiki clubs2 (years): | ? | [[X]]",
    );
    expect(report).not.toContain("Few Caps (Q800)");
    expect(report).not.toContain("Old Reserve (Q500)");
    expect(report.indexOf("- Unread Caps")).toBeLessThan(
      report.indexOf("- Skipped Row"),
    );
  });

  it("comes right after the low-confidence section", () => {
    expect(report.indexOf("## Left out of the pool")).toBeGreaterThan(
      report.indexOf("### French spells without a start year"),
    );
    expect(report.indexOf("## Left out of the pool")).toBeLessThan(
      report.indexOf("## Honours read from Wikidata"),
    );
  });

  it("counts a footballer who moved from the pool to the left-out list as removed", () => {
    const before = pool([player("x"), player("y")]);
    const after = pool([player("x")]);
    after.dropped = [
      {
        wikidataId: player("y").wikidataId,
        name: "y",
        reason: "no-pool",
        flags: [],
      },
    ];
    expect(diffPools(before, after).removed).toEqual(["y"]);
  });
});

describe("honours replaced by curated rows, in the report (fix round 1, finding 3)", () => {
  it("lists each replacement in the honours section", () => {
    const p = pool([player("x")]);
    p.flags.push({
      subject: "tn_cup 2011",
      kind: "honour-replaced-by-curated",
      detail:
        "wikidata 2011–2011 Q10 (a) replaced by curated 2011–2012 Q11 (b)",
    });
    const report = renderReport({
      pool: p,
      diff: diffPools(null, p),
      statuses: {},
      today: "2026-10-04",
    });
    const section = report.slice(
      report.indexOf("## Honours read from Wikidata"),
      report.indexOf("## Coverage"),
    );
    expect(section).toContain("### Replaced by a curated honour (1)");
    expect(section).toContain(
      "- tn_cup 2011: wikidata 2011–2011 Q10 (a) replaced by curated 2011–2012 Q11 (b)",
    );
  });

  it("counts a season with two editions once when looking for gaps", () => {
    const two = [
      {
        competition: "caf_cc" as const,
        seasonStart: 2018,
        seasonEnd: 2018,
        clubId: "a",
        source: "curated" as const,
      },
      {
        competition: "caf_cc" as const,
        seasonStart: 2018,
        seasonEnd: 2019,
        clubId: "b",
        source: "curated" as const,
      },
    ];
    expect(missingSeasons(two, "caf_cc", 2017, 2019)).toEqual([2017, 2019]);
  });
});
