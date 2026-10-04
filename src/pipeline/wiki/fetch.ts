// URLs and response parsing for the MediaWiki Action API. The fetching itself
// is the polite client's job (http.ts).

export const BATCH = 50;

export type Page = {
  title: string;
  revid: number;
  /** When the revision was saved; null when the answer does not say. */
  timestamp: string | null;
  wikitext: string;
};

export function chunk<T>(items: T[], size = BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

function api(lang: "en" | "fr", params: Record<string, string>): string {
  const query = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    maxlag: "5",
    ...params,
  });
  return `https://${lang}.wikipedia.org/w/api.php?${query}`;
}

/** Full content (Task 1 measured 538 KB for 35 articles; small enough). */
export function revisionsUrl(lang: "en" | "fr", titles: string[]): string {
  return api(lang, {
    prop: "revisions",
    rvprop: "content|ids|timestamp",
    rvslots: "main",
    redirects: "1",
    titles: titles.join("|"),
  });
}

export function redirectsUrl(lang: "en" | "fr", titles: string[]): string {
  return api(lang, { redirects: "1", titles: titles.join("|") });
}

type Revision = {
  revid?: number;
  timestamp?: string;
  slots?: { main?: { content?: string } };
};
type ApiPage = {
  title?: string;
  missing?: boolean;
  invalid?: boolean;
  revisions?: Revision[];
};
type Move = { from?: string; to?: string };
type ApiResponse = {
  error?: { code?: string; info?: string };
  query?: { normalized?: Move[]; redirects?: Move[]; pages?: ApiPage[] };
};

export function parseRevisions(json: unknown): {
  pages: Page[];
  aliases: [string, string][];
} {
  const response = json as ApiResponse;
  if (response?.error) {
    throw new Error(
      `MediaWiki error ${response.error.code}: ${response.error.info}`,
    );
  }
  const query = response?.query ?? {};
  const aliases: [string, string][] = [
    ...(query.normalized ?? []),
    ...(query.redirects ?? []),
  ]
    .filter((m): m is { from: string; to: string } => Boolean(m.from && m.to))
    .map((m) => [m.from, m.to]);
  const pages: Page[] = [];
  for (const page of query.pages ?? []) {
    const revision = page.revisions?.[0];
    const content = revision?.slots?.main?.content;
    if (!page.title || page.missing || content === undefined) continue;
    pages.push({
      title: page.title,
      revid: revision?.revid ?? 0,
      timestamp: revision?.timestamp ?? null,
      wikitext: content,
    });
  }
  return { pages, aliases };
}

/**
 * The asked titles the answer leaves without an account (final wave, B6):
 * each title, followed through `normalized` and `redirects`, must reach a
 * page with content, or one marked missing or invalid. A page listed with
 * neither (content cut without `continue`) must not be cached as fresh.
 */
export function unanswered(json: unknown, titles: string[]): string[] {
  const query = (json as ApiResponse)?.query ?? {};
  const moves = new Map(
    [...(query.normalized ?? []), ...(query.redirects ?? [])]
      .filter((m): m is { from: string; to: string } => Boolean(m.from && m.to))
      .map((m) => [m.from, m.to]),
  );
  const accounted = new Set(
    (query.pages ?? [])
      .filter(
        (p) =>
          p.title &&
          (p.missing ||
            p.invalid ||
            p.revisions?.[0]?.slots?.main?.content !== undefined),
      )
      .map((p) => p.title as string),
  );
  return titles.filter((title) => {
    let to = title;
    for (let i = 0; i < 4 && moves.has(to); i++) to = moves.get(to)!;
    return !accounted.has(to);
  });
}

/**
 * One answer's `normalized`, `redirects` and `pages`, as sent, for the cache
 * (final wave, B8): parseRevisions reads it again on every build, so a
 * change in how moves or pages are read needs no new request. `content` may
 * shorten each page's wikitext (the run keeps section 0 only).
 */
export type RawBatch = {
  normalized?: Move[];
  redirects?: Move[];
  pages: ApiPage[];
};

export function rawBatch(
  json: unknown,
  content: (wikitext: string) => string = (w) => w,
): RawBatch {
  const query = (json as ApiResponse)?.query ?? {};
  const pages = (query.pages ?? []).map((page) => {
    if (!page.revisions) return page;
    return {
      ...page,
      revisions: page.revisions.map((r) => {
        const text = r.slots?.main?.content;
        return text === undefined
          ? r
          : {
              ...r,
              slots: {
                ...r.slots,
                main: { ...r.slots!.main, content: content(text) },
              },
            };
      }),
    };
  });
  return {
    ...(query.normalized ? { normalized: query.normalized } : {}),
    ...(query.redirects ? { redirects: query.redirects } : {}),
    pages,
  };
}
