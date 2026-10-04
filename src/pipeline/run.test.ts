import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { createPoliteClient, StoppedError } from "./http.ts";
import type { PoliteClient } from "./http.ts";
import { planRequests, run } from "./run.ts";
import type { RunDeps } from "./run.ts";
import type { Pool } from "./types.ts";

const uri = (id: string) => ({
  type: "uri",
  value: `http://www.wikidata.org/entity/${id}`,
});
const lit = (value: string) => ({ type: "literal", value });
const result = (...bindings: object[]) => ({ results: { bindings } });

const answers = {
  players: result({
    p: uri("Q1001"),
    enLabel: lit("Test Footballer"),
    arLabel: lit("لاعب تجربة"),
    birth: lit("1995-05-05T00:00:00Z"),
    positions: lit("midfielder"),
    birthPlace: uri("Q3572"),
    birthPlaceName: lit("Tunis"),
    birthCountry: lit("TN"),
    governorates: lit("Tunis Governorate"),
    image: {
      type: "uri",
      value: "http://commons.wikimedia.org/wiki/Special:FilePath/Test.jpg",
    },
    enwiki: lit("Test Footballer"),
  }),
  aliases: result({ p: uri("Q1001"), aliases: lit("Testo") }),
  memberships: result({
    p: uri("Q1001"),
    team: uri("Q27971"),
    start: lit("2015-01-01T00:00:00Z"),
    isNational: lit("1"),
  }),
  honours: result({
    compName: lit("Tunisian Ligue Professionnelle 1"),
    seasonLabel: lit("2012–13 Tunisian Ligue Professionnelle 1"),
    winner: uri("Q2001"),
  }),
  clubs: result(
    {
      club: uri("Q2001"),
      en: lit("Club Africain"),
      iso: lit("TN"),
      leagues: lit("Q794235"),
      enTitle: lit("Club Africain"),
    },
    {
      club: uri("Q2002"),
      en: lit("CS Sfaxien"),
      iso: lit("TN"),
      leagues: lit("Q794235"),
      enTitle: lit("CS Sfaxien"),
    },
  ),
};

const infobox = `{{Infobox football biography
| name = Test Footballer
| position = [[Midfielder]]
| currentclub = [[Club Africain]]
| clubs1 = [[Club Africain]]
| years1 = 2014–
| caps1 = 120
| goals1 = 10
| pcupdate = 1 October 2026
| nationalyears1 = 2015–
| nationalteam1 = [[Tunisia national football team|Tunisia]]
| nationalcaps1 = 30
| nationalgoals1 = 2
| ntupdate = 1 October 2026
}}`;

const csv =
  "date,home_team,away_team,home_score,away_score,tournament,city,country,neutral\n2026-09-09,Tunisia,Mali,1,0,Friendly,Tunis,Tunisia,FALSE\n";
const goalsCsv =
  "date,home_team,away_team,team,scorer,minute,own_goal,penalty\n2026-09-09,Tunisia,Mali,Tunisia,Test Footballer,12,FALSE,FALSE\n";

type Calls = { urls: string[]; queries: string[] };

function wdqs(calls: Calls = { urls: [], queries: [] }, fail = false) {
  const client: PoliteClient = {
    async getJson(url, init) {
      calls.urls.push(url);
      if (fail) throw new StoppedError(url, 429);
      const query = new URLSearchParams(String(init?.body)).get("query") ?? "";
      calls.queries.push(query);
      if (query.includes("skos:altLabel")) return answers.aliases;
      if (query.includes("pq:P580")) return answers.memberships;
      if (query.includes("wdt:P1346")) return answers.honours;
      if (query.includes("GROUP BY ?club")) return answers.clubs;
      return answers.players;
    },
    getText: async () => "",
  };
  return client;
}

/** en.wikipedia, fr.wikipedia and Commons, answered by host: one client. */
function wikimedia(calls: Calls = { urls: [], queries: [] }) {
  const client: PoliteClient = {
    async getJson(url) {
      calls.urls.push(url);
      if (url.includes("commons.wikimedia.org")) {
        return {
          query: {
            pages: [
              {
                title: "File:Test.jpg",
                imageinfo: [
                  {
                    thumburl:
                      "https://upload.wikimedia.org/t.jpg?utm_source=commons",
                    width: 800,
                    height: 600,
                    descriptionurl:
                      "https://commons.wikimedia.org/wiki/File:Test.jpg",
                    extmetadata: {
                      LicenseShortName: { value: "CC BY-SA 4.0" },
                    },
                  },
                ],
              },
            ],
          },
        };
      }
      if (url.includes("prop=revisions")) {
        return {
          query: {
            pages: [
              {
                title: "Test Footballer",
                revisions: [
                  { revid: 1, slots: { main: { content: infobox } } },
                ],
              },
            ],
          },
        };
      }
      return { query: {} };
    },
    getText: async () => "",
  };
  return client;
}

/** Throws StoppedError on every call, as a stopped client does. */
const stopped = (host: string, calls: string[] = []): PoliteClient => ({
  async getJson(url) {
    calls.push(url);
    throw new StoppedError(`https://${host}/w/api.php`, 429);
  },
  async getText(url) {
    calls.push(url);
    throw new StoppedError(`https://${host}/x`, 429);
  },
});

const github = (urls: string[] = []): PoliteClient => ({
  getJson: async () => ({}),
  getText: async (url) => {
    urls.push(url);
    return url.includes("goalscorers") ? goalsCsv : csv;
  },
});

async function setup(overrides: unknown = { players: {}, clubTitles: {} }) {
  const root = await mkdtemp(path.join(tmpdir(), "kora-run-"));
  await mkdir(path.join(root, "data", "curated"), { recursive: true });
  const write = (name: string, value: unknown) =>
    writeFile(path.join(root, "data", name), JSON.stringify(value));
  await write(
    "curated/governorates.json",
    JSON.parse(await readFile("data/curated/governorates.json", "utf8")),
  );
  await write("curated/ligue1-clubs.json", {
    season: "2026–27",
    clubs: ["Club Africain"],
  });
  await write("curated/honours.json", []);
  await write("overrides.json", overrides);
  return root;
}

const deps = (root: string, over: Partial<RunDeps> = {}): RunDeps => ({
  root,
  today: "2026-10-04",
  wdqs: wdqs(),
  wikimedia: wikimedia(),
  github: github(),
  log: () => {},
  ...over,
});

const file = (root: string, name: string) => path.join(root, "data", name);
const readPool = async (root: string) =>
  JSON.parse(await readFile(file(root, "pool.json"), "utf8")) as Pool;
const exists = (p: string) =>
  access(p).then(
    () => true,
    () => false,
  );

describe("run", () => {
  it("builds and writes the pool, the id registry and the report from the sources", async () => {
    const root = await setup();
    expect(await run(deps(root))).toEqual({ ok: true, changed: true });

    const pool = await readPool(root);
    expect(pool.players).toHaveLength(1);
    expect(pool.players[0]).toMatchObject({
      id: "test-footballer",
      clubId: "club-africain",
      governorate: "tunis",
      caps: 30,
      aliases: ["Testo"],
      pools: { active: true, legend: true },
      photo: {
        licence: "CC BY-SA 4.0",
        thumbUrl: "https://upload.wikimedia.org/t.jpg?utm_source=commons",
      },
    });
    expect(pool.players[0].provenance.caps).toMatchObject({
      source: "enwiki",
      confidence: "medium",
      agreeing: ["enwiki"],
    });
    expect(pool.clubs.map((c) => [c.id, c.ligue1])).toEqual([
      ["club-africain", true],
    ]);
    expect(pool.honours).toEqual([
      {
        competition: "tn_ligue1",
        seasonStart: 2012,
        seasonEnd: 2013,
        clubId: "club-africain",
        source: "wikidata",
      },
    ]);
    expect(JSON.parse(await readFile(file(root, "ids.json"), "utf8"))).toEqual({
      players: { Q1001: "test-footballer" },
      clubs: { Q2001: "club-africain" },
    });
    const report = await readFile(file(root, "report.md"), "utf8");
    expect(report).toContain("# Nightly pool, 2026-10-04");
    for (const source of [
      "wikidata",
      "infobox-en",
      "infobox-fr",
      "redirects",
      "clubs",
      "commons",
      "martj42",
      "martj42-goals",
    ])
      expect(report).toContain(`| ${source} | fresh | 2026-10-04 |  |`);
  });

  it("writes the registry it is given back, and keeps old entries", async () => {
    const root = await setup();
    await writeFile(
      file(root, "ids.json"),
      JSON.stringify({
        players: { Q9: "gone-footballer" },
        clubs: { Q9: "gone-club" },
      }),
    );
    await run(deps(root));
    const text = await readFile(file(root, "ids.json"), "utf8");
    expect(JSON.parse(text)).toEqual({
      players: { Q9: "gone-footballer", Q1001: "test-footballer" },
      clubs: { Q9: "gone-club", Q2001: "club-africain" },
    });
    // Stable formatting: keys in Wikidata-number order, two-space indent, final newline.
    expect(text).toBe(
      [
        "{",
        '  "clubs": {',
        '    "Q9": "gone-club",',
        '    "Q2001": "club-africain"',
        "  },",
        '  "players": {',
        '    "Q9": "gone-footballer",',
        '    "Q1001": "test-footballer"',
        "  }",
        "}",
        "",
      ].join("\n"),
    );
  });

  it("finds the infobox when Wikidata's article title is a redirect", async () => {
    const root = await setup();
    const moved = "Test Footballer (born 1995)";
    const players = JSON.parse(JSON.stringify(answers.players));
    players.results.bindings[0].enwiki = lit(moved);
    const base = wdqs();
    const client: PoliteClient = {
      async getJson(url, init) {
        const query =
          new URLSearchParams(String(init?.body)).get("query") ?? "";
        return query.includes("GROUP BY ?p") && !query.includes("skos:altLabel")
          ? players
          : base.getJson(url, init);
      },
      getText: async () => "",
    };
    const inner = wikimedia();
    const site: PoliteClient = {
      async getJson(url) {
        const json = (await inner.getJson(url)) as {
          query: Record<string, unknown>;
        };
        if (url.includes("prop=revisions"))
          json.query.redirects = [{ from: moved, to: "Test Footballer" }];
        return json;
      },
      getText: async () => "",
    };
    await run(deps(root, { wdqs: client, wikimedia: site }));
    expect((await readPool(root)).players[0]).toMatchObject({
      caps: 30,
      clubId: "club-africain",
    });
  });

  it("falls back to the cache for every source behind a stopped client, and says so", async () => {
    const root = await setup();
    await run(deps(root));
    const before = await readPool(root);

    const wikimediaCalls: string[] = [];
    const wdqsCalls: Calls = { urls: [], queries: [] };
    const githubUrls: string[] = [];
    expect(
      await run(
        deps(root, {
          today: "2026-10-05",
          wdqs: wdqs(wdqsCalls),
          wikimedia: stopped("en.wikipedia.org", wikimediaCalls),
          github: github(githubUrls),
        }),
      ),
    ).toEqual({ ok: true, changed: false });
    expect(await readPool(root)).toEqual(before);
    const report = await readFile(file(root, "report.md"), "utf8");
    const note =
      "HTTP 429 from en.wikipedia.org: client stopped, no further requests";
    expect(report).toContain(`| infobox-en | cached | 2026-10-04 | ${note} |`);
    expect(report).toContain(`| commons | cached | 2026-10-04 | ${note} |`);
    // The other clients' sources are read fresh.
    expect(report).toContain("| wikidata | fresh | 2026-10-05 |  |");
    expect(report).toContain("| martj42-goals | fresh | 2026-10-05 |  |");
    expect(wdqsCalls.urls.length).toBeGreaterThan(0);
    expect(githubUrls).toHaveLength(2);
  });

  it("sends nothing more to Wikimedia once one of its sites answers 429", async () => {
    const root = await setup();
    await run(deps(root));

    const sent: string[] = [];
    const real = createPoliteClient({
      minGapMs: 0,
      maxRetries: 0,
      fetch: async (url) => {
        sent.push(url);
        return new Response("", { status: 429 });
      },
    });
    const outcome = await run(
      deps(root, { today: "2026-10-05", wikimedia: real }),
    );
    expect(outcome.ok).toBe(true);
    // English infoboxes got the 429; redirects and Commons never reached the network.
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("en.wikipedia.org");
    const report = await readFile(file(root, "report.md"), "utf8");
    expect(report).toMatch(/\| redirects \| cached \| 2026-10-04 \| HTTP 429/);
    expect(report).toMatch(/\| commons \| cached \| 2026-10-04 \| HTTP 429/);
  });

  it("stops and writes nothing when a source fails and nothing is cached", async () => {
    const root = await setup();
    const outcome = await run(
      deps(root, { wdqs: wdqs(undefined, true), log: () => {} }),
    );
    expect(outcome).toEqual({
      ok: false,
      reason:
        "wikidata failed and there is no cached copy (HTTP 429 from query.wikidata.org: client stopped, no further requests)",
    });
    for (const name of ["pool.json", "ids.json", "report.md"])
      expect(await exists(file(root, name))).toBe(false);

    const outcome2 = await run(
      deps(root, { github: stopped("raw.githubusercontent.com") }),
    );
    expect(outcome2.ok).toBe(false);
    expect(outcome2).toMatchObject({
      reason: expect.stringContaining(
        "martj42 failed and there is no cached copy",
      ),
    });
    expect(await exists(file(root, "pool.json"))).toBe(false);
  });

  it("stops before any request on a malformed overrides file, printing every error", async () => {
    const root = await setup({
      players: {
        Q1001: { caps: { value: -1, by: "jalel", at: "2026-10-05" } },
      },
      clubTitles: { "xx:Bad": "Q1" },
    });
    const calls: Calls = { urls: [], queries: [] };
    const lines: string[] = [];
    const outcome = await run(
      deps(root, { wdqs: wdqs(calls), log: (l) => lines.push(l) }),
    );
    expect(outcome.ok).toBe(false);
    expect(calls.urls).toEqual([]);
    expect(lines.join("\n")).toContain("players.Q1001.caps: invalid value -1");
    expect(lines.join("\n")).toContain("clubTitles.xx:Bad");
    expect(await exists(file(root, "pool.json"))).toBe(false);
  });

  it("asks Wikidata for the clubs the overrides name, so a correct override passes", async () => {
    const root = await setup({
      players: {
        Q1001: {
          club: {
            value: "Q2002",
            by: "jalel",
            at: "2026-10-05",
            note: "CS Sfaxien again",
          },
        },
      },
      clubTitles: {},
    });
    const calls: Calls = { urls: [], queries: [] };
    expect(await run(deps(root, { wdqs: wdqs(calls) }))).toEqual({
      ok: true,
      changed: true,
    });
    const clubQueries = calls.queries.filter((q) =>
      q.includes("GROUP BY ?club"),
    );
    expect(clubQueries.some((q) => q.includes("wd:Q2002"))).toBe(true);
    expect((await readPool(root)).players[0].clubId).toBe("cs-sfaxien");
  });

  it("stops the build on an override naming a club Wikidata does not know", async () => {
    const root = await setup({
      players: {
        Q1001: { club: { value: "Q7777", by: "jalel", at: "2026-10-05" } },
      },
      clubTitles: {},
    });
    const lines: string[] = [];
    const outcome = await run(deps(root, { log: (l) => lines.push(l) }));
    expect(outcome.ok).toBe(false);
    expect(lines.join("\n")).toContain('"Q7777" is not a club in the pool');
    expect(await exists(file(root, "pool.json"))).toBe(false);
  });

  it("refuses before any Wikimedia request when the plan is over the budget", async () => {
    const root = await setup();
    const calls: Calls = { urls: [], queries: [] };
    const lines: string[] = [];
    const outcome = await run(
      deps(root, {
        wikimedia: wikimedia(calls),
        maxRequests: 5,
        log: (l) => lines.push(l),
      }),
    );
    expect(outcome).toMatchObject({ ok: false });
    expect(calls.urls).toEqual([]);
    expect(lines.join("\n")).toMatch(/plan: wdqs \d+, wikimedia \d+, github 2/);
  });

  it("refuses a pool that shrinks by more than a tenth, leaving the old one", async () => {
    const root = await setup();
    const previous = {
      version: 1,
      players: Array.from({ length: 50 }, (_, i) => ({
        id: `p${i}`,
        wikidataId: `Q${9000 + i}`,
        provenance: {},
      })),
      clubs: [],
      honours: [],
      flags: [],
      dropped: [],
    };
    await writeFile(file(root, "pool.json"), JSON.stringify(previous));

    const outcome = await run(deps(root));
    expect(outcome.ok).toBe(false);
    expect(JSON.parse(await readFile(file(root, "pool.json"), "utf8"))).toEqual(
      previous,
    );
    expect(await exists(file(root, "ids.json"))).toBe(false);
  });
});

describe("planRequests", () => {
  it("counts batches of 50 per site and an upper bound for redirects", () => {
    // en 3 + fr 2 + Commons 1, then redirects at most 3 + 2.
    expect(planRequests({ en: 120, fr: 51, files: 50 })).toEqual({
      wdqs: 7,
      wikimedia: 11,
      github: 2,
      total: 20,
    });
  });
});

/** Thrown by no-network.ts; not imported here, so its side effect comes from the setup alone. */
const NO_NETWORK = "network is not allowed in tests";

/** node --import no-network.ts src/pipeline/cli.ts <args>, in `cwd`. */
async function cli(args: string[], cwd: string) {
  const here = path.join(process.cwd(), "src", "pipeline");
  return promisify(execFile)(
    process.execPath,
    [
      "--import",
      pathToFileURL(path.join(here, "no-network.ts")).href,
      path.join(here, "cli.ts"),
      ...args,
    ],
    { cwd },
  ).then(
    () => null,
    (error: { code: number; stdout: string; stderr: string }) => error,
  );
}

describe("no network in tests", () => {
  it("makes fetch throw inside the test process", async () => {
    // A closed local port: without the setup file this fails differently.
    await expect(fetch("http://127.0.0.1:9/")).rejects.toThrow(NO_NETWORK);
  });

  it("makes a spawned build fail on its first request", async () => {
    const root = await setup();
    const failed = await cli(["build"], root);
    expect(failed?.code).toBe(1);
    expect(failed?.stdout).toContain(`wikidata: ${NO_NETWORK}; no cached copy`);
    expect(failed?.stdout).not.toContain("wdqs players:");
    expect(failed?.stderr).toContain(
      `data:build refused: wikidata failed and there is no cached copy (${NO_NETWORK})`,
    );
    expect(await exists(file(root, "pool.json"))).toBe(false);
  });
});

describe("pnpm data:build (node src/pipeline/cli.ts build)", () => {
  it("refuses with exit code 1, before any request, on a broken overrides file", async () => {
    const root = await setup({
      players: { Q1: { caps: { value: -1 } } },
      clubTitles: {},
    });
    const failed = await cli(["build"], root);
    expect(failed?.code).toBe(1);
    expect(failed?.stdout).toContain("data/overrides.json: players.Q1.caps");
    expect(failed?.stderr).toContain(
      "data:build refused: data/overrides.json has 1 error",
    );
    expect(failed?.stdout).not.toContain("plan:");
    expect(await exists(file(root, "pool.json"))).toBe(false);
  });
});
