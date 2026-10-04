import { describe, expect, it } from "vitest";
import { chunk, parseRevisions, redirectsUrl, revisionsUrl } from "./fetch.ts";

describe("revisionsUrl and redirectsUrl", () => {
  it("asks for the full content of up to 50 titles, following redirects, with maxlag", () => {
    const url = new URL(revisionsUrl("fr", ["Wahbi Khazri", "Ali Maâloul"]));
    expect(url.host).toBe("fr.wikipedia.org");
    expect(url.searchParams.get("titles")).toBe("Wahbi Khazri|Ali Maâloul");
    expect(url.searchParams.get("rvslots")).toBe("main");
    expect(url.searchParams.get("redirects")).toBe("1");
    expect(url.searchParams.get("maxlag")).toBe("5");
    expect(url.searchParams.has("rvsection")).toBe(false);
  });

  it("resolves redirects without content", () => {
    const url = new URL(redirectsUrl("en", ["Esperance de Tunis"]));
    expect(url.searchParams.get("redirects")).toBe("1");
    expect(url.searchParams.has("prop")).toBe(false);
  });
});

describe("chunk", () => {
  it("splits into batches of 50 by default", () => {
    expect(
      chunk(Array.from({ length: 120 }, (_, i) => i)).map((b) => b.length),
    ).toEqual([50, 50, 20]);
  });
});

describe("parseRevisions", () => {
  it("returns content per final title and how requested titles moved", () => {
    const result = parseRevisions({
      query: {
        normalized: [{ from: "wahbi_Khazri", to: "Wahbi Khazri" }],
        redirects: [
          { from: "Esperance de Tunis", to: "Espérance Sportive de Tunis" },
        ],
        pages: [
          {
            title: "Wahbi Khazri",
            revisions: [
              { revid: 7, slots: { main: { content: "{{Infobox}}" } } },
            ],
          },
          {
            title: "Espérance Sportive de Tunis",
            revisions: [{ revid: 8, slots: { main: { content: "x" } } }],
          },
          { title: "Nobody", missing: true },
        ],
      },
    });
    expect(result.pages).toEqual([
      { title: "Wahbi Khazri", revid: 7, wikitext: "{{Infobox}}" },
      { title: "Espérance Sportive de Tunis", revid: 8, wikitext: "x" },
    ]);
    expect(result.aliases).toEqual([
      ["wahbi_Khazri", "Wahbi Khazri"],
      ["Esperance de Tunis", "Espérance Sportive de Tunis"],
    ]);
  });

  it("throws on an API error", () => {
    expect(() =>
      parseRevisions({ error: { code: "badvalue", info: "x" } }),
    ).toThrow(/badvalue/);
  });
});
