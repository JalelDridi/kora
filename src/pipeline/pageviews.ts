// Wikipedia page views for the fame score (D-S2-4), from the Wikimedia
// Pageviews API: one request per article, 12 full months, all access
// methods, user agents only.
// A full measure is about 600 requests a month. The API is a separate
// service with its own client and cap (P49): at least 250 ms apart and at
// most 800 HTTP attempts a run, retries included, outside the budget of 70
// for Wikidata and the MediaWiki API. Each run measures every footballer
// whose count is missing or from an earlier window, those never measured
// first, and keeps every count it got in data/cache/pageviews.json and in
// the pool.

import { HttpError } from "./http.ts";
import type { PoliteClient } from "./http.ts";
import type { Fame, PageViews } from "./types.ts";

export const PAGEVIEWS_LANGS = ["en", "fr", "ar"] as const;
export type ViewLang = (typeof PAGEVIEWS_LANGS)[number];

/** Twelve full months, as YYYYMM. */
export type MonthWindow = { from: string; to: string };

/** "202510-202609". */
export function windowKey(w: MonthWindow): string {
  return `${w.from}-${w.to}`;
}

/** The 12 full months that end with last month. */
export function monthWindow(today: string): MonthWindow {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)); // 1..12, this month
  const at = (back: number) => {
    const total = year * 12 + (month - 1) - back;
    return `${Math.floor(total / 12)}${String((total % 12) + 1).padStart(2, "0")}`;
  };
  return { from: at(12), to: at(1) };
}

export function pageviewsUrl(
  lang: ViewLang,
  title: string,
  window: MonthWindow,
): string {
  const article = encodeURIComponent(title.replace(/ /g, "_"));
  return (
    "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/" +
    `${lang}.wikipedia/all-access/user/${article}/monthly/${window.from}0100/${window.to}0100`
  );
}

/** The sum of the monthly counts; throws on anything else. */
export function parsePageviews(json: unknown): number {
  const items = (json as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) throw new Error("no items in the page views");
  let sum = 0;
  for (const item of items) {
    const views = (item as { views?: unknown } | null)?.views;
    if (typeof views !== "number" || !Number.isInteger(views) || views < 0)
      throw new Error("a month without a view count");
    sum += views;
  }
  return sum;
}

/**
 * One article's views; null when the API does not know the article (404).
 * A real 404 is rare: the run counts them and distrusts a night with many
 * (tooManyNotFound), so a broken URL can never turn everyone into tier D.
 */
export async function fetchViews(
  client: PoliteClient,
  lang: ViewLang,
  title: string,
  window: MonthWindow,
): Promise<number | null> {
  try {
    return parsePageviews(
      await client.getJson(pageviewsUrl(lang, title, window)),
    );
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  }
}

/** More than a tenth of the articles asked came back "not found". */
export function tooManyNotFound(read: number, notFound: number): boolean {
  return notFound > 0 && notFound * 10 > read + notFound;
}

/** Counts per window, per article: { "202510-202609": { "en:Wahbi Khazri": 258284 } }. */
export type ViewsCache = Record<string, Record<string, number>>;

export type Measured = {
  id: string;
  wiki: { en: string | null; fr: string | null; ar: string | null };
  /** Last build's fame, used when the cache has nothing for a title. */
  previous: Fame | null;
};

const articleKey = (lang: ViewLang, title: string) => `${lang}:${title}`;

/** The newest window holding this article's count, with the count. */
function newest(
  cache: ViewsCache,
  lang: ViewLang,
  title: string,
): { window: string; views: number } | null {
  const windows = Object.keys(cache).sort().reverse();
  for (const w of windows) {
    const views = cache[w][articleKey(lang, title)];
    if (views !== undefined) return { window: w, views };
  }
  return null;
}

/**
 * A footballer's views and the oldest window they come from. A language
 * without an article counts 0. Null when one of his articles has never been
 * measured, in the cache or in the last pool.
 */
export function viewsOf(
  m: Measured,
  cache: ViewsCache,
): { views: PageViews; window: string } | null {
  const views: PageViews = { en: 0, fr: 0, ar: 0 };
  const windows: string[] = [];
  for (const lang of PAGEVIEWS_LANGS) {
    const title = m.wiki[lang];
    if (title === null) continue;
    const found = newest(cache, lang, title);
    if (found) {
      views[lang] = found.views;
      windows.push(found.window);
    } else if (m.previous?.views && m.previous.window) {
      views[lang] = m.previous.views[lang];
      windows.push(m.previous.window);
    } else return null;
  }
  // No article at all: measured, with no views.
  return { views, window: windows.sort()[0] ?? "" };
}

/**
 * The articles to fetch this run, at most `max`, whole footballers only:
 * those never measured first, then those measured longest ago; an article
 * already counted for this window is never fetched again.
 */
export function planPageviews(input: {
  players: Measured[];
  cache: ViewsCache;
  window: MonthWindow;
  max: number;
}): { lang: ViewLang; title: string }[] {
  const current = input.cache[windowKey(input.window)] ?? {};
  const wanted = input.players
    .map((m) => {
      const missing = PAGEVIEWS_LANGS.filter(
        (lang) =>
          m.wiki[lang] !== null &&
          current[articleKey(lang, m.wiki[lang]!)] === undefined,
      ).map((lang) => ({ lang, title: m.wiki[lang]! }));
      const measured = viewsOf(m, input.cache);
      // Never measured sorts first (""), then the oldest window.
      return { id: m.id, missing, since: measured?.window ?? "" };
    })
    .filter((w) => w.missing.length > 0)
    .sort((a, b) =>
      a.since !== b.since
        ? a.since < b.since
          ? -1
          : 1
        : a.id < b.id
          ? -1
          : a.id > b.id
            ? 1
            : 0,
    );
  const out: { lang: ViewLang; title: string }[] = [];
  const seen = new Set<string>();
  for (const w of wanted) {
    const fresh = w.missing.filter(
      (a) => !seen.has(articleKey(a.lang, a.title)),
    );
    if (out.length + fresh.length > input.max) break;
    for (const a of fresh) {
      seen.add(articleKey(a.lang, a.title));
      out.push(a);
    }
  }
  return out;
}

/** Adds this run's counts to the cache, keeping only the two newest windows. */
export function addToCache(
  cache: ViewsCache,
  window: MonthWindow,
  counts: { lang: ViewLang; title: string; views: number }[],
): ViewsCache {
  const key = windowKey(window);
  const next: ViewsCache = { ...cache, [key]: { ...(cache[key] ?? {}) } };
  for (const c of counts) next[key][articleKey(c.lang, c.title)] = c.views;
  const keep = Object.keys(next).sort().reverse().slice(0, 2);
  return Object.fromEntries(keep.map((k) => [k, next[k]]));
}
