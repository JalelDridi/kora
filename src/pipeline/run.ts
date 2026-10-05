import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { knownIds } from "./check.ts";
import { commonsUrl, parseCommons } from "./commons.ts";
import { GOALSCORERS_URL, goalsFloors, tunisiaScorers } from "./goalscorers.ts";
import { createPoliteClient } from "./http.ts";
import type { FetchLike, PoliteClient } from "./http.ts";
import { buildClubIndex, chosenClubOf } from "./merge.ts";
import type { MergeContext } from "./merge.ts";
import { validateOverrides } from "./overrides.ts";
import { buildPool, emptyRegistry } from "./pool.ts";
import {
  diffPools,
  guardChange,
  renderReport,
  squadSummary,
} from "./report.ts";
import type { HonoursReading } from "./report.ts";
import { RESULTS_URL, tunisiaMatches } from "./results.ts";
import { plainLatin } from "./places.ts";
import type { Namesake, SquadContext } from "./squads/evidence.ts";
import {
  knownTitleIds,
  linkKey,
  linkTargets,
  matchRows,
} from "./squads/match.ts";
import type { MatchResult } from "./squads/match.ts";
import type {
  CuratedHonour,
  GovernorateRow,
  IdRegistry,
  Infobox,
  Match,
  Photo,
  Pool,
  SourceStatus,
  WdClub,
  WdHonour,
  WdMembership,
  WdPlayer,
} from "./types.ts";
import { validateIdRegistry, validatePool } from "./validate.ts";
import { witnessSummary } from "./witness/apply.ts";
import { emptyWitness, validateWitness } from "./witness/verdicts.ts";
import type { WitnessFile } from "./witness/verdicts.ts";
import {
  chunk,
  pagepropsUrl,
  parsePageprops,
  parseRevisions,
  redirectsUrl,
  rawBatch,
  revisionsUrl,
  unanswered,
} from "./wiki/fetch.ts";
import { parseSquadList } from "./wiki/squads.ts";
import type { SquadList } from "./wiki/squads.ts";
import type { Page, RawBatch } from "./wiki/fetch.ts";
import { parseEnInfobox } from "./wiki/infobox-en.ts";
import { parseFrInfobox } from "./wiki/infobox-fr.ts";
import {
  parseAliases,
  parseClubs,
  parseHonoursReport,
  parseMemberships,
  parsePlayers,
} from "./wikidata/parse.ts";
import {
  ALIASES_QUERY,
  clubsQuery,
  HONOURS_QUERY,
  MEMBERSHIPS_QUERY,
  PLAYERS_QUERY,
  sparqlRequest,
} from "./wikidata/queries.ts";

// The nightly build: read the curated files, fetch every source one after
// another, merge, validate, and write data/pool.json, data/ids.json and
// data/report.md. Three HTTP clients (ruling R2): `wdqs` (query.wikidata.org),
// `wikimedia` (English and French Wikipedia and Commons: one queue, one gap,
// one stop) and `github` (raw.githubusercontent.com). Each source goes through
// `cached()`: success refreshes data/cache/<source>.json; any failure (a
// stopped client included) falls back to it and says so in the report; a
// failed source with no cached copy stops the run, and nothing is written.

export type RunDeps = {
  root: string;
  /**
   * The build's date. Offline, the newest cached copy dates the build instead
   * (final wave, B1): a rebuild from the cache of 4 October is the pool of 4
   * October, whatever day it runs.
   */
  today: string;
  /** The three clients; an offline build has none and makes no request. */
  wdqs?: PoliteClient;
  wikimedia?: PoliteClient;
  github?: PoliteClient;
  /** Every source from data/cache/, parsed again; no request at all. */
  offline?: boolean;
  log: (line: string) => void;
  /** How outputs are written (tests inject a failure); default fs.writeFile. */
  writeFile?: (file: string, text: string) => Promise<void>;
  /** The most requests a run may plan, all clients together (default MAX_REQUESTS). */
  maxRequests?: number;
  /** HTTP attempts per client so far, retries included (createClients gives it); without it the run counts calls. */
  attempts?: () => Record<ClientName, number>;
};

export type ClientName = "wdqs" | "wikimedia" | "github";

/**
 * The three polite clients of a real run (ruling R2), each counting its HTTP
 * attempts: a retry after a 503 is one more. `fetch` and `sleep` are for tests.
 */
export function createClients(
  options: { fetch?: FetchLike; sleep?: (ms: number) => Promise<void> } = {},
): Record<ClientName, PoliteClient> & {
  attempts: () => Record<ClientName, number>;
} {
  const counts: Record<ClientName, number> = {
    wdqs: 0,
    wikimedia: 0,
    github: 0,
  };
  const make = (
    name: ClientName,
    minGapMs: number,
    maxRetries: number,
    maxAttempts: number,
  ) =>
    createPoliteClient({
      minGapMs,
      maxRetries,
      // Final wave, B7: twice the most a run may plan for this client, and
      // half an hour in all, retries and Retry-After waits included.
      maxAttempts,
      maxWallMs: MAX_RUN_MS,
      sleep: options.sleep,
      fetch: (url, init) => {
        counts[name]++;
        return (options.fetch ?? globalThis.fetch)(url, init);
      },
    });
  return {
    wdqs: make("wdqs", 2_000, 3, 2 * WDQS_QUERIES),
    // English and French Wikipedia and Commons share one client: one queue,
    // at least 5 s between request starts, and a 429 or 403 from any of them
    // stops all three for the rest of the run.
    wikimedia: make(
      "wikimedia",
      5_000,
      3,
      2 * (MAX_REQUESTS - WDQS_QUERIES - GITHUB_DOWNLOADS),
    ),
    github: make("github", 1_000, 2, 2 * GITHUB_DOWNLOADS),
    attempts: () => ({ ...counts }),
  };
}

export type RunResult =
  { ok: true; changed: boolean } | { ok: false; reason: string };

/**
 * A run's budget: more planned requests than this and the run refuses. 70
 * since the squad lists (S14): the last run used 50, squads add 4 to 7.
 */
export const MAX_REQUESTS = 70;

/** The English article whose "Current squad" table gives caps (P42). */
export const NATIONAL_TEAM_TITLE = "Tunisia national football team";

/** The longest a real run's client may keep sending requests (B7). */
export const MAX_RUN_MS = 30 * 60_000;

/** Four Wikidata queries, then clubs by id, by English and by French title. */
const WDQS_QUERIES = 4 + 3;
/** results.csv and goalscorers.csv. */
const GITHUB_DOWNLOADS = 2;

/**
 * The format of data/cache/<source>.json. Bump it whenever a cached shape
 * changes: a copy of another version is then ignored, as if there were no
 * cache. Version 2: the cache keeps what the servers sent (wikitext, SPARQL
 * results, Commons pages, CSV rows) and every run parses it again, so a
 * parser change needs no new request. Version 1 kept parsed values.
 * Version 3 (final wave, B8): the Wikipedia answers keep their `normalized`
 * and `redirects` lists as sent, beside their pages, instead of the moves
 * read from them; only each page's content is cut to section 0.
 */
export const CACHE_VERSION = 3;

type CacheEntry<T> = {
  version: number;
  savedAt: string;
  source: string;
  value: T;
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const listOf = (v: unknown) => Array.isArray(v);
/** MediaWiki answers as cached (B8): each with its list of pages. */
const batches = (v: unknown) =>
  Array.isArray(v) && v.every((b) => isObject(b) && listOf(b.pages));

const sparqlResult = (v: unknown) =>
  isObject(v) && isObject(v.results) && listOf(v.results.bindings);

/** The least a cached raw answer must look like before the run parses it. */
const SHAPES: Record<string, (v: unknown) => boolean> = {
  wikidata: (v) =>
    isObject(v) &&
    ["players", "aliases", "memberships", "honours"].every((q) =>
      sparqlResult(v[q]),
    ),
  "infobox-en": (v) => isObject(v) && batches(v.batches),
  "infobox-fr": (v) => isObject(v) && batches(v.batches),
  redirects: (v) => isObject(v) && batches(v.en) && batches(v.fr),
  clubs: (v) =>
    Array.isArray(v) &&
    v.every((e) => Array.isArray(e) && e.length === 2 && sparqlResult(e[1])),
  commons: listOf,
  martj42: (v) => typeof v === "string",
  "martj42-goals": (v) => typeof v === "string",
  // P42: whole squad pages, and the link lookups (pageprops), as sent.
  squads: (v) => isObject(v) && batches(v.en) && batches(v.fr),
  "squad-links": (v) => isObject(v) && batches(v.en) && batches(v.fr),
};

/** Wikitext before the first section heading: the lead, where the infobox is. */
export function sectionZero(wikitext: string): string {
  const heading = /^==[^=].*$/m.exec(wikitext);
  return heading ? wikitext.slice(0, heading.index) : wikitext;
}

/**
 * The header and every row naming Tunisia: all that tunisiaMatches and
 * tunisiaScorers read (each filters further), at a fraction of the 3 MB files.
 */
function tunisiaRows(csv: string): string {
  const [header = "", ...lines] = csv.replace(/\r/g, "").split("\n");
  return (
    [header, ...lines.filter((l) => l.includes("Tunisia"))].join("\n") + "\n"
  );
}

/** An answer that should hold something but holds nothing is a failure. */
function nonEmpty<T>(list: T[], what: string): T[] {
  if (list.length === 0) throw new Error(`empty answer: ${what}`);
  return list;
}

/**
 * A MediaWiki answer must list the pages it was asked for, whole: one cut
 * short (`continue`, e.g. over the result size limit) leaves pages without
 * content, so it fails its source like an error body.
 */
function pagesOf(json: unknown, asked: number): void {
  const answer = json as { query?: { pages?: unknown }; continue?: unknown };
  if (answer?.continue)
    throw new Error(`answer cut short (continue) for ${asked} titles`);
  const pages = answer?.query?.pages;
  if (!Array.isArray(pages) || pages.length === 0)
    throw new Error(`empty answer: no page for ${asked} titles`);
}

/**
 * Requests per client, retries aside: 50 titles or files per Wikimedia
 * request. `en`, `fr` and `files` are the wanted footballers' distinct
 * article titles and photo files; `redirects` the distinct current-club
 * titles to look up, known only once the infoboxes are read (0 before).
 * `squads` (P42): the squad pages per language, then the link targets to
 * look up, known only once the pages are read.
 */
export function planRequests(input: {
  en: number;
  fr: number;
  files: number;
  redirects?: { en: number; fr: number };
  squads?: { en: number; fr: number; links?: { en: number; fr: number } };
}): {
  wdqs: number;
  wikimedia: number;
  github: number;
  total: number;
} {
  const batches = (n: number) => Math.ceil(n / 50);
  const wikimedia =
    batches(input.en) +
    batches(input.fr) +
    batches(input.files) +
    batches(input.redirects?.en ?? 0) +
    batches(input.redirects?.fr ?? 0) +
    batches(input.squads?.en ?? 0) +
    batches(input.squads?.fr ?? 0) +
    batches(input.squads?.links?.en ?? 0) +
    batches(input.squads?.links?.fr ?? 0);
  return {
    wdqs: WDQS_QUERIES,
    wikimedia,
    github: GITHUB_DOWNLOADS,
    total: WDQS_QUERIES + wikimedia + GITHUB_DOWNLOADS,
  };
}

type Wikidata = {
  players: WdPlayer[];
  aliases: [string, string[]][];
  memberships: WdMembership[];
  honours: WdHonour[];
  honoursReading: HonoursReading;
};

class Refusal extends Error {}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    groups.set(k, [...(groups.get(k) ?? []), item]);
  }
  return groups;
}

const present = <T>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined;

/** JSON with object keys in natural order (Q9 before Q10), two spaces, a final newline. */
export function stableJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (typeof v !== "object" || v === null) return v;
    return Object.fromEntries(
      Object.keys(v)
        .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
        .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
    );
  };
  return JSON.stringify(sort(value), null, 2) + "\n";
}

const rows = (json: unknown) =>
  (json as { results?: { bindings?: unknown[] } } | null)?.results?.bindings
    ?.length ?? 0;

export async function run(deps: RunDeps): Promise<RunResult> {
  try {
    return await build(deps);
  } catch (error) {
    if (error instanceof Refusal) {
      deps.log(`refused: ${error.message}`);
      return { ok: false, reason: error.message };
    }
    throw error;
  }
}

async function build(deps: RunDeps): Promise<RunResult> {
  const data = path.join(deps.root, "data");
  const statuses: Record<string, SourceStatus> = {};
  const sent = { wdqs: 0, wikimedia: 0, github: 0 };
  const count = (name: keyof typeof sent): PoliteClient => {
    const client = () => {
      const c = deps[name];
      if (!c || deps.offline) throw new Error(`no ${name} client in this run`);
      return c;
    };
    return {
      getJson(url, init) {
        sent[name]++;
        return client().getJson(url, init);
      },
      getText(url, init) {
        sent[name]++;
        return client().getText(url, init);
      },
    };
  };
  const wdqs = count("wdqs");
  const wikimedia = count("wikimedia");
  const github = count("github");

  /** The cached copy of a source, or null when there is none worth using (the log says why). */
  async function readCache<R>(name: string): Promise<CacheEntry<R> | null> {
    let text: string;
    try {
      text = await readFile(path.join(data, "cache", `${name}.json`), "utf8");
    } catch {
      return null;
    }
    const ignore = (why: string) => {
      deps.log(`${name}: cached copy ignored: ${why}`);
      return null;
    };
    let entry: unknown;
    try {
      entry = JSON.parse(text);
    } catch {
      return ignore("not JSON");
    }
    if (!isObject(entry)) return ignore("not an object");
    if (entry.version !== CACHE_VERSION)
      return ignore(
        `version ${String(entry.version)}, this build reads ${CACHE_VERSION}`,
      );
    if (entry.source !== name || typeof entry.savedAt !== "string")
      return ignore("no source or date");
    if (!(SHAPES[name] ?? (() => true))(entry.value))
      return ignore("the answer has the wrong shape");
    return entry as CacheEntry<R>;
  }

  /**
   * One source: fetch its raw answer and parse it, or fall back to the raw
   * answer last cached and parse that, recording which. Fresh or cached, the
   * same `parse` runs, so a parser change takes effect without a request.
   * `fetchRaw` throws on an error body or an answer cut short, `parse` on an
   * empty answer: only answers worth keeping replace the cached copy. No
   * answer at all stops the run. Offline, every source is read from the cache.
   */
  async function source<R, T>(
    name: string,
    fetchRaw: () => Promise<R>,
    parse: (raw: R) => T,
  ): Promise<T> {
    const fromCache = async (note: string, refusal: string): Promise<T> => {
      const last = await readCache<R>(name);
      deps.log(
        `${name}: ${note}; ${last ? `using the copy from ${last.savedAt}` : "no cached copy"}`,
      );
      if (!last) throw new Refusal(refusal);
      let value: T;
      try {
        value = parse(last.value);
      } catch (error) {
        throw new Refusal(
          `${name}: the cached copy from ${last.savedAt} does not parse (${(error as Error).message})`,
        );
      }
      statuses[name] = { status: "cached", retrievedAt: last.savedAt, note };
      return value;
    };
    if (deps.offline)
      return fromCache(
        "offline build",
        `${name} has no usable cached copy (offline build)`,
      );
    const file = path.join(data, "cache", `${name}.json`);
    try {
      const raw = await fetchRaw();
      const value = parse(raw);
      await mkdir(path.dirname(file), { recursive: true });
      const entry: CacheEntry<R> = {
        version: CACHE_VERSION,
        savedAt: deps.today,
        source: name,
        value: raw,
      };
      await writeFile(file, JSON.stringify(entry));
      statuses[name] = { status: "fresh", retrievedAt: deps.today };
      return value;
    } catch (error) {
      if (error instanceof Refusal) throw error;
      const note = error instanceof Error ? error.message : String(error);
      return fromCache(
        note,
        `${name} failed and there is no cached copy (${note})`,
      );
    }
  }

  /**
   * An extra witness (S15): like `source`, but with no usable copy it gives
   * null and the build goes on; the report says the source failed.
   */
  async function optionalSource<R, T>(
    name: string,
    fetchRaw: () => Promise<R>,
    parse: (raw: R) => T,
  ): Promise<T | null> {
    try {
      return await source(name, fetchRaw, parse);
    } catch (error) {
      if (!(error instanceof Refusal)) throw error;
      deps.log(`${name}: left out of this build (${error.message})`);
      statuses[name] = {
        status: "failed",
        retrievedAt: null,
        note: error.message,
      };
      return null;
    }
  }

  // Curated files and the last build.
  const previous = await readJson<Pool>(path.join(data, "pool.json"));
  const governorates =
    (await readJson<GovernorateRow[]>(
      path.join(data, "curated", "governorates.json"),
    )) ?? [];
  const governorateIds = new Set(governorates.map((g) => g.id));
  const registryJson = await readJson<unknown>(path.join(data, "ids.json"));
  if (registryJson !== null) {
    const errors = validateIdRegistry(registryJson);
    if (errors.length > 0) {
      for (const e of errors) deps.log(`data/ids.json: ${e}`);
      throw new Refusal(
        `data/ids.json has ${errors.length} error${errors.length === 1 ? "" : "s"}`,
      );
    }
  }
  // The registry is passed through: buildPool owns its format (pool.ts), the
  // run reads it, hands it over and writes back what buildPool returns.
  const registry = (registryJson ?? emptyRegistry()) as IdRegistry;
  const overridesJson = await readJson<unknown>(
    path.join(data, "overrides.json"),
  );
  const refuseOverrides = (errors: string[]): never => {
    for (const e of errors) deps.log(`data/overrides.json: ${e}`);
    throw new Refusal(
      `data/overrides.json has ${errors.length} error${errors.length === 1 ? "" : "s"}`,
    );
  };
  // Shape first, before any request: a broken file must not cost a fetch.
  const shape = validateOverrides(
    overridesJson,
    governorateIds,
    knownIds(null, overridesJson),
  );
  if (!shape.ok) return refuseOverrides(shape.errors);
  // P48: the private witness's verdicts, committed by Jalel; read with no
  // request, and a broken file refuses like the overrides.
  const witnessJson = await readJson<unknown>(path.join(data, "witness.json"));
  const witnessErrors =
    witnessJson === null ? [] : validateWitness(witnessJson);
  if (witnessErrors.length > 0) {
    for (const e of witnessErrors) deps.log(`data/witness.json: ${e}`);
    throw new Refusal(
      `data/witness.json has ${witnessErrors.length} error${witnessErrors.length === 1 ? "" : "s"}`,
    );
  }
  const witness = (witnessJson ?? emptyWitness()) as WitnessFile;
  const ligue1 = (await readJson<{ clubs: string[] }>(
    path.join(data, "curated", "ligue1-clubs.json"),
  )) ?? { clubs: [] };
  const curatedHonours =
    (await readJson<CuratedHonour[]>(
      path.join(data, "curated", "honours.json"),
    )) ?? [];
  if (deps.offline)
    deps.log("offline build: every source from data/cache/, no request");

  // Wikidata: the four SPARQL results as sent.
  const sparql = async (label: string, query: string) => {
    const { url, init } = sparqlRequest(query);
    const started = performance.now();
    const json = await wdqs.getJson(url, init);
    deps.log(
      `wdqs ${label}: ${((performance.now() - started) / 1000).toFixed(1)} s, ${rows(json)} rows`,
    );
    return json;
  };
  type WikidataRaw = Record<
    "players" | "aliases" | "memberships" | "honours",
    unknown
  >;
  const wikidata = await source<WikidataRaw, Wikidata>(
    "wikidata",
    async () => ({
      players: await sparql("players", PLAYERS_QUERY),
      aliases: await sparql("aliases", ALIASES_QUERY),
      memberships: await sparql("memberships", MEMBERSHIPS_QUERY),
      honours: await sparql("honours", HONOURS_QUERY),
    }),
    (raw) => {
      const players = nonEmpty(parsePlayers(raw.players), "no footballers");
      const aliases = nonEmpty(parseAliases(raw.aliases), "no aliases");
      const memberships = nonEmpty(
        parseMemberships(raw.memberships),
        "no memberships",
      );
      const report = parseHonoursReport(raw.honours);
      nonEmpty(report.honours, "no honours");
      return {
        players,
        aliases,
        memberships,
        honours: report.honours,
        honoursReading: { issues: report.issues, skipped: report.skipped },
      };
    },
  );
  const aliases = new Map(wikidata.aliases);
  const players = wikidata.players.map((p) => ({
    ...p,
    aliases: aliases.get(p.qid) ?? [],
  }));
  // Every man, whatever his age or birth date (D-S1-1: a legend is 20 caps
  // or more, any age; P37 may take an undated man's date from a page).
  const wanted = players.filter((p) => p.male);
  const titles = {
    en: [...new Set(wanted.map((p) => p.titles.en).filter(present))],
    fr: [...new Set(wanted.map((p) => p.titles.fr).filter(present))],
  };
  const files = [...new Set(wanted.map((p) => p.imageFile).filter(present))];

  // P42: the Ligue 1 clubs' English articles and the national team's; the
  // French articles are those clubs' French titles, known from the clubs
  // answer (at most one each, counted so before).
  const squadPages = {
    en: ligue1.clubs.length + 1,
    fr: ligue1.clubs.length,
  };
  const plan = planRequests({
    en: titles.en.length,
    fr: titles.fr.length,
    files: files.length,
    squads: squadPages,
  });
  const budget = deps.maxRequests ?? MAX_REQUESTS;
  deps.log(
    `${players.length} footballers on Wikidata, ${wanted.length} men: ${titles.en.length} English and ${titles.fr.length} French articles, ${files.length} photos`,
  );
  if (!deps.offline) {
    deps.log(
      `plan: wdqs ${plan.wdqs}, wikimedia ${plan.wikimedia} (+ redirects, counted before they are asked), github ${plan.github}: at most ${plan.total} requests before redirects, plus retries after a 503 (budget ${budget})`,
    );
    if (plan.total > budget)
      throw new Refusal(
        `the run would make at least ${plan.total} requests before redirects, over the budget of ${budget}`,
      );
  }

  // English and French infoboxes. The cache keeps section 0 of each page
  // (with its revision id and timestamp) and how requested titles moved; the
  // infobox parser runs on it every time. Infoboxes are keyed by the page's
  // title and by each title that moved to it (a sitelink may be a redirect).
  type PagesRaw = { batches: RawBatch[] };
  const infoboxes = async (lang: "en" | "fr") =>
    source<PagesRaw, Map<string, Infobox>>(
      `infobox-${lang}`,
      async () => {
        const raw: PagesRaw = { batches: [] };
        for (const batch of chunk(titles[lang])) {
          const json = await wikimedia.getJson(revisionsUrl(lang, batch));
          pagesOf(json, batch.length);
          // B6: a page listed without content or a missing mark, and no
          // `continue` to say so, would be cached as fresh but empty.
          const lost = unanswered(json, batch);
          if (lost.length > 0)
            throw new Error(
              `${lost.length} of ${batch.length} titles came back without content or a missing mark (${lost.slice(0, 3).join(", ")})`,
            );
          parseRevisions(json); // throws on an error body
          raw.batches.push(rawBatch(json, sectionZero));
        }
        return raw;
      },
      (raw) => {
        const pages: Page[] = [];
        const moved = new Map<string, string>();
        for (const batch of raw.batches) {
          const read = parseRevisions({ query: batch });
          pages.push(...read.pages);
          for (const [from, to] of read.aliases) moved.set(from, to);
        }
        const boxes = new Map<string, Infobox>();
        for (const page of pages) {
          const box =
            lang === "en"
              ? parseEnInfobox(page.title, page.wikitext)
              : parseFrInfobox(page.title, page.wikitext);
          if (box) boxes.set(page.title, box);
        }
        const out = new Map(boxes);
        for (const from of moved.keys()) {
          let to = from;
          for (let i = 0; i < 3 && moved.has(to); i++) to = moved.get(to)!;
          const box = boxes.get(to);
          if (box && !out.has(from)) out.set(from, box);
        }
        deps.log(
          `infobox-${lang}: ${pages.length} pages, ${boxes.size} infoboxes`,
        );
        if (titles[lang].length > 0)
          nonEmpty(
            [...boxes.values()],
            `no infobox in ${titles[lang].length} titles`,
          );
        return out;
      },
    );
  const en = await infoboxes("en");
  const fr = await infoboxes("fr");
  const boxesOf = (m: Map<string, Infobox>) => [...new Set(m.values())];

  // Current-club links often go through a redirect; resolve them before
  // asking Wikidata which club each title is. The exact count is known now:
  // check the budget again before the first redirect request.
  const currentClubs = {
    en: [
      ...new Set(
        boxesOf(en)
          .map((b) => b.currentClub)
          .filter(present),
      ),
    ],
    fr: [
      ...new Set(
        boxesOf(fr)
          .map((b) => b.currentClub)
          .filter(present),
      ),
    ],
  };
  const exact = planRequests({
    en: titles.en.length,
    fr: titles.fr.length,
    files: files.length,
    redirects: { en: currentClubs.en.length, fr: currentClubs.fr.length },
    squads: squadPages,
  });
  if (!deps.offline) {
    deps.log(
      `plan with redirects: wdqs ${exact.wdqs}, wikimedia ${exact.wikimedia}, github ${exact.github}: at most ${exact.total} requests, plus retries after a 503 (budget ${budget})`,
    );
    if (exact.total > budget)
      throw new Refusal(
        `with ${exact.wikimedia - plan.wikimedia} redirect lookups the run would make up to ${exact.total} requests, over the budget of ${budget}`,
      );
  }
  // The answer's `normalized` and `redirects` lists, as from → to pairs.
  // B8: each answer kept as sent; the moves are read from it on every build.
  type Moves = { en: [string, string][]; fr: [string, string][] };
  type MovesRaw = { en: RawBatch[]; fr: RawBatch[] };
  const redirects = await source<MovesRaw, Moves>(
    "redirects",
    async () => {
      const out: MovesRaw = { en: [], fr: [] };
      for (const lang of ["en", "fr"] as const) {
        for (const batch of chunk(currentClubs[lang])) {
          const json = await wikimedia.getJson(redirectsUrl(lang, batch));
          pagesOf(json, batch.length);
          parseRevisions(json); // throws on an error body
          out[lang].push(rawBatch(json));
        }
      }
      return out;
    },
    (raw) => ({
      en: raw.en.flatMap((b) => parseRevisions({ query: b }).aliases),
      fr: raw.fr.flatMap((b) => parseRevisions({ query: b }).aliases),
    }),
  );

  // Clubs: by id (the wanted footballers' memberships, honours, curated
  // honours, overrides) and by title (infoboxes, this season's Ligue 1), in
  // up to three queries, each SPARQL result kept as sent.
  const overrides = shape.overrides;
  const wantedQids = new Set(wanted.map((p) => p.qid));
  const clubQids = [
    ...new Set([
      ...wikidata.memberships
        .filter((m) => !m.national && wantedQids.has(m.playerQid))
        .map((m) => m.teamQid),
      ...wikidata.honours.map((h) => h.winnerQid),
      ...curatedHonours.map((h) => h.clubWikidataId),
      ...Object.values(overrides.clubTitles),
      ...Object.values(overrides.players)
        .map((o) => o.club?.value)
        .filter(present),
    ]),
  ];
  const titlesOf = (boxes: Infobox[], moved: [string, string][]) => [
    ...new Set([
      ...boxes
        .flatMap((b) => [b.currentClub, ...b.spells.map((s) => s.clubTitle)])
        .filter(present),
      ...moved.map(([, to]) => to),
    ]),
  ];
  // A French {{Lien}} names an English article: its title is asked among
  // the English ones (final wave, B3; the parser keeps only English ones).
  const foreignTitles = boxesOf(fr)
    .flatMap((b) => [
      b.currentClubForeign,
      ...b.spells.map((s) => s.clubTitleForeign),
    ])
    .filter(present);
  const enTitles = [
    ...new Set([
      ...titlesOf(boxesOf(en), redirects.en),
      ...foreignTitles,
      ...ligue1.clubs,
    ]),
  ];
  const frTitles = titlesOf(boxesOf(fr), redirects.fr);
  const asked = clubQids.length + enTitles.length + frTitles.length;
  const clubs = await source<[string, unknown][], WdClub[]>(
    "clubs",
    async () => {
      const out: [string, unknown][] = [];
      const parts: [string, string[], string[], string[]][] = [
        ["clubs by id", clubQids, [], []],
        ["clubs by English title", [], enTitles, []],
        ["clubs by French title", [], [], frTitles],
      ];
      for (const [label, qids, enT, frT] of parts) {
        if (qids.length + enT.length + frT.length === 0) continue;
        out.push([label, await sparql(label, clubsQuery(qids, enT, frT))]);
      }
      return out;
    },
    (raw) => {
      const found = new Map<string, WdClub>();
      for (const [, json] of raw)
        for (const club of parseClubs(json))
          if (!found.has(club.qid)) found.set(club.qid, club);
      // One title part may rightly match nothing; all of them together may not.
      if (asked > 0)
        nonEmpty([...found.values()], `no club for ${asked} ids and titles`);
      return [...found.values()];
    },
  );

  // Overrides against what the sources know: every footballer Wikidata gave,
  // every club the queries found; ids the pipeline met before are stale.
  const checked = validateOverrides(overridesJson, governorateIds, {
    players: new Set(players.map((p) => p.qid)),
    clubs: new Set(clubs.map((c) => c.qid)),
    seen: new Set([
      ...Object.keys(registry.players),
      ...(previous?.dropped ?? []).map((d) => d.wikidataId),
    ]),
  });
  if (!checked.ok) return refuseOverrides(checked.errors);

  // Commons: each file's page object (imageinfo with its metadata) as sent.
  const photos = await source<unknown[], Photo[]>(
    "commons",
    async () => {
      const out: unknown[] = [];
      for (const batch of chunk(files)) {
        const json = await wikimedia.getJson(commonsUrl(batch));
        parseCommons(json); // throws on an error body
        pagesOf(json, batch.length);
        out.push(...(json as { query: { pages: unknown[] } }).query.pages);
      }
      return out;
    },
    (raw) => [...parseCommons({ query: { pages: raw } }).values()],
  );
  // P42: the squad lists, after Commons (S15): an extra witness, so a 429
  // here costs no core source. Whole pages, kept as sent; the lists are read
  // from them once the build's date is known.
  const index = buildClubIndex(
    clubs,
    { en: new Map(redirects.en), fr: new Map(redirects.fr) },
    checked.overrides.clubTitles,
  );
  const squadTitles = {
    en: [...new Set([...ligue1.clubs, NATIONAL_TEAM_TITLE])],
    fr: [
      ...new Set(
        ligue1.clubs
          .map((t) => index.resolve("en", t)?.titleFr)
          .filter(present),
      ),
    ],
  };
  type SquadsRaw = { en: RawBatch[]; fr: RawBatch[] };
  type SquadPage = { lang: "en" | "fr"; page: Page };
  const squadPagesRead = await optionalSource<SquadsRaw, SquadPage[]>(
    "squads",
    async () => {
      const out: SquadsRaw = { en: [], fr: [] };
      for (const lang of ["en", "fr"] as const) {
        for (const batch of chunk(squadTitles[lang])) {
          const json = await wikimedia.getJson(revisionsUrl(lang, batch));
          pagesOf(json, batch.length);
          const lost = unanswered(json, batch);
          if (lost.length > 0)
            throw new Error(
              `${lost.length} of ${batch.length} squad titles came back without content or a missing mark (${lost.slice(0, 3).join(", ")})`,
            );
          parseRevisions(json); // throws on an error body
          out[lang].push(rawBatch(json));
        }
      }
      return out;
    },
    (raw) =>
      (["en", "fr"] as const).flatMap((lang) =>
        raw[lang].flatMap((b) =>
          parseRevisions({ query: b }).pages.map((page) => ({ lang, page })),
        ),
      ),
  );

  // The lists' status depends on the day (S4): offline, the newest copy read so far.
  const squadDay = deps.offline
    ? (Object.values(statuses)
        .map((s) => s.retrievedAt)
        .filter((d): d is string => d != null)
        .sort()
        .at(-1) ?? deps.today)
    : deps.today;
  const squadLists: SquadList[] | null =
    squadPagesRead?.map(({ lang, page }) =>
      parseSquadList({
        lang,
        page: page.title,
        kind:
          lang === "en" && page.title === NATIONAL_TEAM_TITLE
            ? "national"
            : "club",
        wikitext: page.wikitext,
        today: squadDay,
      }),
    ) ?? null;

  // S13: the link targets that are no known footballer's title, looked up
  // in batches of 50 once the lists are read; the budget is checked again
  // before the first lookup.
  let squadMatch: MatchResult | null = null;
  if (squadLists) {
    const knownIds = knownTitleIds(players);
    const known = {
      en: new Set(players.map((p) => p.titles.en).filter(present)),
      fr: new Set(players.map((p) => p.titles.fr).filter(present)),
    };
    const targets = linkTargets(squadLists, known);
    if (!deps.offline) {
      const withLinks = planRequests({
        en: titles.en.length,
        fr: titles.fr.length,
        files: files.length,
        redirects: { en: currentClubs.en.length, fr: currentClubs.fr.length },
        squads: {
          en: squadTitles.en.length,
          fr: squadTitles.fr.length,
          links: { en: targets.en.length, fr: targets.fr.length },
        },
      });
      deps.log(
        `plan with squad links: wdqs ${withLinks.wdqs}, wikimedia ${withLinks.wikimedia}, github ${withLinks.github}: at most ${withLinks.total} requests, plus retries after a 503 (budget ${budget})`,
      );
      if (withLinks.total > budget)
        throw new Refusal(
          `with ${targets.en.length + targets.fr.length} squad link targets to look up the run would make up to ${withLinks.total} requests, over the budget of ${budget}`,
        );
    }
    type LinksRaw = { en: RawBatch[]; fr: RawBatch[] };
    const looked = await optionalSource<LinksRaw, Map<string, string>>(
      "squad-links",
      async () => {
        const out: LinksRaw = { en: [], fr: [] };
        for (const lang of ["en", "fr"] as const) {
          for (const batch of chunk(targets[lang])) {
            const json = await wikimedia.getJson(pagepropsUrl(lang, batch));
            pagesOf(json, batch.length);
            parsePageprops(json); // throws on an error body
            out[lang].push(rawBatch(json));
          }
        }
        return out;
      },
      (raw) => {
        const ids = new Map<string, string>();
        for (const lang of ["en", "fr"] as const)
          for (const b of raw[lang])
            for (const [title, qid] of parsePageprops({ query: b }))
              ids.set(linkKey(lang, title), qid);
        return ids;
      },
    );
    // The footballers' own titles always win over a looked-up target.
    const ids = new Map([...(looked ?? []), ...knownIds]);
    squadMatch = matchRows(squadLists, players, ids);
    deps.log(
      `squads: ${squadLists.length} lists (${squadLists.filter((l) => l.status === "current").length} current), ${squadMatch.sightings.length} rows matched`,
    );
  }

  // martj42: the header and the rows naming Tunisia, as text.
  const matches = await source<string, Match[]>(
    "martj42",
    async () => tunisiaRows(await github.getText(RESULTS_URL)),
    (raw) => nonEmpty(tunisiaMatches(raw), "no Tunisia match"),
  );
  // A floor for goals, never a confirmation (addendum §5).
  const scorers = await source<string, [string, number][]>(
    "martj42-goals",
    async () => tunisiaRows(await github.getText(GOALSCORERS_URL)),
    (raw) => nonEmpty(tunisiaScorers(raw), "no Tunisia scorer"),
  );

  // B1: offline, the build is dated by the newest cached copy it read.
  const today = deps.offline
    ? (Object.values(statuses)
        .map((s) => s.retrievedAt)
        .filter((d): d is string => d != null)
        .sort()
        .at(-1) ?? deps.today)
    : deps.today;
  if (deps.offline)
    deps.log(`offline build dated ${today}, its newest cached copy`);
  const base: MergeContext = {
    today,
    memberships: groupBy(wikidata.memberships, (m) => m.playerQid),
    index,
    infoboxes: { en, fr },
    photos: new Map(photos.map((p) => [p.file, p])),
    tunisiaMatches: matches,
    goalsFloor: goalsFloors(scorers, players),
    overrides: checked.overrides,
    governorateIds,
    witness,
  };
  // P42: absent when no squad list was read, and the merge is as before.
  const squads: SquadContext | undefined =
    squadLists && squadMatch
      ? {
          sightings: groupBy(squadMatch.sightings, (s) => s.qid),
          lists: squadLists,
          namesakes: namesakesOf(squadMatch, players, base),
        }
      : undefined;
  // B4: a pool that cannot be built is a refusal with a reason, not a crash.
  let built: ReturnType<typeof buildPool>;
  try {
    built = buildPool({
      ...base,
      ...(squads ? { squads } : {}),
      players,
      honours: wikidata.honours,
      curatedHonours,
      ligue1Titles: ligue1.clubs,
      previous,
      ids: registry,
    });
  } catch (error) {
    throw new Refusal(
      `the pool could not be built: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const { pool, ids } = built;
  const attempts = deps.attempts?.() ?? null;
  deps.log(
    attempts
      ? `requests (HTTP attempts): wdqs ${attempts.wdqs}, wikimedia ${attempts.wikimedia}, github ${attempts.github}`
      : `requests (calls; no attempt counter given): wdqs ${sent.wdqs}, wikimedia ${sent.wikimedia}, github ${sent.github}`,
  );

  const invalid = validatePool(pool, governorateIds, ids);
  if (invalid.length > 0) {
    for (const e of invalid.slice(0, 50)) deps.log(`pool: ${e}`);
    throw new Refusal(
      `the new pool is invalid (${invalid.length} errors): ${invalid.slice(0, 5).join("; ")}`,
    );
  }
  const refusal = guardChange(previous, pool);
  if (refusal) throw new Refusal(refusal);

  const diff = diffPools(previous, pool);
  // Everything is rendered before anything is written.
  await commit(data, deps.writeFile ?? ((f, t) => writeFile(f, t)), [
    ["ids.json", stableJson(ids)],
    ["pool.json", JSON.stringify(pool, null, 2) + "\n"],
    [
      "report.md",
      renderReport({
        pool,
        diff,
        statuses,
        today,
        honoursReading: wikidata.honoursReading,
        overrideWarnings: checked.warnings,
        offline: deps.offline === true,
        witness: witnessSummary(witness, pool, today),
        squads:
          squadLists && squadMatch
            ? squadSummary(
                squadLists,
                squadMatch.sightings,
                pool,
                squadMatch.notes,
              )
            : null,
      }),
    ],
  ]);
  return { ok: true, changed: diff.changed };
}

/**
 * S12: for each footballer a squad row links to, the other footballers of
 * his name and the club the merge gives each.
 */
function namesakesOf(
  match: MatchResult,
  players: WdPlayer[],
  ctx: MergeContext,
): Map<string, Namesake[]> {
  const key = (p: WdPlayer) => plainLatin(p.nameEn ?? p.nameFr ?? p.qid).trim();
  const byName = groupBy(players, key);
  const out = new Map<string, Namesake[]>();
  for (const qid of new Set(
    match.sightings.filter((s) => s.by === "link").map((s) => s.qid),
  )) {
    const p = players.find((x) => x.qid === qid);
    const twins = p
      ? (byName.get(key(p)) ?? []).filter((x) => x.qid !== qid)
      : [];
    if (twins.length > 0)
      out.set(
        qid,
        twins.map((t) => ({ qid: t.qid, clubQid: chosenClubOf(t, ctx) })),
      );
  }
  return out;
}

/**
 * Writes every output as a temporary file beside its target, then renames
 * each into place, in the given order (ids.json first: the registry only
 * grows, so a new registry beside an old pool is harmless). A failure while
 * writing removes the temporary files and replaces nothing. A rename is
 * atomic per file, also on Windows (it replaces an existing file); if one
 * fails half-way (a file held open by another program), the files already
 * renamed stay new, the rest stay old, the leftover temporary files are
 * removed, and the refusal names what was replaced.
 */
async function commit(
  folder: string,
  write: (file: string, text: string) => Promise<void>,
  outputs: [string, string][],
): Promise<void> {
  const temp = (name: string) =>
    path.join(folder, `.${name}.${process.pid}.tmp`);
  const cleanUp = () =>
    Promise.all(outputs.map(([name]) => rm(temp(name), { force: true })));
  try {
    for (const [name, text] of outputs) await write(temp(name), text);
  } catch (error) {
    await cleanUp();
    throw new Refusal(
      `could not write the outputs, nothing was replaced (${(error as Error).message})`,
    );
  }
  const replaced: string[] = [];
  try {
    for (const [name] of outputs) {
      await rename(temp(name), path.join(folder, name));
      replaced.push(name);
    }
  } catch (error) {
    await cleanUp();
    throw new Refusal(
      `could not put the outputs in place; replaced: ${replaced.join(", ") || "none"} (${(error as Error).message})`,
    );
  }
}
