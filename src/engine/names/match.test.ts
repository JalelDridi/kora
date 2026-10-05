import { describe, expect, it } from "vitest";
import corpus from "./__fixtures__/corpus.json" with { type: "json" };
import variants from "./__fixtures__/variants.json" with { type: "json" };
import { buildEntries, match } from "./match.ts";
import type { NameSource } from "./match.ts";

// The research's corpus: 107 footballers, en and ar labels only, no aliases;
// fame follows the research's sitelink order.
const names: NameSource[] = corpus.map((c) => ({
  id: c.id,
  nameLatin: c.nameLatin,
  nameArabic: c.nameArabic,
  nameFrench: null,
  aliases: [],
  fame: c.fame,
}));
const entries = buildEntries(names);

function hits(rows: typeof variants): number {
  return rows.filter((row) => {
    const top = match(entries, row.variant, 5);
    return row.expected.every((id) => top.includes(id));
  }).length;
}

describe("match on the research's variants", () => {
  it("observed variants: at least 213 of 245 in the top 5", () => {
    const observed = variants.filter((v) => v.source !== "generated-rule");
    expect(observed).toHaveLength(245);
    expect(hits(observed)).toBeGreaterThanOrEqual(213);
  });

  it("generated variants: at least 620 of 634 in the top 5", () => {
    const generated = variants.filter((v) => v.source === "generated-rule");
    expect(generated).toHaveLength(634);
    expect(hits(generated)).toBeGreaterThanOrEqual(620);
  });

  it("ambiguous rows list every expected footballer in the top 5", () => {
    const ambiguous = variants.filter((v) => v.expected.length > 1);
    expect(ambiguous.length).toBeGreaterThan(0);
    expect(hits(ambiguous)).toBe(ambiguous.length);
  });
});

describe("match", () => {
  const bouazizi: NameSource = {
    id: "riadh-bouazizi",
    nameLatin: "Riadh Bouazizi",
    nameArabic: "رياض البوعزيزي",
    nameFrench: null,
    aliases: [],
    fame: 1,
  };
  const other: NameSource = {
    id: "riadh-jelassi",
    nameLatin: "Riadh Jelassi",
    nameArabic: null,
    nameFrench: null,
    aliases: [],
    fame: 2,
  };

  it("one extra name in the middle is allowed", () => {
    const small = buildEntries([bouazizi, other]);
    expect(match(small, "Riadh Ben Khemais Bouazizi")[0]).toBe(
      "riadh-bouazizi",
    );
  });

  it("shared surnames rank by fame", () => {
    const small = buildEntries([
      {
        ...bouazizi,
        id: "a-ben-youssef",
        nameLatin: "Syam Ben Youssef",
        fame: 3,
      },
      {
        ...bouazizi,
        id: "b-ben-youssef",
        nameLatin: "Fakhreddine Ben Youssef",
        fame: 9,
      },
    ]);
    expect(match(small, "ben youssef")).toEqual([
      "b-ben-youssef",
      "a-ben-youssef",
    ]);
  });

  it("aliases and the French name are searched", () => {
    const small = buildEntries([
      { ...bouazizi, nameFrench: "Riadh Bouazizi", aliases: ["Bouaz"] },
      other,
    ]);
    expect(match(small, "bouaz")).toEqual(["riadh-bouazizi"]);
  });

  it("an empty or one-letter query returns nothing", () => {
    expect(match(entries, "")).toEqual([]);
    expect(match(entries, "   ")).toEqual([]);
    expect(match(entries, "m")).toEqual([]);
    expect(match(entries, "م")).toEqual([]);
  });

  it("1,000 queries over 400 names take under 3 s in total", () => {
    const many = buildEntries(
      Array.from({ length: 4 }, (_, copy) =>
        names.map((n) => ({ ...n, id: `${n.id}-${copy}` })),
      )
        .flat()
        .slice(0, 400),
    );
    const queries = variants.slice(0, 1000).map((v) => v.variant);
    while (queries.length < 1000) queries.push(...queries.slice(0, 1000));
    const start = performance.now();
    for (const q of queries.slice(0, 1000)) match(many, q);
    expect(performance.now() - start).toBeLessThan(3000);
  });
});
