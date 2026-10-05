import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  chunk,
  pagepropsUrl,
  parsePageprops,
  parseRevisions,
  redirectsUrl,
  revisionsUrl,
  unanswered,
} from "./fetch.ts";

describe("revisionsUrl and redirectsUrl", () => {
  it("asks for the full content of up to 50 titles, following redirects, with maxlag", () => {
    const url = new URL(revisionsUrl("fr", ["Wahbi Khazri", "Ali Maâloul"]));
    expect(url.host).toBe("fr.wikipedia.org");
    expect(url.searchParams.get("titles")).toBe("Wahbi Khazri|Ali Maâloul");
    expect(url.searchParams.get("rvslots")).toBe("main");
    expect(url.searchParams.get("redirects")).toBe("1");
    expect(url.searchParams.get("maxlag")).toBe("5");
    expect(url.searchParams.has("rvsection")).toBe(false);
    expect(url.searchParams.get("rvprop")).toBe("content|ids|timestamp");
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
              {
                revid: 7,
                timestamp: "2026-09-30T10:00:00Z",
                slots: { main: { content: "{{Infobox}}" } },
              },
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
      {
        title: "Wahbi Khazri",
        revid: 7,
        timestamp: "2026-09-30T10:00:00Z",
        wikitext: "{{Infobox}}",
      },
      {
        title: "Espérance Sportive de Tunis",
        revid: 8,
        timestamp: null,
        wikitext: "x",
      },
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

// Final wave, B6: a batch whose pages come back without content, and with no
// `continue` to say so, must fail its source instead of being cached.
describe("unanswered", () => {
  it("names the titles with no content and no missing mark, after moves", () => {
    const json = {
      query: {
        normalized: [{ from: "ali maaloul", to: "Ali Maaloul" }],
        redirects: [{ from: "Ali Maaloul", to: "Ali Maâloul" }],
        pages: [
          {
            title: "Ali Maâloul",
            revisions: [{ revid: 1, slots: { main: { content: "{{x}}" } } }],
          },
          { title: "Nobody", missing: true },
          { title: "Cut Short" },
        ],
      },
    };
    expect(
      unanswered(json, ["ali maaloul", "Nobody", "Cut Short", "Not Listed"]),
    ).toEqual(["Cut Short", "Not Listed"]);
  });
});

describe("pagepropsUrl and parsePageprops (squad links, S13)", () => {
  it("pagepropsUrl asks pageprops wikibase_item with redirects", () => {
    const url = new URL(pagepropsUrl("fr", ["Youcef Belaïli", "Namory Keita"]));
    expect(url.host).toBe("fr.wikipedia.org");
    expect(url.searchParams.get("prop")).toBe("pageprops");
    expect(url.searchParams.get("ppprop")).toBe("wikibase_item");
    expect(url.searchParams.get("redirects")).toBe("1");
    expect(url.searchParams.get("maxlag")).toBe("5");
    expect(url.searchParams.get("titles")).toBe("Youcef Belaïli|Namory Keita");
  });

  it("parsePageprops follows normalized and redirects to a Wikidata id", () => {
    // Recorded (squad-list research, fr.wikipedia, 4 October 2026), cut to
    // four pages: one reached through a redirect, one missing.
    const recorded = JSON.parse(
      readFileSync(
        path.join(
          import.meta.dirname,
          "__fixtures__",
          "squads",
          "pageprops-fr.json",
        ),
        "utf8",
      ),
    );
    const ids = parsePageprops(recorded);
    expect(ids.get("Jesús Castillo")).toBe("Q110321491");
    expect(ids.get("Jesús Castillo (football, 2001)")).toBe("Q110321491");
    expect(ids.get("Youcef Belaïli")).toBe("Q3572787");
    expect(ids.has("Namory Keita")).toBe(false);
    // Hand-made: a normalized title, then a redirect.
    const moved = parsePageprops({
      query: {
        normalized: [{ from: "ali test", to: "Ali test" }],
        redirects: [{ from: "Ali test", to: "Ali Test" }],
        pages: [{ title: "Ali Test", pageprops: { wikibase_item: "Q7" } }],
      },
    });
    expect(moved.get("ali test")).toBe("Q7");
    expect(() =>
      parsePageprops({ error: { code: "maxlag", info: "lagged" } }),
    ).toThrow("MediaWiki error maxlag");
  });
});
