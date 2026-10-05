import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSiteClient } from "./witness/client.ts";
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
import { runSample } from "./witness/run.ts";
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

for (const line of describePlan({ mode, year, sites, privateDir, mapping }))
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

fail("weekly and backfill runs are not built yet (Task B8)");
