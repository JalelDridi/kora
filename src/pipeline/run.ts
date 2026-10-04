import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { knownIds } from "./check.ts";
import { commonsUrl, parseCommons } from "./commons.ts";
import { GOALSCORERS_URL, goalsFloors, tunisiaScorers } from "./goalscorers.ts";
import { createPoliteClient } from "./http.ts";
import type { FetchLike, PoliteClient } from "./http.ts";
import { buildClubIndex } from "./merge.ts";
import { validateOverrides } from "./overrides.ts";
import { buildPool, emptyRegistry } from "./pool.ts";
import { diffPools, guardChange, renderReport } from "./report.ts";
import type { HonoursReading } from "./report.ts";
import { RESULTS_URL, tunisiaMatches } from "./results.ts";
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
import {
  chunk,
  parseRevisions,
  redirectsUrl,
  revisionsUrl,
} from "./wiki/fetch.ts";
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
  today: string;
  wdqs: PoliteClient;
  wikimedia: PoliteClient;
  github: PoliteClient;
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
): Pick<RunDeps, ClientName> & { attempts: () => Record<ClientName, number> } {
  const counts: Record<ClientName, number> = {
    wdqs: 0,
    wikimedia: 0,
    github: 0,
  };
  const make = (name: ClientName, minGapMs: number, maxRetries: number) =>
    createPoliteClient({
      minGapMs,
      maxRetries,
      sleep: options.sleep,
      fetch: (url, init) => {
        counts[name]++;
        return (options.fetch ?? globalThis.fetch)(url, init);
      },
    });
  return {
    wdqs: make("wdqs", 2_000, 3),
    // English and French Wikipedia and Commons share one client: one queue,
    // at least 5 s between request starts, and a 429 or 403 from any of them
    // stops all three for the rest of the run.
    wikimedia: make("wikimedia", 5_000, 3),
    github: make("github", 1_000, 2),
    attempts: () => ({ ...counts }),
  };
}

export type RunResult =
  { ok: true; changed: boolean } | { ok: false; reason: string };

/** A first run's budget: more planned requests than this and the run refuses. */
export const MAX_REQUESTS = 60;

/** Four Wikidata queries, then clubs by id, by English and by French title. */
const WDQS_QUERIES = 4 + 3;
/** results.csv and goalscorers.csv. */
const GITHUB_DOWNLOADS = 2;

/**
 * The format of data/cache/<source>.json. Bump it whenever a cached shape
 * changes (a parser's output, Infobox, Photo, WdClub…): a copy of another
 * version is then ignored, as if there were no cache.
 */
export const CACHE_VERSION = 1;

type CacheEntry<T> = {
  version: number;
  savedAt: string;
  source: string;
  value: T;
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const listOf = (v: unknown) => Array.isArray(v);
const pairs = (v: unknown) =>
  Array.isArray(v) && v.every((e) => Array.isArray(e) && e.length === 2);

/** The least a cached payload must look like before the run uses it. */
const SHAPES: Record<string, (v: unknown) => boolean> = {
  wikidata: (v) =>
    isObject(v) &&
    listOf(v.players) &&
    pairs(v.aliases) &&
    listOf(v.memberships) &&
    listOf(v.honours) &&
    isObject(v.honoursReading),
  "infobox-en": pairs,
  "infobox-fr": pairs,
  redirects: (v) => isObject(v) && pairs(v.en) && pairs(v.fr),
  clubs: listOf,
  commons: listOf,
  martj42: listOf,
  "martj42-goals": pairs,
};

/** An answer that should hold something but holds nothing is a failure. */
function nonEmpty<T>(list: T[], what: string): T[] {
  if (list.length === 0) throw new Error(`empty answer: ${what}`);
  return list;
}

/** A MediaWiki answer must list the pages it was asked for. */
function pagesOf(json: unknown, asked: number): void {
  const pages = (json as { query?: { pages?: unknown } } | null)?.query?.pages;
  if (!Array.isArray(pages) || pages.length === 0)
    throw new Error(`empty answer: no page for ${asked} titles`);
}

/**
 * Requests per client, retries aside: 50 titles or files per Wikimedia
 * request. `en`, `fr` and `files` are the wanted footballers' distinct
 * article titles and photo files; `redirects` the distinct current-club
 * titles to look up, known only once the infoboxes are read (0 before).
 */
export function planRequests(input: {
  en: number;
  fr: number;
  files: number;
  redirects?: { en: number; fr: number };
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
    batches(input.redirects?.fr ?? 0);
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
  const count = (name: keyof typeof sent): PoliteClient => ({
    getJson(url, init) {
      sent[name]++;
      return deps[name].getJson(url, init);
    },
    getText(url, init) {
      sent[name]++;
      return deps[name].getText(url, init);
    },
  });
  const wdqs = count("wdqs");
  const wikimedia = count("wikimedia");
  const github = count("github");

  /** The cached copy of a source, or null when there is none worth using (the log says why). */
  async function readCache<T>(name: string): Promise<CacheEntry<T> | null> {
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
    return entry as CacheEntry<T>;
  }

  /**
   * Fetch, or fall back to the last good answer, recording which; no answer
   * at all stops the run. A fetcher throws on an error body or an empty
   * answer, so only answers worth keeping replace the cached copy.
   */
  async function cached<T>(
    name: string,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    const file = path.join(data, "cache", `${name}.json`);
    try {
      const value = await fetcher();
      await mkdir(path.dirname(file), { recursive: true });
      const entry: CacheEntry<T> = {
        version: CACHE_VERSION,
        savedAt: deps.today,
        source: name,
        value,
      };
      await writeFile(file, JSON.stringify(entry));
      statuses[name] = { status: "fresh", retrievedAt: deps.today };
      return value;
    } catch (error) {
      if (error instanceof Refusal) throw error;
      const note = error instanceof Error ? error.message : String(error);
      const last = await readCache<T>(name);
      deps.log(
        `${name}: ${note}; ${last ? `using the copy from ${last.savedAt}` : "no cached copy"}`,
      );
      if (!last)
        throw new Refusal(
          `${name} failed and there is no cached copy (${note})`,
        );
      statuses[name] = {
        status: "cached",
        retrievedAt: last.savedAt,
        note,
      };
      return last.value;
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
      throw new Refusal(`data/ids.json has ${errors.length} errors`);
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
  const ligue1 = (await readJson<{ clubs: string[] }>(
    path.join(data, "curated", "ligue1-clubs.json"),
  )) ?? { clubs: [] };
  const curatedHonours =
    (await readJson<CuratedHonour[]>(
      path.join(data, "curated", "honours.json"),
    )) ?? [];

  // Wikidata.
  const sparql = async (label: string, query: string) => {
    const { url, init } = sparqlRequest(query);
    const started = performance.now();
    const json = await wdqs.getJson(url, init);
    deps.log(
      `wdqs ${label}: ${((performance.now() - started) / 1000).toFixed(1)} s, ${rows(json)} rows`,
    );
    return json;
  };
  const wikidata = await cached<Wikidata>("wikidata", async () => {
    const players = nonEmpty(
      parsePlayers(await sparql("players", PLAYERS_QUERY)),
      "no footballers",
    );
    const aliases = nonEmpty(
      parseAliases(await sparql("aliases", ALIASES_QUERY)),
      "no aliases",
    );
    const memberships = nonEmpty(
      parseMemberships(await sparql("memberships", MEMBERSHIPS_QUERY)),
      "no memberships",
    );
    const report = parseHonoursReport(await sparql("honours", HONOURS_QUERY));
    nonEmpty(report.honours, "no honours");
    return {
      players,
      aliases,
      memberships,
      honours: report.honours,
      honoursReading: { issues: report.issues, skipped: report.skipped },
    };
  });
  const aliases = new Map(wikidata.aliases);
  const players = wikidata.players.map((p) => ({
    ...p,
    aliases: aliases.get(p.qid) ?? [],
  }));
  const wanted = players.filter(
    (p) => p.male && p.birthDate !== null && p.birthDate >= "1965",
  );
  const titles = {
    en: [...new Set(wanted.map((p) => p.titles.en).filter(present))],
    fr: [...new Set(wanted.map((p) => p.titles.fr).filter(present))],
  };
  const files = [...new Set(wanted.map((p) => p.imageFile).filter(present))];

  const plan = planRequests({
    en: titles.en.length,
    fr: titles.fr.length,
    files: files.length,
  });
  const budget = deps.maxRequests ?? MAX_REQUESTS;
  deps.log(
    `${players.length} footballers on Wikidata, ${wanted.length} men born 1965 or later: ${titles.en.length} English and ${titles.fr.length} French articles, ${files.length} photos`,
  );
  deps.log(
    `plan: wdqs ${plan.wdqs}, wikimedia ${plan.wikimedia} (+ redirects, counted before they are asked), github ${plan.github}: at most ${plan.total} requests before redirects, plus retries after a 503 (budget ${budget})`,
  );
  if (plan.total > budget)
    throw new Refusal(
      `the run would make at least ${plan.total} requests before redirects, over the budget of ${budget}`,
    );

  // English and French infoboxes, keyed by the title Wikidata gives and by
  // the title the page answers to (a sitelink may go through a redirect).
  const infoboxes = async (lang: "en" | "fr") =>
    new Map(
      await cached<[string, Infobox][]>(`infobox-${lang}`, async () => {
        const out: [string, Infobox][] = [];
        let pages = 0;
        let incomplete = 0;
        for (const batch of chunk(titles[lang])) {
          const json = await wikimedia.getJson(revisionsUrl(lang, batch));
          pagesOf(json, batch.length);
          if ((json as { continue?: unknown } | null)?.continue) incomplete++;
          const read = parseRevisions(json);
          const moved = new Map(read.aliases);
          const target = (title: string) => {
            let t = title;
            for (let i = 0; i < 3 && moved.has(t); i++) t = moved.get(t)!;
            return t;
          };
          const boxes = new Map<string, Infobox>();
          for (const page of read.pages) {
            pages++;
            const box =
              lang === "en"
                ? parseEnInfobox(page.title, page.wikitext)
                : parseFrInfobox(page.title, page.wikitext);
            if (box) boxes.set(page.title, box);
          }
          for (const [title, box] of boxes) out.push([title, box]);
          for (const title of batch) {
            const box = boxes.get(target(title));
            if (box && !boxes.has(title)) out.push([title, box]);
          }
        }
        deps.log(
          `infobox-${lang}: ${titles[lang].length} titles, ${pages} pages, ${new Set(out.map(([, b]) => b)).size} infoboxes${incomplete > 0 ? `; ${incomplete} answers were cut short (continue)` : ""}`,
        );
        if (titles[lang].length > 0)
          nonEmpty(out, `no infobox in ${titles[lang].length} titles`);
        return out;
      }),
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
  });
  deps.log(
    `plan with redirects: wdqs ${exact.wdqs}, wikimedia ${exact.wikimedia}, github ${exact.github}: at most ${exact.total} requests, plus retries after a 503 (budget ${budget})`,
  );
  if (exact.total > budget)
    throw new Refusal(
      `with ${exact.wikimedia - plan.wikimedia} redirect lookups the run would make up to ${exact.total} requests, over the budget of ${budget}`,
    );
  const redirects = await cached<{
    en: [string, string][];
    fr: [string, string][];
  }>("redirects", async () => {
    const out: { en: [string, string][]; fr: [string, string][] } = {
      en: [],
      fr: [],
    };
    for (const lang of ["en", "fr"] as const) {
      for (const batch of chunk(currentClubs[lang])) {
        const json = await wikimedia.getJson(redirectsUrl(lang, batch));
        pagesOf(json, batch.length);
        out[lang].push(...parseRevisions(json).aliases);
      }
    }
    return out;
  });

  // Clubs: by id (memberships, honours, curated honours, overrides) and by
  // title (infoboxes, this season's Ligue 1), in up to three queries.
  const overrides = shape.overrides;
  const clubQids = [
    ...new Set([
      ...wikidata.memberships.filter((m) => !m.national).map((m) => m.teamQid),
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
  const enTitles = [
    ...new Set([...titlesOf(boxesOf(en), redirects.en), ...ligue1.clubs]),
  ];
  const frTitles = titlesOf(boxesOf(fr), redirects.fr);
  const clubs = await cached<WdClub[]>("clubs", async () => {
    const found = new Map<string, WdClub>();
    const parts: [string, string[], string[], string[]][] = [
      ["clubs by id", clubQids, [], []],
      ["clubs by English title", [], enTitles, []],
      ["clubs by French title", [], [], frTitles],
    ];
    for (const [label, qids, enT, frT] of parts) {
      if (qids.length + enT.length + frT.length === 0) continue;
      for (const club of parseClubs(
        await sparql(label, clubsQuery(qids, enT, frT)),
      ))
        if (!found.has(club.qid)) found.set(club.qid, club);
    }
    // One title part may rightly match nothing; all of them together may not.
    const asked = clubQids.length + enTitles.length + frTitles.length;
    if (asked > 0)
      nonEmpty([...found.values()], `no club for ${asked} ids and titles`);
    return [...found.values()];
  });

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

  const photos = await cached<Photo[]>("commons", async () => {
    const out: Photo[] = [];
    for (const batch of chunk(files)) {
      const json = await wikimedia.getJson(commonsUrl(batch));
      const found = parseCommons(json); // throws on an error body
      pagesOf(json, batch.length);
      out.push(...found.values());
    }
    return out;
  });
  const matches = await cached<Match[]>("martj42", async () =>
    nonEmpty(
      tunisiaMatches(await github.getText(RESULTS_URL)),
      "no Tunisia match",
    ),
  );
  // A floor for goals, never a confirmation (addendum §5).
  const scorers = await cached<[string, number][]>("martj42-goals", async () =>
    nonEmpty(
      tunisiaScorers(await github.getText(GOALSCORERS_URL)),
      "no Tunisia scorer",
    ),
  );

  const { pool, ids } = buildPool({
    today: deps.today,
    players,
    memberships: groupBy(wikidata.memberships, (m) => m.playerQid),
    index: buildClubIndex(
      clubs,
      { en: new Map(redirects.en), fr: new Map(redirects.fr) },
      checked.overrides.clubTitles,
    ),
    infoboxes: { en, fr },
    photos: new Map(photos.map((p) => [p.file, p])),
    tunisiaMatches: matches,
    goalsFloor: goalsFloors(scorers, players),
    overrides: checked.overrides,
    governorateIds,
    honours: wikidata.honours,
    curatedHonours,
    ligue1Titles: ligue1.clubs,
    previous,
    ids: registry,
  });
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
        today: deps.today,
        honoursReading: wikidata.honoursReading,
        overrideWarnings: checked.warnings,
      }),
    ],
  ]);
  return { ok: true, changed: diff.changed };
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
