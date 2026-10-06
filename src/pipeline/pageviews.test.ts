import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HttpError } from "./http.ts";
import type { PoliteClient } from "./http.ts";
import {
  addToCache,
  fetchViews,
  monthWindow,
  pageviewsUrl,
  parsePageviews,
  planPageviews,
  tooManyNotFound,
  viewsOf,
  windowKey,
} from "./pageviews.ts";
import type { Measured, ViewsCache } from "./pageviews.ts";

// Hand-written in the Pageviews API's answer shape (all-access, user agent,
// monthly), with Hannibal Mejbri's 12-month totals from the research, and
// the 404 body.
const fixture = (name: string) =>
  JSON.parse(
    readFileSync(
      path.join(import.meta.dirname, "__fixtures__", `pageviews-${name}.json`),
      "utf8",
    ),
  ) as unknown;

const window = monthWindow("2026-10-04");

describe("the page views window and URL", () => {
  it("is the 12 full months before the run date", () => {
    expect(window).toEqual({ from: "202510", to: "202609" });
    expect(monthWindow("2027-01-31")).toEqual({ from: "202601", to: "202612" });
    expect(windowKey(window)).toBe("202510-202609");
  });

  it("pageviewsUrl builds the per-article monthly URL for the 12 full months before the run date", () => {
    expect(pageviewsUrl("en", "Wahbi Khazri", window)).toBe(
      "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/Wahbi_Khazri/monthly/2025100100/2026090100",
    );
    expect(pageviewsUrl("ar", "وهبي الخزري", window)).toBe(
      `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/ar.wikipedia/all-access/user/${encodeURIComponent("وهبي_الخزري")}/monthly/2025100100/2026090100`,
    );
    expect(pageviewsUrl("fr", "Ali Maâloul (football)", window)).toContain(
      "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/fr.wikipedia/all-access/user/Ali_Ma%C3%A2loul_(football)/monthly/2025100100/2026090100",
    );
  });
});

describe("parsePageviews", () => {
  it("sums the monthly items", () => {
    expect(parsePageviews(fixture("en"))).toBe(258284);
    expect(parsePageviews(fixture("fr"))).toBe(140531);
    expect(parsePageviews(fixture("ar"))).toBe(31582);
  });

  it("throws on an answer without items", () => {
    expect(() => parsePageviews(fixture("404"))).toThrow(/no items/);
    expect(() => parsePageviews({ items: [{ views: -1 }] })).toThrow();
  });

  it("a 404 means no such article: null, and no error", async () => {
    const client: PoliteClient = {
      getJson: async (url) => {
        throw new HttpError(url, 404);
      },
      getText: async () => "",
    };
    expect(await fetchViews(client, "fr", "Nobody", window)).toBeNull();
  });

  it("another error stops the fetch", async () => {
    const client: PoliteClient = {
      getJson: async (url) => {
        throw new HttpError(url, 500);
      },
      getText: async () => "",
    };
    await expect(fetchViews(client, "fr", "Nobody", window)).rejects.toThrow(
      /HTTP 500/,
    );
  });
});

const khazri: Measured = {
  id: "wahbi-khazri",
  wiki: { en: "Wahbi Khazri", fr: "Wahbi Khazri", ar: "وهبي الخزري" },
  previous: null,
};
const meriah: Measured = {
  id: "yassine-meriah",
  wiki: { en: "Yassine Meriah", fr: null, ar: null },
  previous: null,
};

describe("tooManyNotFound (pageviews fix)", () => {
  it("is true when more than 10% of the articles asked were not found", () => {
    expect(tooManyNotFound(90, 10)).toBe(false);
    expect(tooManyNotFound(89, 11)).toBe(true);
    expect(tooManyNotFound(0, 1)).toBe(true);
    expect(tooManyNotFound(0, 0)).toBe(false);
  });
});

describe("planPageviews", () => {
  it("views are fetched once per month window: a cache entry for the same window is reused, a new window refetches", () => {
    const cache: ViewsCache = addToCache({}, window, [
      { lang: "en", title: "Wahbi Khazri", views: 1 },
      { lang: "fr", title: "Wahbi Khazri", views: 2 },
      { lang: "ar", title: "وهبي الخزري", views: 3 },
    ]);
    expect(
      planPageviews({ players: [khazri], cache, window, max: 70 }),
    ).toEqual([]);
    const next = monthWindow("2026-11-02");
    expect(
      planPageviews({ players: [khazri], cache, window: next, max: 70 }),
    ).toEqual([
      { lang: "en", title: "Wahbi Khazri" },
      { lang: "fr", title: "Wahbi Khazri" },
      { lang: "ar", title: "وهبي الخزري" },
    ]);
  });

  it("measures the never-measured first, whole footballers only, within the budget", () => {
    const cache = addToCache({}, { from: "202509", to: "202608" }, [
      { lang: "en", title: "Wahbi Khazri", views: 1 },
      { lang: "fr", title: "Wahbi Khazri", views: 2 },
      { lang: "ar", title: "وهبي الخزري", views: 3 },
    ]);
    // Meriah was never measured: he goes first, then Khazri does not fit.
    expect(
      planPageviews({ players: [khazri, meriah], cache, window, max: 3 }),
    ).toEqual([{ lang: "en", title: "Yassine Meriah" }]);
    expect(
      planPageviews({ players: [khazri, meriah], cache, window, max: 4 }),
    ).toHaveLength(4);
    expect(
      planPageviews({ players: [khazri, meriah], cache, window, max: 0 }),
    ).toEqual([]);
  });
});

describe("viewsOf", () => {
  it("is null until every article was measured; no article counts 0", () => {
    expect(viewsOf(khazri, {})).toBeNull();
    const cache = addToCache({}, window, [
      { lang: "en", title: "Yassine Meriah", views: 9000 },
    ]);
    expect(viewsOf(meriah, cache)).toEqual({
      views: { en: 9000, fr: 0, ar: 0 },
      window: "202510-202609",
    });
    expect(
      viewsOf({ ...meriah, wiki: { en: null, fr: null, ar: null } }, {}),
    ).toEqual({ views: { en: 0, fr: 0, ar: 0 }, window: "" });
  });

  it("falls back to the last pool's counts when the cache has none", () => {
    const previous = {
      score: 3.95,
      tier: "D" as const,
      views: { en: 9000, fr: 0, ar: 0 },
      window: "202509-202608",
      localStar: false,
    };
    expect(viewsOf({ ...meriah, previous }, {})).toEqual({
      views: { en: 9000, fr: 0, ar: 0 },
      window: "202509-202608",
    });
  });

  it("the cache keeps the two newest windows", () => {
    let cache: ViewsCache = {};
    for (const today of ["2026-08-01", "2026-09-01", "2026-10-01"])
      cache = addToCache(cache, monthWindow(today), [
        { lang: "en", title: "X", views: 1 },
      ]);
    expect(Object.keys(cache).sort()).toEqual([
      "202509-202608",
      "202510-202609",
    ]);
  });
});
