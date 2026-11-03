import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Pool, PoolPlayer } from "@/pipeline/types.ts";
import {
  articleLinks,
  confidenceLabel,
  fieldValue,
  diffAgainstToday,
  dropUnchanged,
  flagKinds,
  fold,
  formValue,
  overrideRows,
  matches,
  paginate,
  parseFilters,
  poolsLabel,
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

  it("shows the grace date in the pools column (P54)", () => {
    expect(poolsLabel(player({ pools: { active: true, legend: true } }))).toBe(
      "active, legend",
    );
    expect(
      poolsLabel(
        player({
          pools: { active: false, legend: true, graceUntil: "2026-12-03" },
        }),
      ),
    ).toBe("legend, grace until 2026-12-03");
    expect(
      poolsLabel(
        player({
          pools: { active: false, legend: false, graceUntil: "2026-12-03" },
        }),
      ),
    ).toBe("grace until 2026-12-03");
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

describe("overrideRows", () => {
  const names = {
    club: (id: string) => (id === "Q290540" ? "Étoile du Sahel" : undefined),
    clubQid: (slug: string) =>
      slug === "etoile-du-sahel" ? "Q290540" : undefined,
    governorate: (id: string) => (id === "sfax" ? "Sfax" : undefined),
  };
  const stamp = { by: "jalel", at: "2026-10-07", note: "squad lists" };

  it("gives each of the fourteen fields today's value, its source and the override in force", () => {
    const rows = overrideRows(
      player({ clubId: "etoile-du-sahel" }),
      { club: { value: "Q290540", ...stamp } },
      names,
    );
    expect(rows.map((r) => r.field)).toEqual([
      "club",
      "position",
      "positionDetail",
      "caps",
      "goals",
      "capsAsOf",
      "birthDate",
      "governorate",
      "birthCountry",
      "nameArabic",
      "aliases",
      "pools",
      "exclude",
      "include",
      "localStar",
    ]);
    const by = Object.fromEntries(rows.map((r) => [r.field, r]));
    expect(by.club).toMatchObject({
      label: "Club",
      today: "Q290540",
      todayText: "Étoile du Sahel",
      override: { value: "Q290540", text: "Étoile du Sahel", ...stamp },
    });
    expect(by.caps).toMatchObject({
      label: "Caps",
      today: 90,
      todayText: "90",
      provenance: { confidence: "high", source: "enwiki" },
      override: null,
    });
    expect(by.capsAsOf.provenance).toEqual(by.caps.provenance);
    expect(by.governorate.todayText).toBe("Sfax");
    expect(by.positionDetail).toMatchObject({ today: null, todayText: "none" });
    expect(by.pools).toMatchObject({
      today: { active: true, legend: false },
      todayText: "active",
    });
    expect(by.exclude).toMatchObject({ today: false, todayText: "no" });
    expect(by.include).toMatchObject({ today: false, todayText: "no" });
    expect(by.localStar).toMatchObject({ today: false, todayText: "no" });
  });

  it("knows no value today for a footballer outside the pool", () => {
    const rows = overrideRows(
      null,
      { exclude: { value: true, ...stamp } },
      names,
    );
    expect(rows.every((r) => r.today === undefined)).toBe(true);
    expect(rows[0].todayText).toBe("not in the pool");
    expect(rows.find((r) => r.field === "exclude")?.override?.text).toBe("yes");
  });

  it("writes each value as the form holds it", () => {
    expect(formValue("caps", 90)).toBe("90");
    expect(formValue("club", null)).toBe("none");
    expect(formValue("governorate", null)).toBe("none");
    expect(formValue("positionDetail", null)).toBe("");
    expect(formValue("aliases", ["A", "B"])).toBe("A\nB");
    expect(formValue("caps", undefined)).toBe("");
  });

  it("drops a value left at today's when no override is in force, and keeps the rest", () => {
    const rows = overrideRows(
      player({ clubId: "etoile-du-sahel" }),
      { club: { value: "Q290540", ...stamp } },
      names,
    );
    expect(
      dropUnchanged(
        [
          { field: "club", to: "Q290540" },
          { field: "caps", to: 90 },
          { field: "goals", to: 4 },
          { field: "pools", to: { active: true, legend: false } },
          { field: "aliases", to: [] },
          { field: "governorate", remove: true },
        ],
        rows,
      ),
    ).toEqual([
      { field: "club", to: "Q290540" },
      { field: "goals", to: 4 },
      { field: "governorate", remove: true },
    ]);
    expect(
      dropUnchanged(
        [{ field: "caps", to: 90 }],
        overrideRows(null, undefined, names),
      ),
    ).toEqual([{ field: "caps", to: 90 }]);
  });

  it("shows today's value as the before of a field with no override", () => {
    const rows = overrideRows(
      player({ clubId: "etoile-du-sahel" }),
      { club: { value: null, ...stamp } },
      names,
    );
    expect(
      diffAgainstToday(
        [
          { path: "players.Q1.caps", before: "none", after: "91" },
          { path: "players.Q1.club", before: "none", after: "Q2" },
        ],
        rows,
      ),
    ).toEqual([
      { path: "players.Q1.caps", before: "90", after: "91" },
      { path: "players.Q1.club", before: "none", after: "Q2" },
    ]);
  });
});

// Task 3 review, M1: the pool pages need the field names, not Prettier,
// which overrides-patch.ts loads (json-text.ts) to write the file.
describe("what the pool pages load", () => {
  it("takes the override fields from a module that does not load Prettier", () => {
    const imports = (file: string) =>
      [...readFileSync(file, "utf8").matchAll(/from "([^"]+)"/g)].map(
        (m) => m[1],
      );
    expect(imports("src/admin/pool.ts")).not.toContain(
      "@/admin/edit/overrides-patch.ts",
    );
    expect(imports("src/admin/pool.ts")).toContain("@/admin/edit/fields.ts");
    expect(
      imports("src/admin/edit/fields.ts").every((m) =>
        m.startsWith("../../pipeline/"),
      ),
    ).toBe(true);
  });
});
