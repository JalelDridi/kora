import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { confederationOf, governorateSlug, slugify } from "./places.ts";
import { firstPosition, lineFromLabel } from "./positions.ts";
import { regions, type GovernorateRow } from "./types.ts";

describe("governorateSlug", () => {
  it("maps Wikidata's English labels, accents and articles included", () => {
    expect(governorateSlug("Tunis Governorate")).toBe("tunis");
    expect(governorateSlug("Ben Arous Governorate")).toBe("ben-arous");
    expect(governorateSlug("Médenine Governorate")).toBe("medenine");
    expect(governorateSlug("Le Kef Governorate")).toBe("kef");
    expect(governorateSlug("La Manouba Governorate")).toBe("manouba");
    expect(governorateSlug("Paris")).toBeNull();
  });

  it("covers all 24 rows of the curated table, each with a known region", () => {
    const rows = JSON.parse(
      readFileSync("data/curated/governorates.json", "utf8"),
    ) as GovernorateRow[];
    expect(rows).toHaveLength(24);
    expect(new Set(rows.map((r) => r.id)).size).toBe(24);
    for (const row of rows) {
      expect(governorateSlug(`${row.nameLatin} Governorate`)).toBe(row.id);
      expect(regions).toContain(row.region);
      expect(row.nameArabic).toMatch(/\p{Script=Arabic}/u);
    }
  });
});

describe("confederationOf", () => {
  it("knows each confederation, Monaco with UEFA, and nothing else", () => {
    expect(confederationOf("TN")).toBe("CAF");
    expect(confederationOf("GB")).toBe("UEFA");
    expect(confederationOf("MC")).toBe("UEFA");
    expect(confederationOf("QA")).toBe("AFC");
    expect(confederationOf("US")).toBe("CONCACAF");
    expect(confederationOf("BR")).toBe("CONMEBOL");
    expect(confederationOf("NZ")).toBe("OFC");
    expect(confederationOf("ZZ")).toBeNull();
    expect(confederationOf(null)).toBeNull();
  });
});

describe("slugify", () => {
  it("makes ids from names", () => {
    expect(slugify("Ali Maâloul")).toBe("ali-maaloul");
    expect(slugify("Espérance Sportive de Tunis")).toBe(
      "esperance-sportive-de-tunis",
    );
    expect(slugify("1. FC Köln")).toBe("1-fc-koln");
  });
});

describe("positions", () => {
  it("map English and French labels to a line", () => {
    expect(lineFromLabel("goalkeeper")).toBe("goalkeeper");
    expect(lineFromLabel("centre-back")).toBe("defender");
    expect(lineFromLabel("wing-back")).toBe("defender");
    expect(lineFromLabel("wing half")).toBe("midfielder");
    expect(lineFromLabel("defensive midfielder")).toBe("midfielder");
    expect(lineFromLabel("winger")).toBe("forward");
    expect(lineFromLabel("Défenseur central")).toBe("defender");
    expect(lineFromLabel("Milieu offensif")).toBe("midfielder");
    expect(lineFromLabel("Attaquant")).toBe("forward");
    expect(lineFromLabel("association football manager")).toBeNull();
  });

  it("read the first of several positions", () => {
    expect(firstPosition("Centre-back / Defensive midfielder")).toBe(
      "Centre-back",
    );
    expect(firstPosition("Forward, winger")).toBe("Forward");
  });
});
