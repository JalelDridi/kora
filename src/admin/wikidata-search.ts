import { createPoliteClient, USER_AGENT } from "../pipeline/http.ts";
import type { Pool } from "../pipeline/types.ts";

// The add page's search (T-AD-5): Wikidata's own search (wbsearchentities),
// then one wbgetentities for its hits, read for what Jalel needs to choose:
// occupation footballer (P106 Q937857), Tunisia (P27 citizenship or P1532
// country for sport, Q948), the birth date, the English page. At most two
// requests a search, each given 5 s, with the pipeline's User-Agent; the
// search is done on the server, never in the browser.

export type SearchHit = {
  qid: string;
  label: string;
  description: string;
  footballer: boolean;
  tunisian: boolean;
  /** YYYY-MM-DD, YYYY-MM or YYYY, as precise as Wikidata says. */
  born: string | null;
  enwiki: string | null;
  /** His Kora id when he is in the deployed pool. */
  inPool: string | null;
  /** Met by the pipeline but not in the pool: left out by the last build, or only in ids.json. */
  seen: "dropped" | "registry" | null;
};

/** What the deployment knows: the pool (with its left-out list) and data/ids.json's footballers. */
export type KnownFootballers = {
  pool: Pick<Pool, "players" | "dropped">;
  registry: Record<string, string>;
};

const API = "https://www.wikidata.org/w/api.php";
const MAX_QUERY = 80;
const TIMEOUT_MS = 5_000;
const FOOTBALLER = "Q937857";
const TUNISIA = "Q948";

type Snak = {
  mainsnak?: {
    datavalue?: { value?: { id?: string; time?: string; precision?: number } };
  };
};
type Entity = {
  id?: string;
  missing?: string;
  labels?: Record<string, { value?: string }>;
  descriptions?: Record<string, { value?: string }>;
  claims?: Record<string, Snak[]>;
  sitelinks?: Record<string, { title?: string }>;
};
type Found = { id: string; label?: string; description?: string };

const ids = (entity: Entity | undefined, property: string): string[] =>
  (entity?.claims?.[property] ?? [])
    .map((c) => c.mainsnak?.datavalue?.value?.id)
    .filter((id): id is string => typeof id === "string");

/** P569 as the precision allows: day (11), month (10) or year (9 or less). */
function birth(entity: Entity | undefined): string | null {
  const value = entity?.claims?.P569?.[0]?.mainsnak?.datavalue?.value;
  const match = /^\+?(\d{4})-(\d{2})-(\d{2})/.exec(value?.time ?? "");
  if (!match) return null;
  const precision = value?.precision ?? 11;
  if (precision >= 11) return `${match[1]}-${match[2]}-${match[3]}`;
  if (precision === 10) return `${match[1]}-${match[2]}`;
  return match[1];
}

const text = (
  map: Record<string, { value?: string }> | undefined,
): string | undefined =>
  ["en", "fr", "ar"].map((l) => map?.[l]?.value).find((v) => v);

function apiError(json: unknown, what: string): void {
  const error = (json as { error?: { code?: unknown } } | null)?.error;
  if (error) throw new Error(`Wikidata ${what}: ${String(error.code)}`);
}

export async function searchFootballers(
  query: string,
  fetchImpl: typeof fetch,
  known: KnownFootballers,
): Promise<SearchHit[]> {
  const search = [...query.trim()].slice(0, MAX_QUERY).join("").trim();
  if (search === "") return [];
  const client = createPoliteClient({
    minGapMs: 0,
    maxRetries: 0,
    maxAttempts: 2,
    userAgent: USER_AGENT,
    fetch: (url, init) =>
      fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) }),
  });
  // Wikidata matches labels in the language asked (and its fallbacks): an
  // Arabic query is searched in Arabic, any other in English.
  const language = /\p{Script=Arabic}/u.test(search) ? "ar" : "en";
  const found = await client.getJson(
    `${API}?${new URLSearchParams({
      action: "wbsearchentities",
      search,
      language,
      uselang: language,
      type: "item",
      limit: "10",
      format: "json",
    })}`,
  );
  apiError(found, "search");
  const list = ((found as { search?: Found[] }).search ?? []).filter(
    (f) => typeof f?.id === "string" && /^Q\d+$/.test(f.id),
  );
  if (list.length === 0) return [];
  const got = await client.getJson(
    `${API}?${new URLSearchParams({
      action: "wbgetentities",
      ids: list.map((f) => f.id).join("|"),
      props: "claims|labels|descriptions|sitelinks",
      languages: "en|fr|ar",
      sitefilter: "enwiki",
      format: "json",
    })}`,
  );
  apiError(got, "entities");
  const entities =
    (got as { entities?: Record<string, Entity> }).entities ?? {};
  const inPool = new Map(known.pool.players.map((p) => [p.wikidataId, p.id]));
  const dropped = new Set(known.pool.dropped.map((d) => d.wikidataId));
  return list.map((f) => {
    const entity = entities[f.id];
    const pooled = inPool.get(f.id) ?? null;
    const country = [...ids(entity, "P27"), ...ids(entity, "P1532")];
    return {
      qid: f.id,
      label: f.label || text(entity?.labels) || f.id,
      description: f.description || text(entity?.descriptions) || "",
      footballer: ids(entity, "P106").includes(FOOTBALLER),
      tunisian: country.includes(TUNISIA),
      born: birth(entity),
      enwiki: entity?.sitelinks?.enwiki?.title ?? null,
      inPool: pooled,
      seen: pooled
        ? null
        : dropped.has(f.id)
          ? "dropped"
          : Object.hasOwn(known.registry, f.id)
            ? "registry"
            : null,
    };
  });
}

/**
 * The browser tests' Wikidata (KORA_ADMIN_FAKES): the search answers by the
 * exact query, the entities by id; anything else is "no match". `state` is
 * read on every request, so the spec can seed it while the server runs.
 */
export type FakeSearch = {
  results?: Record<string, Found[]>;
  entities?: Record<string, Entity>;
};

export function fakeWikidataFetch(state: () => FakeSearch): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const params = url.searchParams;
    const search = state();
    if (params.get("action") === "wbsearchentities")
      return Response.json({
        search: search.results?.[params.get("search") ?? ""] ?? [],
      });
    if (params.get("action") === "wbgetentities")
      return Response.json({
        entities: Object.fromEntries(
          (params.get("ids") ?? "")
            .split("|")
            .map((id) => [id, search.entities?.[id] ?? { id, missing: "" }]),
        ),
      });
    return Response.json({ error: { code: "unknown-action" } });
  }) as typeof fetch;
}
