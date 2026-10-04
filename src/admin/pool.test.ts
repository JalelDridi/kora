import { describe, expect, it } from "vitest";
import type { Pool, PoolPlayer } from "@/pipeline/types.ts";
import {
  articleLinks,
  confidenceLabel,
  fieldValue,
  flagKinds,
  fold,
  matches,
  paginate,
  parseFilters,
  provenanceLabel,
  provenanceRows,
  sourceLabel,
  sourceNames,
  summarize,
  toQuery,
} from "./pool";

const entry = (confidence: "high" | "medium" | "low") => ({
  source: "enwiki" as const,
  retrievedAt: "2026-10-01",
  confidence,
  agreeing: ["enwiki" as const],
});

const player = (over: Partial<PoolPlayer> = {}): PoolPlayer => ({
  id: "ali-maaloul",
  wikidataId: "Q1",
  nameLatin: "Ali Maâloul",
  nameArabic: "علي معلول",
  nameFrench: null,
  aliases: [],
  position: "defender",
  positionDetail: null,
  birthDate: "1990-01-01",
  birthPlace: "Sfax",
  birthCountry: "TN",
  governorate: "sfax",
  clubId: null,
  caps: 90,
  goals: 3,
  capsAsOf: "2026-08-01",
  history: [],
  photo: null,
  wiki: { en: "Ali Maâloul", fr: "Ali Maâloul (football)", ar: null },
  pools: { active: true, legend: false },
  provenance: { caps: entry("high"), goals: entry("medium") },
  ...over,
});

const none = parseFilters({});

describe("parseFilters", () => {
  it("reads known values and ignores the rest", () => {
    expect(
      parseFilters({
        confidence: "low",
        field: "caps",
        pool: "legend",
        flag: "caps-row-skipped",
        q: "  Maaloul ",
        page: "3",
      }),
    ).toEqual({
      confidence: "low",
      field: "caps",
      pool: "legend",
      flag: "caps-row-skipped",
      q: "Maaloul",
      page: 3,
    });
    expect(
      parseFilters({
        confidence: "nonsense",
        field: "password",
        pool: ["active", "legend"],
        flag: "<script>",
        page: "-1",
      }),
    ).toEqual({
      confidence: null,
      field: null,
      pool: null,
      flag: null,
      q: "",
      page: 1,
    });
  });

  it("writes them back, page 1 left out", () => {
    expect(toQuery(none)).toBe("");
    expect(toQuery({ ...none, confidence: "low", q: "ben ali", page: 2 })).toBe(
      "?confidence=low&q=ben+ali&page=2",
    );
  });
});

describe("matches", () => {
  it("keeps footballers with a cross-checked field at the level asked", () => {
    const low = { ...none, confidence: "low" as const };
    expect(matches(player(), low, [])).toBe(false);
    expect(matches(player(), { ...none, confidence: "medium" }, [])).toBe(true);
    expect(
      matches(player({ provenance: { caps: entry("low") } }), low, []),
    ).toBe(true);
    // The single-source fields are low by construction: only a field asked by name counts.
    const lowArabic = player({ provenance: { nameArabic: entry("low") } });
    expect(matches(lowArabic, low, [])).toBe(false);
    expect(matches(lowArabic, { ...low, field: "nameArabic" }, [])).toBe(true);
  });

  it("filters by pool and by flag", () => {
    expect(matches(player(), { ...none, pool: "legend" }, [])).toBe(false);
    expect(matches(player(), { ...none, pool: "active" }, [])).toBe(true);
    const flag = {
      subject: "Q1",
      kind: "caps-maybe-stale" as const,
      detail: "",
    };
    expect(
      matches(player(), { ...none, flag: "caps-maybe-stale" }, [flag]),
    ).toBe(true);
    expect(matches(player(), { ...none, flag: "photo-small" }, [flag])).toBe(
      false,
    );
  });

  it("finds a name in Latin or Arabic letters, accents and vowel marks aside", () => {
    expect(matches(player(), { ...none, q: "maaloul" }, [])).toBe(true);
    expect(matches(player(), { ...none, q: "معلول" }, [])).toBe(true);
    expect(matches(player(), { ...none, q: "مَعلول" }, [])).toBe(true);
    expect(matches(player(), { ...none, q: "khazri" }, [])).toBe(false);
    expect(fold("Maâloul")).toBe("maaloul");
  });
});

describe("paginate", () => {
  it("cuts the list and keeps a page past the end on the last page", () => {
    const list = Array.from({ length: 120 }, (_, i) => i);
    expect(paginate(list, 1, 50)).toMatchObject({ page: 1, pages: 3 });
    expect(paginate(list, 3, 50).items).toEqual(list.slice(100));
    expect(paginate(list, 9, 50).page).toBe(3);
    expect(paginate([], 1, 50)).toEqual({ items: [], page: 1, pages: 1 });
  });
});

describe("words", () => {
  it('prints "none" as "no source" and a missing level as "no entry"', () => {
    expect(sourceLabel("none")).toBe("no source");
    expect(sourceLabel("frwiki")).toBe("frwiki");
    expect(sourceNames(["none"])).toBe("no source");
    expect(confidenceLabel(undefined)).toBe("no entry");
    expect(confidenceLabel("low")).toBe("low");
  });

  it('calls the "pools" entry what it is', () => {
    expect(provenanceLabel("pools")).toBe("placed by an override");
    expect(provenanceRows(player()).map(([f]) => f)).not.toContain("pools");
    const placed = player({
      provenance: { pools: { ...entry("high"), source: "override" } },
    });
    expect(provenanceRows(placed).at(-1)?.[0]).toBe("pools");
  });

  it("prints values with their dates and club names", () => {
    expect(fieldValue(player(), "caps", (id) => id)).toBe(
      "90 (as of 2026-08-01)",
    );
    expect(
      fieldValue(player({ clubId: "esperance" }), "clubId", () => "EST"),
    ).toBe("EST");
    expect(fieldValue(player(), "positionDetail", (id) => id)).toBe("none");
  });

  it("links the articles and the Wikidata item", () => {
    expect(articleLinks(player())).toEqual([
      {
        label: "English Wikipedia",
        href: "https://en.wikipedia.org/wiki/Ali_Ma%C3%A2loul",
      },
      {
        label: "French Wikipedia",
        href: "https://fr.wikipedia.org/wiki/Ali_Ma%C3%A2loul_(football)",
      },
      { label: "Wikidata", href: "https://www.wikidata.org/wiki/Q1" },
    ]);
  });
});

describe("summarize", () => {
  it("counts the pools, the dropped by reason and the newest read", () => {
    const pool: Pool = {
      version: 1,
      players: [
        player(),
        player({
          id: "b",
          wikidataId: "Q2",
          pools: { active: true, legend: true },
          provenance: { caps: { ...entry("low"), retrievedAt: "2026-10-04" } },
        }),
      ],
      clubs: [],
      honours: [],
      flags: [
        { subject: "Q2", kind: "photo-small", detail: "" },
        { subject: "Q2", kind: "caps-maybe-stale", detail: "" },
        { subject: "Q1", kind: "photo-small", detail: "" },
        { subject: "Club title", kind: "club-unresolved", detail: "" },
      ],
      dropped: [{ wikidataId: "Q9", name: "X", reason: "no-pool", flags: [] }],
    };
    expect(summarize(pool)).toMatchObject({
      players: 2,
      active: 2,
      legend: 1,
      both: 1,
      flags: 4,
      dropped: [
        ["excluded", 0],
        ["not-candidate", 0],
        ["no-pool", 1],
        ["missing-field", 0],
      ],
      newestRead: "2026-10-04",
    });
    expect(flagKinds(pool)).toEqual([
      ["photo-small", 2],
      ["caps-maybe-stale", 1],
    ]);
  });
});
