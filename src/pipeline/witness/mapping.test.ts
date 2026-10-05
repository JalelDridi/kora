import { describe, expect, it } from "vitest";
import {
  mappingCounts,
  mappingFromJson,
  mappingQuery,
  mappingToJson,
  parseMapping,
} from "./mapping.ts";

// Synthetic WDQS answers: invented ids, the real answer shape.
const uri = (q: string) => ({
  type: "uri",
  value: `http://www.wikidata.org/entity/${q}`,
});
const lit = (value: string) => ({ type: "literal", value });
const answer = {
  head: { vars: ["item", "tm", "nft", "tmClub"] },
  results: {
    bindings: [
      { item: uri("Q1"), tm: lit("111111"), nft: lit("22222") },
      { item: uri("Q2"), tm: lit("333333") },
      { item: uri("Q3") },
      { item: uri("Q900"), tmClub: lit("9999") },
    ],
  },
};

describe("the id mapping (B4)", () => {
  it("the query asks P2446 and P2574 for the pool's footballers and P7223 for the 16 Ligue 1 clubs", () => {
    const query = mappingQuery(["Q1", "Q2", "not-a-qid"], ["Q900", "Q901"]);
    expect(query).toContain("VALUES ?item { wd:Q1 wd:Q2 }");
    expect(query).toContain("OPTIONAL { ?item wdt:P2446 ?tm }");
    expect(query).toContain("OPTIONAL { ?item wdt:P2574 ?nft }");
    expect(query).toContain("VALUES ?item { wd:Q900 wd:Q901 }");
    expect(query).toContain("?item wdt:P7223 ?tmClub");
    expect(query).not.toContain("not-a-qid");
  });

  it("parses ids", () => {
    const mapping = parseMapping(answer);
    expect(mapping.players.get("Q1")).toEqual({
      transfermarkt: "111111",
      nft: "22222",
    });
    expect(mapping.players.get("Q2")).toEqual({ transfermarkt: "333333" });
    expect(mapping.players.get("Q3")).toEqual({});
    expect(mapping.clubs.get("Q900")).toBe("9999");
    // Kept privately as JSON, read back the same.
    const json = JSON.parse(
      JSON.stringify(
        mappingToJson(mapping, mappingCounts(mapping, ["Q1", "Q2", "Q3"])),
      ),
    );
    expect(mappingFromJson(json)).toEqual(mapping);
  });

  it("counts footballers without an id", () => {
    expect(
      mappingCounts(parseMapping(answer), ["Q1", "Q2", "Q3", "Q4"]),
    ).toEqual({
      players: 4,
      transfermarkt: 2,
      nft: 1,
      clubs: 1,
      withoutTransfermarkt: 2,
      withoutNft: 3,
    });
  });
});
