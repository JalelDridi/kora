import { readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPoliteClient } from "./http.ts";
import type { Pool } from "./types.ts";
import { sparqlRequest } from "./wikidata/queries.ts";
import { createSiteClient } from "./witness/client.ts";
import {
  mappingCounts,
  mappingFromJson,
  mappingQuery,
  mappingToJson,
  parseMapping,
} from "./witness/mapping.ts";
import type { Mapping } from "./witness/mapping.ts";
import {
  describePlan,
  SITE_NAMES,
  SITES,
  WITNESS_USER_AGENT,
} from "./witness/plan.ts";
import type { Mode, SiteName } from "./witness/plan.ts";
import {
  environmentRefusal,
  insideRepo,
  witnessDir,
} from "./witness/safety.ts";
import { runBackfill, runSample, runWeekly } from "./witness/run.ts";
import { emptyWitness, validateWitness } from "./witness/verdicts.ts";
import type { WitnessFile } from "./witness/verdicts.ts";
import { openStore } from "./witness/store.ts";

// The private witness (decisions P43, P44, P48): an entry point only, with
// nothing to import. Run by hand on Jalel's PC:
//   pnpm data:witness                      the plan: no request at all
//   pnpm data:witness --live               the weekly check of both sites
//   pnpm data:witness --live --site transfermarkt
//   pnpm data:witness --live --sample      B5's one-off sample: 6 pages, saved privately
//   pnpm data:witness --live --backfill 40 the next 40 national-football-teams player pages
// It refuses (exit 2) under CI, GITHUB_ACTIONS or VITEST, and when the
// private folder is inside the repo. No workflow or script calls it.

const argv = process.argv.slice(2);
const env = process.env;
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const where = { repoRoot, home: homedir() };

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

// Before anything else, and whatever the arguments: the environment.
const refused =
  environmentRefusal(env, where) ??
  (insideRepo(witnessDir(env, where.home), process.cwd())
    ? `refused: the private folder ${witnessDir(env, where.home)} is inside ${process.cwd()}`
    : null);
if (refused) fail(refused);

const value = (flag: string) => {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
};
const known = new Set(["--live", "--sample", "--backfill", "--site"]);
for (const [i, arg] of argv.entries())
  if (arg.startsWith("--") && !known.has(arg)) fail(`unknown option ${arg}`);
  else if (
    !arg.startsWith("--") &&
    !["--backfill", "--site"].includes(argv[i - 1])
  )
    fail(`unexpected argument ${arg}`);

let mode: Mode = { kind: "weekly" };
if (argv.includes("--sample")) mode = { kind: "sample" };
const backfill = value("--backfill");
if (backfill !== undefined) {
  const pages = Number(backfill);
  if (!Number.isInteger(pages) || pages < 1 || pages > 39)
    fail("--backfill takes a number of pages from 1 to 39");
  if (mode.kind === "sample")
    fail("--sample and --backfill do not go together");
  mode = { kind: "backfill", pages };
}
const site = value("--site");
if (site !== undefined && !SITE_NAMES.includes(site as SiteName))
  fail(`--site takes ${SITE_NAMES.join(" or ")}`);
const sites: SiteName[] =
  mode.kind === "backfill"
    ? ["national-football-teams"]
    : site
      ? [site as SiteName]
      : [...SITE_NAMES];

const privateDir = witnessDir(env, where.home);
const year = new Date().getUTCFullYear();
const mapping = await readFile(path.join(privateDir, "mapping.json"), "utf8")
  .then((text) => {
    const m = JSON.parse(text) as {
      counts?: Parameters<typeof describePlan>[0]["mapping"];
    };
    return m.counts ?? null;
  })
  .catch(() => null);

// Fix round 1: our Ligue 1 clubs the last mapping cannot tie to Transfermarkt.
const unmappedClubs = await Promise.all([
  readFile(path.join(privateDir, "mapping.json"), "utf8"),
  readFile(path.join(repoRoot, "data", "pool.json"), "utf8"),
])
  .then(([m, p]) => {
    const clubs =
      (JSON.parse(m) as { clubs?: Record<string, string> }).clubs ?? {};
    const pool = JSON.parse(p) as Pool;
    return pool.clubs
      .filter((c) => c.ligue1 && !Object.hasOwn(clubs, c.wikidataId))
      .map((c) => ({
        name: c.nameLatin,
        footballers: pool.players.filter((x) => x.clubId === c.id).length,
      }));
  })
  .catch(() => null);

for (const line of describePlan({
  mode,
  year,
  sites,
  privateDir,
  mapping,
  unmappedClubs,
}))
  console.log(line);

if (!argv.includes("--live")) {
  console.log("", "dry run: add --live to send these requests");
  process.exit(0);
}

// Live. Every guard above has passed: only now are clients created.
const store = await openStore({ env, home: where.home, repoRoot });
const today = new Date().toISOString().slice(0, 10);
const siteClient = (name: SiteName, maxRequests: number) =>
  createSiteClient({
    host: SITES[name].host,
    gapMs: SITES[name].gapMs,
    maxRequests: Math.min(maxRequests, SITES[name].maxRequests),
    userAgent: WITNESS_USER_AGENT,
  });
const log = (line: string) => console.log(line);

if (mode.kind === "sample") {
  const result = await runSample({
    sites: Object.fromEntries(sites.map((s) => [s, siteClient(s, 3)])),
    store,
    log,
    today,
  });
  for (const [name, why] of Object.entries(result.stopped))
    console.log(
      `${name} refused or stopped: ${why}. Tell Jalel; build nothing more for that site.`,
    );
  process.exit(0);
}

// Weekly and backfill: our published values, the verdicts so far, the ids.
const dataDir = path.join(repoRoot, "data");
const pool = JSON.parse(
  await readFile(path.join(dataDir, "pool.json"), "utf8"),
) as Pool;
const witnessText = await readFile(path.join(dataDir, "witness.json"), "utf8")
  .then((t) => t)
  .catch(() => null);
const witness: WitnessFile = witnessText
  ? (JSON.parse(witnessText) as WitnessFile)
  : emptyWitness();
const witnessErrors = validateWitness(witness);
if (witnessErrors.length > 0)
  fail(`data/witness.json is broken: ${witnessErrors.join("; ")}`);

// B4: one Wikidata query, with the pipeline's usual manners.
const playerQids = pool.players.map((p) => p.wikidataId);
const clubQids = pool.clubs.filter((c) => c.ligue1).map((c) => c.wikidataId);
let ids: Mapping;
try {
  const wdqs = createPoliteClient({
    minGapMs: 2_000,
    maxRetries: 1,
    maxAttempts: 2,
  });
  const { url, init } = sparqlRequest(mappingQuery(playerQids, clubQids));
  ids = parseMapping(await wdqs.getJson(url, init));
  const counts = mappingCounts(ids, playerQids);
  await store.writeJson("mapping.json", mappingToJson(ids, counts));
  log(
    `ids: ${counts.transfermarkt} of ${counts.players} footballers on Transfermarkt (${counts.withoutTransfermarkt} without), ${counts.nft} on national-football-teams (${counts.withoutNft} without), ${counts.clubs} of ${clubQids.length} Ligue 1 clubs with a Transfermarkt id`,
  );
} catch (error) {
  const last =
    await store.readJson<Parameters<typeof mappingFromJson>[0]>("mapping.json");
  if (!last)
    fail(
      `the Wikidata query failed (${(error as Error).message}) and the private folder has no earlier mapping`,
    );
  ids = mappingFromJson(last);
  log(
    `ids: the Wikidata query failed (${(error as Error).message}); using the private folder's last mapping`,
  );
}

// Ctrl+C: the pages and the state already saved are kept; a second Ctrl+C quits.
const controller = new AbortController();
process.on("SIGINT", () => {
  if (controller.signal.aborted) process.exit(130);
  console.log("stopping after the current request (Ctrl+C again to quit now)");
  controller.abort();
});

const input = {
  sites: Object.fromEntries(
    sites.map((s) => [s, siteClient(s, SITES[s].maxRequests)]),
  ),
  store,
  log,
  today,
  signal: controller.signal,
  pool,
  mapping: ids,
  witness,
  writeWitness: async (text: string) => {
    const file = path.join(dataDir, "witness.json");
    const temp = `${file}.${process.pid}.tmp`;
    await writeFile(temp, text);
    await rename(temp, file);
  },
};
const result =
  mode.kind === "backfill"
    ? await runBackfill({ ...input, pages: mode.pages })
    : await runWeekly(input);
for (const [name, why] of Object.entries(result.stopped))
  console.log(
    `${name} stopped: ${why}. Do not retry it this week (P48 stop rules).`,
  );
process.exit(0);
