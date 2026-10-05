import { execFile } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { createPoliteClient, StoppedError } from "./http.ts";
import type { PoliteClient } from "./http.ts";
import {
  CACHE_VERSION,
  createClients,
  MAX_REQUESTS,
  planRequests,
  run,
  sectionZero,
} from "./run.ts";
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
      // Redirect lookups: the pages asked for, no redirect.
      return { query: { pages: [{ title: "Club Africain" }] } };
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
    // Final wave, B8: the cache keeps the answer's redirect list as sent, and
    // an offline rebuild reads the move from it again.
    const cached = JSON.parse(
      await readFile(file(root, "cache/infobox-en.json"), "utf8"),
    ) as { value: { batches: { redirects?: unknown }[] } };
    expect(cached.value.batches[0].redirects).toEqual([
      { from: moved, to: "Test Footballer" },
    ]);
    const pool = await readFile(file(root, "pool.json"), "utf8");
    expect(
      await run({ root, today: "2026-10-04", offline: true, log: () => {} }),
    ).toEqual({ ok: true, changed: false });
    expect(await readFile(file(root, "pool.json"), "utf8")).toBe(pool);
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

  it("refuses a footballer excluded and overridden at once, before any request (fix round 3)", async () => {
    const by = { by: "jalel", at: "2026-10-05" };
    const root = await setup({
      players: {
        Q1001: {
          exclude: { value: true, ...by },
          pools: { value: { active: false, legend: true }, ...by },
        },
      },
      clubTitles: {},
    });
    const calls: Calls = { urls: [], queries: [] };
    const lines: string[] = [];
    const outcome = await run(
      deps(root, { wdqs: wdqs(calls), log: (l) => lines.push(l) }),
    );
    expect(outcome).toEqual({
      ok: false,
      reason: "data/overrides.json has 1 error",
    });
    expect(calls.urls).toEqual([]);
    expect(lines).toContain(
      "data/overrides.json: players.Q1001: excluded and overridden at once",
    );
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

  it("refuses before any Wikimedia request when the plan is truly over 70", async () => {
    const root = await setup();
    // 3,000 wanted footballers with an English article: 60 batches of 50.
    const many = result(
      ...Array.from({ length: 3000 }, (_, i) => ({
        p: uri(`Q${5000 + i}`),
        enLabel: lit(`Footballer ${i}`),
        birth: lit("1995-05-05T00:00:00Z"),
        enwiki: lit(`Footballer ${i}`),
      })),
    );
    const base = wdqs();
    const client: PoliteClient = {
      async getJson(url, init) {
        const query =
          new URLSearchParams(String(init?.body)).get("query") ?? "";
        return query.includes("GROUP BY ?p") && !query.includes("skos:altLabel")
          ? many
          : base.getJson(url, init);
      },
      getText: async () => "",
    };
    const calls: Calls = { urls: [], queries: [] };
    const lines: string[] = [];
    const outcome = await run(
      deps(root, {
        wdqs: client,
        wikimedia: wikimedia(calls),
        log: (l) => lines.push(l),
      }),
    );
    expect(outcome).toEqual({
      ok: false,
      reason:
        "the run would make at least 71 requests before redirects, over the budget of 70",
    });
    expect(calls.urls).toEqual([]);
    expect(lines).toContain(
      "plan: wdqs 7, wikimedia 62 (+ redirects, counted before they are asked), github 2: at most 71 requests before redirects, plus retries after a 503 (budget 70)",
    );
  });

  it("checks again, exactly, before the redirects, and refuses there when they push the total over", async () => {
    const root = await setup();
    const calls: Calls = { urls: [], queries: [] };
    const lines: string[] = [];
    // 7 + (1 English batch + 1 Commons batch + 2 squad pages) + 2 = 13
    // before redirects; 1 redirect batch makes 14.
    const outcome = await run(
      deps(root, {
        wikimedia: wikimedia(calls),
        maxRequests: 13,
        log: (l) => lines.push(l),
      }),
    );
    expect(outcome).toEqual({
      ok: false,
      reason:
        "with 1 redirect lookups the run would make up to 14 requests, over the budget of 13",
    });
    expect(calls.urls).toHaveLength(1);
    expect(calls.urls[0]).toContain("prop=revisions");
    expect(lines).toContain(
      "plan with redirects: wdqs 7, wikimedia 5, github 2: at most 14 requests, plus retries after a 503 (budget 13)",
    );
  });

  it("passes a healthy plan and logs the clients' HTTP attempts, not calls", async () => {
    const root = await setup();
    const lines: string[] = [];
    expect(
      await run(
        deps(root, {
          attempts: () => ({ wdqs: 7, wikimedia: 5, github: 2 }),
          log: (l) => lines.push(l),
        }),
      ),
    ).toMatchObject({ ok: true });
    expect(lines).toContain(
      "requests (HTTP attempts): wdqs 7, wikimedia 5, github 2",
    );
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
    expect(await exists(file(root, "report.md"))).toBe(false);
  });

  it("leaves the previous three files untouched when writing fails after rendering", async () => {
    const root = await setup();
    await run(deps(root));
    const names = ["ids.json", "pool.json", "report.md"];
    const before = await Promise.all(
      names.map((n) => readFile(file(root, n), "utf8")),
    );
    let writes = 0;
    const outcome = await run(
      deps(root, {
        today: "2026-10-05",
        wikimedia: stopped("en.wikipedia.org"),
        writeFile: async (target, text) => {
          if (++writes === 3) throw new Error("disk full");
          await writeFile(target, text);
        },
      }),
    );
    expect(outcome).toEqual({
      ok: false,
      reason: "could not write the outputs, nothing was replaced (disk full)",
    });
    expect(
      await Promise.all(names.map((n) => readFile(file(root, n), "utf8"))),
    ).toEqual(before);
    const left = (await readdir(path.join(root, "data"))).filter((n) =>
      n.endsWith(".tmp"),
    );
    expect(left).toEqual([]);
  });

  it("refuses an invalid pool and writes nothing", async () => {
    const root = await setup();
    const players = JSON.parse(JSON.stringify(answers.players));
    // Not a two-letter country code: validatePool rejects the footballer.
    players.results.bindings[0].birthCountry = lit("XYZ");
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
    const lines: string[] = [];
    const outcome = await run(
      deps(root, { wdqs: client, log: (l) => lines.push(l) }),
    );
    expect(outcome).toMatchObject({
      ok: false,
      reason: expect.stringContaining("the new pool is invalid"),
    });
    expect(lines.join(" ")).toContain("birth country XYZ");
    for (const name of ["pool.json", "ids.json", "report.md"])
      expect(await exists(file(root, name))).toBe(false);
  });

  it("asks for the clubs of wanted footballers only, not of everyone Wikidata gave", async () => {
    const root = await setup();
    const players = JSON.parse(JSON.stringify(answers.players));
    // Final wave, A1: every man is wanted, whatever his age; a woman is not.
    players.results.bindings.push({
      p: uri("Q1002"),
      enLabel: lit("Not Wanted"),
      gender: uri("Q6581072"),
      birth: lit("1990-01-01T00:00:00Z"),
    });
    const memberships = result(...answers.memberships.results.bindings, {
      p: uri("Q1002"),
      team: uri("Q3003"),
      start: lit("1970-01-01T00:00:00Z"),
    });
    const calls: Calls = { urls: [], queries: [] };
    const base = wdqs(calls);
    const client: PoliteClient = {
      async getJson(url, init) {
        const query =
          new URLSearchParams(String(init?.body)).get("query") ?? "";
        const answer = await base.getJson(url, init);
        if (query.includes("pq:P580")) return memberships;
        if (query.includes("GROUP BY ?p") && !query.includes("skos:altLabel"))
          return players;
        return answer;
      },
      getText: async () => "",
    };
    expect(await run(deps(root, { wdqs: client }))).toMatchObject({
      ok: true,
    });
    const byId = calls.queries.find((q) => q.includes("VALUES ?club"));
    expect(byId).toContain("wd:Q2001");
    expect(byId).not.toContain("wd:Q3003");
  });

  // Final wave, A1 (D-S1-1): a legend is 20 caps or more, any age, so the
  // pages of men born before 1965 are read too. B3: a French {{Lien}} club's
  // English title is asked with the English titles.
  it("reads every man's pages, and asks a French {{Lien}} club by its English title", async () => {
    const root = await setup();
    const players = JSON.parse(JSON.stringify(answers.players));
    players.results.bindings.push({
      p: uri("Q958968"),
      enLabel: lit("Tarak Dhiab"),
      birth: lit("1954-07-15T00:00:00Z"),
      positions: lit("midfielder"),
      enwiki: lit("Tarak Dhiab"),
      frwiki: lit("Tarak Dhiab"),
    });
    const wdCalls: Calls = { urls: [], queries: [] };
    const base = wdqs(wdCalls);
    const client: PoliteClient = {
      async getJson(url, init) {
        const query =
          new URLSearchParams(String(init?.body)).get("query") ?? "";
        const answer = await base.getJson(url, init);
        if (query.includes("GROUP BY ?p") && !query.includes("skos:altLabel"))
          return players;
        return answer;
      },
      getText: async () => "",
    };
    const wmCalls: Calls = { urls: [], queries: [] };
    const baseWm = wikimedia(wmCalls);
    const fr = `{{Infobox Footballeur
| club actuel = {{TUN-d}} {{Lien|trad=Hetten FC}}
}}`;
    const wm: PoliteClient = {
      async getJson(url, init) {
        if (url.startsWith("https://fr.") && url.includes("prop=revisions")) {
          wmCalls.urls.push(url);
          return {
            query: {
              pages: [
                {
                  title: "Tarak Dhiab",
                  revisions: [{ revid: 2, slots: { main: { content: fr } } }],
                },
              ],
            },
          };
        }
        const answer = (await baseWm.getJson(url, init)) as {
          query: { pages: object[] };
        };
        // No English page for him: a missing mark, as the API sends it.
        if (url.includes("prop=revisions"))
          answer.query.pages.push({ title: "Tarak Dhiab", missing: true });
        return answer;
      },
      getText: async () => "",
    };
    expect(
      await run(deps(root, { wdqs: client, wikimedia: wm })),
    ).toMatchObject({ ok: true });
    const revisions = wmCalls.urls
      .filter((u) => u.includes("prop=revisions"))
      .map((u) => new URL(u).searchParams.get("titles"));
    // Then the squad pages (P42): Ligue 1 clubs and the national team.
    expect(revisions).toEqual([
      "Test Footballer|Tarak Dhiab",
      "Tarak Dhiab",
      "Club Africain|Tunisia national football team",
    ]);
    const byEnglishTitle = wdCalls.queries.find((q) =>
      q.includes("en.wikipedia.org/> ; schema:about ?club"),
    );
    expect(byEnglishTitle).toContain('"Hetten FC"@en');
  });

  // Final wave, B4: an error while building the pool is a refusal with its
  // reason, not a stack trace.
  it("refuses, writing nothing, when the pool cannot be built", async () => {
    const root = await setup();
    await writeFile(file(root, "pool.json"), JSON.stringify({ version: 1 }));
    const lines: string[] = [];
    const result = await run(deps(root, { log: (l) => lines.push(l) }));
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.reason).toMatch(
      /^the pool could not be built: /,
    );
    expect(lines.at(-1)).toMatch(/^refused: the pool could not be built: /);
    expect(await exists(file(root, "report.md"))).toBe(false);
  });

  // Final wave, B6: a page listed without content, and no `continue`, fails
  // its source instead of being cached as fresh.
  it("fails a source whose answer lists a page without content", async () => {
    const root = await setup();
    const players = JSON.parse(JSON.stringify(answers.players));
    players.results.bindings.push({
      p: uri("Q1002"),
      enLabel: lit("Second Footballer"),
      birth: lit("1996-01-01T00:00:00Z"),
      enwiki: lit("Second Footballer"),
    });
    const base = wdqs();
    const client: PoliteClient = {
      async getJson(url, init) {
        const query =
          new URLSearchParams(String(init?.body)).get("query") ?? "";
        const answer = await base.getJson(url, init);
        if (query.includes("GROUP BY ?p") && !query.includes("skos:altLabel"))
          return players;
        return answer;
      },
      getText: async () => "",
    };
    const wm = wikimedia();
    const cut: PoliteClient = {
      async getJson(url, init) {
        const answer = (await wm.getJson(url, init)) as {
          query: { pages: object[] };
        };
        if (url.includes("prop=revisions"))
          answer.query.pages.push({ title: "Second Footballer" });
        return answer;
      },
      getText: async () => "",
    };
    const result = await run(deps(root, { wdqs: client, wikimedia: cut }));
    expect(result).toEqual({
      ok: false,
      reason:
        "infobox-en failed and there is no cached copy (1 of 2 titles came back without content or a missing mark (Second Footballer))",
    });
    expect(await exists(file(root, "cache/infobox-en.json"))).toBe(false);
  });

  it("refuses a malformed data/ids.json before any request", async () => {
    const root = await setup();
    await writeFile(file(root, "ids.json"), JSON.stringify({ players: [] }));
    const calls: Calls = { urls: [], queries: [] };
    const outcome = await run(deps(root, { wdqs: wdqs(calls) }));
    expect(outcome).toEqual({
      ok: false,
      reason: "data/ids.json has 1 error",
    });
    expect(calls.urls).toEqual([]);
    expect(await exists(file(root, "pool.json"))).toBe(false);
  });

  it("counts several registry errors in the plural", async () => {
    const root = await setup();
    await writeFile(
      file(root, "ids.json"),
      JSON.stringify({ players: { x: "a", y: "b" }, clubs: {} }),
    );
    expect(await run(deps(root))).toEqual({
      ok: false,
      reason: "data/ids.json has 2 errors",
    });
  });
});

describe("the source cache", () => {
  const cacheFile = (root: string, name: string) =>
    path.join(root, "data", "cache", `${name}.json`);
  const readCache = async (root: string, name: string) =>
    JSON.parse(await readFile(cacheFile(root, name), "utf8")) as {
      version: number;
      savedAt: string;
      source: string;
      value: unknown;
    };

  it("wraps each answer with its version, date and source", async () => {
    const root = await setup();
    await run(deps(root));
    expect(await readCache(root, "commons")).toMatchObject({
      version: CACHE_VERSION,
      savedAt: "2026-10-04",
      source: "commons",
    });
  });

  it("takes an answer cut short (continue) for a failure: older copy kept, or no build", async () => {
    const cutShort = (): PoliteClient => {
      const inner = wikimedia();
      return {
        getJson: async (url) => {
          const json = (await inner.getJson(url)) as Record<string, unknown>;
          return url.includes("prop=revisions")
            ? { ...json, continue: { rvcontinue: "123|456", continue: "||" } }
            : json;
        },
        getText: async () => "",
      };
    };
    const root = await setup();
    await run(deps(root));
    const saved = await readFile(cacheFile(root, "infobox-en"), "utf8");
    expect(
      await run(deps(root, { today: "2026-10-05", wikimedia: cutShort() })),
    ).toMatchObject({ ok: true });
    const report = await readFile(file(root, "report.md"), "utf8");
    expect(report).toContain(
      "| infobox-en | cached | 2026-10-04 | answer cut short (continue) for 1 titles |",
    );
    expect(await readFile(cacheFile(root, "infobox-en"), "utf8")).toBe(saved);

    const fresh = await setup();
    expect(await run(deps(fresh, { wikimedia: cutShort() }))).toEqual({
      ok: false,
      reason:
        "infobox-en failed and there is no cached copy (answer cut short (continue) for 1 titles)",
    });
    for (const name of ["pool.json", "ids.json", "report.md"])
      expect(await exists(file(fresh, name))).toBe(false);
  });

  it("takes a MediaWiki error body for a failure and keeps the older copy", async () => {
    const root = await setup();
    await run(deps(root));
    const inner = wikimedia();
    const site: PoliteClient = {
      getJson: async (url) =>
        url.includes("commons.wikimedia.org")
          ? { error: { code: "maxlag", info: "Waiting for a database server" } }
          : inner.getJson(url),
      getText: async () => "",
    };
    expect(
      await run(deps(root, { today: "2026-10-05", wikimedia: site })),
    ).toMatchObject({ ok: true });
    const report = await readFile(file(root, "report.md"), "utf8");
    expect(report).toContain(
      "| commons | cached | 2026-10-04 | MediaWiki error maxlag: Waiting for a database server |",
    );
    expect((await readCache(root, "commons")).savedAt).toBe("2026-10-04");
  });

  it("takes an empty answer to a non-empty request for a failure", async () => {
    const root = await setup();
    await run(deps(root));
    const empty: PoliteClient = {
      getJson: async () => ({ query: { pages: [] } }),
      getText: async () => "",
    };
    const githubEmpty: PoliteClient = {
      getJson: async () => ({}),
      getText: async (url) =>
        url.includes("goalscorers")
          ? "date,home_team,away_team,team,scorer,minute,own_goal,penalty\n"
          : csv,
    };
    const lines: string[] = [];
    expect(
      await run(
        deps(root, {
          today: "2026-10-05",
          wikimedia: empty,
          github: githubEmpty,
          log: (l) => lines.push(l),
        }),
      ),
    ).toMatchObject({ ok: true, changed: false });
    const report = await readFile(file(root, "report.md"), "utf8");
    for (const source of [
      "infobox-en",
      "redirects",
      "commons",
      "martj42-goals",
    ])
      expect(report).toContain(
        `| ${source} | cached | 2026-10-04 | empty answer`,
      );
    expect(report).toContain("| martj42 | fresh | 2026-10-05 |  |");

    // With nothing cached, an empty answer stops the run.
    const fresh = await setup();
    const none = result();
    const wd: PoliteClient = {
      getJson: async () => none,
      getText: async () => "",
    };
    expect(await run(deps(fresh, { wdqs: wd }))).toEqual({
      ok: false,
      reason:
        "wikidata failed and there is no cached copy (empty answer: no footballers)",
    });
  });

  it("ignores a copy of another cache version, and says so", async () => {
    const root = await setup();
    await run(deps(root));
    const old = await readCache(root, "infobox-en");
    await writeFile(
      cacheFile(root, "infobox-en"),
      JSON.stringify({ ...old, version: CACHE_VERSION + 1 }),
    );
    const lines: string[] = [];
    const outcome = await run(
      deps(root, {
        today: "2026-10-05",
        wikimedia: stopped("en.wikipedia.org"),
        log: (l) => lines.push(l),
      }),
    );
    expect(outcome).toMatchObject({
      ok: false,
      reason: expect.stringContaining(
        "infobox-en failed and there is no cached copy",
      ),
    });
    expect(lines).toContain(
      `infobox-en: cached copy ignored: version ${CACHE_VERSION + 1}, this build reads ${CACHE_VERSION}`,
    );
  });

  it("ignores a malformed copy instead of crashing on it or using it", async () => {
    for (const broken of [
      "not json {",
      JSON.stringify({
        version: CACHE_VERSION,
        savedAt: "2026-10-04",
        source: "commons",
        value: { not: "a list" },
      }),
    ]) {
      const root = await setup();
      await run(deps(root));
      await writeFile(cacheFile(root, "commons"), broken);
      const lines: string[] = [];
      const outcome = await run(
        deps(root, {
          today: "2026-10-05",
          wikimedia: stopped("en.wikipedia.org"),
          log: (l) => lines.push(l),
        }),
      );
      expect(outcome).toMatchObject({
        ok: false,
        reason: expect.stringContaining(
          "commons failed and there is no cached copy",
        ),
      });
      expect(
        lines.some((l) => l.startsWith("commons: cached copy ignored:")),
      ).toBe(true);
    }
  });
});

// P42 (P47): the squad lists, an extra witness fetched after Commons.
const clubSquad = `== Current squad ==
{{updated|27 September 2026}}
{{Fs start}}
{{Fs player|no=8|nat=TUN|pos=MF|name=[[Test Footballer]]}}
{{Fs player|no=9|nat=TUN|pos=FW|name=[[Unknown Kid]]}}
{{Fs end}}
`;
const nationalSquad = `===Current squad===
''Caps and goals correct as of 28 September 2026, after the match.''
{{nat fs g start}}
{{nat fs g player|no=8|pos=MF|name=[[Test Footballer]]|age={{birth date and age|1995|5|5}}|caps=30|goals=2|club=[[Club Africain]]|clubnat=TUN}}
{{nat fs end}}
===Recent call-ups===
`;
const squadAnswer = {
  query: {
    pages: [
      {
        title: "Club Africain",
        revisions: [
          {
            revid: 11,
            timestamp: "2026-09-27T10:00:00Z",
            slots: { main: { content: `Intro.\n${clubSquad}` } },
          },
        ],
      },
      {
        title: "Tunisia national football team",
        revisions: [
          {
            revid: 12,
            timestamp: "2026-10-01T10:00:00Z",
            slots: { main: { content: `Intro.\n${nationalSquad}` } },
          },
        ],
      },
    ],
  },
};
const linksAnswer = {
  query: {
    pages: [{ title: "Unknown Kid", pageprops: { wikibase_item: "Q999" } }],
  },
};

/** wikimedia(), plus the squad pages and their link lookups; `stop` answers the squads with a 429. */
function squadWikimedia(
  calls: Calls,
  stop = false,
  extraLinks = 0,
): PoliteClient {
  const base = wikimedia(calls);
  const answer = JSON.parse(JSON.stringify(squadAnswer));
  const extra = Array.from(
    { length: extraLinks },
    (_, i) => `{{Fs player|nat=TUN|pos=DF|name=[[Kid ${i}]]}}
`,
  ).join("");
  const page = answer.query.pages[0].revisions[0].slots.main;
  page.content = page.content.replace("{{Fs end}}", `${extra}{{Fs end}}`);
  return {
    async getJson(url, init) {
      const titles = new URL(url).searchParams.get("titles") ?? "";
      if (titles.includes("Tunisia national football team")) {
        calls.urls.push(url);
        if (stop) throw new StoppedError(url, 429);
        return answer;
      }
      if (url.includes("prop=pageprops")) {
        calls.urls.push(url);
        return linksAnswer;
      }
      return base.getJson(url, init);
    },
    getText: base.getText,
  };
}

/** Clients that fail any call, and the calls they got. */
function noRequests() {
  const calls: string[] = [];
  const none: PoliteClient = {
    getJson: async (url) => {
      calls.push(url);
      throw new Error("no request expected");
    },
    getText: async (url) => {
      calls.push(url);
      throw new Error("no request expected");
    },
  };
  return { calls, wdqs: none, wikimedia: none, github: none };
}

describe("the squad lists in the run (P42)", () => {
  it("MAX_REQUESTS is 70", () => {
    expect(MAX_REQUESTS).toBe(70);
  });

  it("fetches squads after Commons, so a 429 there costs no core source", async () => {
    const root = await setup();
    const calls: Calls = { urls: [], queries: [] };
    expect(
      await run(deps(root, { wikimedia: squadWikimedia(calls, true) })),
    ).toEqual({ ok: true, changed: true });
    const commons = calls.urls.findIndex((u) => u.includes("commons."));
    const squads = calls.urls.findIndex((u) =>
      u.includes("Tunisia+national+football+team"),
    );
    expect(commons).toBeGreaterThanOrEqual(0);
    expect(squads).toBeGreaterThan(commons);
    // No link lookup after the stop.
    expect(calls.urls.some((u) => u.includes("prop=pageprops"))).toBe(false);
    const report = await readFile(file(root, "report.md"), "utf8");
    for (const source of ["infobox-en", "commons", "martj42"])
      expect(report).toContain(`| ${source} | fresh | 2026-10-04 |  |`);
  });

  it("a failed squads source with no cache: the build goes on and the report says failed", async () => {
    const root = await setup();
    const lines: string[] = [];
    expect(
      await run(
        deps(root, {
          wikimedia: squadWikimedia({ urls: [], queries: [] }, true),
          log: (l) => lines.push(l),
        }),
      ),
    ).toMatchObject({ ok: true });
    const report = await readFile(file(root, "report.md"), "utf8");
    expect(report).toMatch(
      /\| squads \| failed \| never \| squads failed and there is no cached copy \(HTTP 429/,
    );
    expect(lines.join("\n")).toContain("squads: left out of this build");
    expect(await exists(path.join(root, "data", "cache", "squads.json"))).toBe(
      false,
    );
    // The pool is the pool without squads: no squad source anywhere.
    expect(JSON.stringify(await readPool(root))).not.toContain("squad");
  });

  it("plans 2 page requests plus link lookups and refuses over the budget before the first link lookup", async () => {
    const root = await setup();
    const calls: Calls = { urls: [], queries: [] };
    // 7 + (1 English + 1 Commons + 1 redirect + 2 squad pages) + 2 = 14
    // before the links (the French squad page is counted, at most one per
    // club, until the clubs answer says there is none). Exactly: 1 squad
    // page, then 52 unknown targets, 2 lookups: 15.
    const outcome = await run(
      deps(root, {
        wikimedia: squadWikimedia(calls, false, 51),
        maxRequests: 14,
      }),
    );
    expect(outcome).toEqual({
      ok: false,
      reason:
        "with 52 squad link targets to look up the run would make up to 15 requests, over the budget of 14",
    });
    expect(calls.urls.filter((u) => u.includes("prop=revisions"))).toHaveLength(
      2,
    );
    expect(calls.urls.some((u) => u.includes("prop=pageprops"))).toBe(false);
  });

  it("looks up unknown links, and the lists vote: club and caps high", async () => {
    const root = await setup();
    const calls: Calls = { urls: [], queries: [] };
    expect(
      await run(deps(root, { wikimedia: squadWikimedia(calls) })),
    ).toMatchObject({ ok: true });
    const lookups = calls.urls.filter((u) => u.includes("prop=pageprops"));
    expect(lookups.map((u) => new URL(u).searchParams.get("titles"))).toEqual([
      "Unknown Kid",
    ]);
    const player = (await readPool(root)).players[0];
    expect(player.provenance.clubId).toMatchObject({
      confidence: "high",
      agreeing: ["enwiki", "enwiki-squad", "enwiki-national"],
    });
    expect(player.provenance.caps).toMatchObject({
      source: "enwiki",
      confidence: "high",
      agreeing: ["enwiki", "enwiki-national"],
    });
  });

  it("offline: squads and squad-links come from data/cache with their dates", async () => {
    const root = await setup();
    await run(
      deps(root, { wikimedia: squadWikimedia({ urls: [], queries: [] }) }),
    );
    const pool = await readFile(file(root, "pool.json"), "utf8");
    const clients = noRequests();
    expect(
      await run({
        root,
        today: "2026-10-05",
        offline: true,
        ...clients,
        log: () => {},
      }),
    ).toEqual({ ok: true, changed: false });
    expect(clients.calls).toEqual([]);
    expect(await readFile(file(root, "pool.json"), "utf8")).toBe(pool);
    const report = await readFile(file(root, "report.md"), "utf8");
    expect(report).toContain(
      "| squads | cached | 2026-10-04 | offline build |",
    );
    expect(report).toContain(
      "| squad-links | cached | 2026-10-04 | offline build |",
    );
  });

  it("the cache keeps the answers as sent, and a parser change needs no request", async () => {
    const root = await setup();
    await run(
      deps(root, { wikimedia: squadWikimedia({ urls: [], queries: [] }) }),
    );
    const cache = path.join(root, "data", "cache", "squads.json");
    const entry = JSON.parse(await readFile(cache, "utf8"));
    expect(entry).toMatchObject({
      version: CACHE_VERSION,
      savedAt: "2026-10-04",
      source: "squads",
    });
    // Whole pages, as sent: the intro before the list is kept.
    expect(entry.value.en[0].pages[0].revisions[0].slots.main.content).toBe(
      `Intro.\n${clubSquad}`,
    );
    expect(entry.value.fr).toEqual([]);
    const links = JSON.parse(
      await readFile(
        path.join(root, "data", "cache", "squad-links.json"),
        "utf8",
      ),
    );
    expect(links.value.en).toEqual([linksAnswer.query]);
    // As if the table now said 31 on 2 October: the parser reads the cached
    // page again, and the table is now the newest source.
    const main = entry.value.en[0].pages[1].revisions[0].slots.main;
    main.content = main.content
      .replace("caps=30", "caps=31")
      .replace("28 September 2026", "2 October 2026");
    await writeFile(cache, JSON.stringify(entry));
    const clients = noRequests();
    await run({
      root,
      today: "2026-10-04",
      offline: true,
      ...clients,
      log: () => {},
    });
    expect(clients.calls).toEqual([]);
    const player = (await readPool(root)).players[0];
    expect(player.caps).toBe(31);
    expect(player.provenance.caps?.source).toBe("enwiki-national");
  });

  it("without a squads cache an offline rebuild gives the pool of a build without squads, byte for byte", async () => {
    const root = await setup();
    // An online build whose squads fail: the pool without squads.
    await run(
      deps(root, {
        wikimedia: squadWikimedia({ urls: [], queries: [] }, true),
      }),
    );
    const pool = await readFile(file(root, "pool.json"), "utf8");
    const lines: string[] = [];
    expect(
      await run({
        root,
        today: "2026-10-04",
        offline: true,
        ...noRequests(),
        log: (l) => lines.push(l),
      }),
    ).toEqual({ ok: true, changed: false });
    expect(await readFile(file(root, "pool.json"), "utf8")).toBe(pool);
    expect(lines).toContain("squads: offline build; no cached copy");
  });
});

describe("the private witness's verdicts in the run (P48, B7)", () => {
  it("reads data/witness.json with no request; a broken file refuses like overrides", async () => {
    const root = await setup();
    await writeFile(
      file(root, "witness.json"),
      JSON.stringify({
        version: 1,
        checks: { Q1001: { caps: { site: "x" } } },
      }),
    );
    const calls: Calls = { urls: [], queries: [] };
    const lines: string[] = [];
    const outcome = await run(
      deps(root, {
        wdqs: wdqs(calls),
        wikimedia: wikimedia(calls),
        log: (l) => lines.push(l),
      }),
    );
    expect(outcome).toEqual({
      ok: false,
      reason: "data/witness.json has 4 errors",
    });
    expect(calls.urls).toEqual([]);
    expect(lines).toContain(
      "data/witness.json: checks.Q1001.caps: unknown site x",
    );

    // A good file: an agreeing verdict on the club we publish is one more source.
    await writeFile(
      file(root, "witness.json"),
      JSON.stringify({
        version: 1,
        checks: {
          Q1001: {
            clubId: {
              site: "transfermarkt",
              checkedOn: "2026-10-01",
              verdict: "agrees",
              checked: "Q2001",
            },
          },
        },
      }),
    );
    expect(await run(deps(root))).toMatchObject({ ok: true });
    const player = (await readPool(root)).players[0];
    expect(player.provenance.clubId?.agreeing).toEqual([
      "enwiki",
      "transfermarkt",
    ]);
    const report = await readFile(file(root, "report.md"), "utf8");
    expect(report).toContain("| clubId | transfermarkt | 1 | 0 | 0 | 0 |");
  });
});

describe("planRequests", () => {
  it("counts batches of 50 per site, and redirects once they are known", () => {
    // en 3 + fr 2 + Commons 1.
    expect(planRequests({ en: 120, fr: 51, files: 50 })).toEqual({
      wdqs: 7,
      wikimedia: 6,
      github: 2,
      total: 15,
    });
  });

  it("passes the probe's likely sizes, with a handful of redirect lookups", () => {
    const before = planRequests({ en: 550, fr: 650, files: 350 });
    expect(before).toEqual({ wdqs: 7, wikimedia: 31, github: 2, total: 40 });
    const after = planRequests({
      en: 550,
      fr: 650,
      files: 350,
      redirects: { en: 120, fr: 140 },
    });
    expect(after).toEqual({ wdqs: 7, wikimedia: 37, github: 2, total: 46 });
    expect(after.total).toBeLessThanOrEqual(MAX_REQUESTS);
  });
});

describe("createClients", () => {
  it("counts every HTTP attempt, a retry after a 503 included", async () => {
    let n = 0;
    const clients = createClients({
      fetch: async () => new Response("{}", { status: n++ === 0 ? 503 : 200 }),
      sleep: async () => {},
    });
    await clients.wikimedia.getJson("https://en.wikipedia.org/w/api.php");
    expect(clients.attempts()).toEqual({ wdqs: 0, wikimedia: 2, github: 0 });
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

describe("the raw cache and offline builds", () => {
  const cachePath = (root: string, name: string) =>
    path.join(root, "data", "cache", `${name}.json`);
  const entry = async (root: string, name: string) =>
    JSON.parse(await readFile(cachePath(root, name), "utf8")) as {
      version: number;
      savedAt: string;
      source: string;
      value: Record<string, unknown> & unknown[];
    };
  /** Clients that record every call; offline builds must leave them at zero. */
  const recording = () => {
    const calls: string[] = [];
    const client = (name: string): PoliteClient => ({
      getJson: async (url) => {
        calls.push(`${name} ${url}`);
        throw new Error("no request expected");
      },
      getText: async (url) => {
        calls.push(`${name} ${url}`);
        throw new Error("no request expected");
      },
    });
    return {
      calls,
      wdqs: client("wdqs"),
      wikimedia: client("wikimedia"),
      github: client("github"),
    };
  };

  it("keeps what the servers sent: wikitext, SPARQL results, Commons pages, CSV rows", async () => {
    const root = await setup();
    await run(deps(root));
    const en = await entry(root, "infobox-en");
    expect(en.version).toBe(CACHE_VERSION);
    // Final wave, B8: each batch's pages, normalized titles and redirects as
    // sent (only the content is cut to section 0), parsed on every read.
    expect(en.value.batches).toEqual([
      {
        pages: [
          {
            title: "Test Footballer",
            revisions: [
              {
                revid: 1,
                slots: {
                  main: {
                    content: expect.stringContaining(
                      "{{Infobox football biography",
                    ),
                  },
                },
              },
            ],
          },
        ],
      },
    ]);
    expect((await entry(root, "redirects")).value).toEqual({
      en: [{ pages: [{ title: "Club Africain" }] }],
      fr: [],
    });
    // No parsed infobox in the cache: the parser runs again on every build.
    expect(await readFile(cachePath(root, "infobox-en"), "utf8")).not.toContain(
      '"spells"',
    );
    const wd = await entry(root, "wikidata");
    expect(Object.keys(wd.value).sort()).toEqual([
      "aliases",
      "honours",
      "memberships",
      "players",
    ]);
    expect(wd.value.players).toEqual(answers.players);
    expect((await entry(root, "commons")).value[0]).toMatchObject({
      title: "File:Test.jpg",
      imageinfo: [
        { extmetadata: { LicenseShortName: { value: "CC BY-SA 4.0" } } },
      ],
    });
    expect((await entry(root, "martj42")).value).toBe(csv);
    expect((await entry(root, "martj42-goals")).value).toBe(goalsCsv);
  });

  it("keeps only section 0 of an article: the infobox, not the body", () => {
    expect(
      sectionZero("{{Infobox x}}\nLead.\n== Career ==\nBody\n=== Club ===\n"),
    ).toBe("{{Infobox x}}\nLead.\n");
    expect(sectionZero("{{Infobox x}}\nno heading")).toBe(
      "{{Infobox x}}\nno heading",
    );
  });

  it("rebuilds offline, with no request, the same pool and registry", async () => {
    const root = await setup();
    await run(deps(root));
    const pool = await readFile(file(root, "pool.json"), "utf8");
    const ids = await readFile(file(root, "ids.json"), "utf8");
    const clients = recording();
    const lines: string[] = [];
    expect(
      await run({
        root,
        today: "2026-10-04",
        offline: true,
        ...clients,
        log: (l) => lines.push(l),
      }),
    ).toEqual({ ok: true, changed: false });
    expect(clients.calls).toEqual([]);
    expect(await readFile(file(root, "pool.json"), "utf8")).toBe(pool);
    expect(await readFile(file(root, "ids.json"), "utf8")).toBe(ids);
    const report = await readFile(file(root, "report.md"), "utf8");
    expect(report).toContain(
      "| infobox-en | cached | 2026-10-04 | offline build |",
    );
    expect(report).toContain(
      "| wikidata | cached | 2026-10-04 | offline build |",
    );
    expect(lines.join("\n")).not.toContain("plan:");
  });

  // Final wave, B1 and B2: an offline rebuild is the pool of its cache's
  // date, whatever day it runs, and its report says no source was read.
  it("dates an offline rebuild by its newest cached copy, and says it read no source", async () => {
    const root = await setup();
    await run(deps(root));
    const pool = await readFile(file(root, "pool.json"), "utf8");
    const lines: string[] = [];
    expect(
      await run({
        root,
        today: "2027-01-15",
        offline: true,
        ...recording(),
        log: (l) => lines.push(l),
      }),
    ).toEqual({ ok: true, changed: false });
    expect(await readFile(file(root, "pool.json"), "utf8")).toBe(pool);
    const report = await readFile(file(root, "report.md"), "utf8");
    expect(report.split("\n").slice(0, 3)).toEqual([
      "# Nightly pool, 2026-10-04",
      "",
      "> Offline rebuild from the cache saved on 2026-10-04; no source was read.",
    ]);
    expect(lines).toContain(
      "offline build dated 2026-10-04, its newest cached copy",
    );
  });

  it("parses the cached answer again, so a parser change shows without a request", async () => {
    const root = await setup();
    await run(deps(root));
    // As if the parser now read 31 where it read 30: change what it reads.
    const en = await entry(root, "infobox-en");
    const batches = en.value.batches as {
      pages: { revisions: { slots: { main: { content: string } } }[] }[];
    }[];
    const main = batches[0].pages[0].revisions[0].slots.main;
    main.content = main.content.replace(
      "nationalcaps1 = 30",
      "nationalcaps1 = 31",
    );
    await writeFile(cachePath(root, "infobox-en"), JSON.stringify(en));
    const clients = recording();
    await run({
      root,
      today: "2026-10-04",
      offline: true,
      ...clients,
      log: () => {},
    });
    expect((await readPool(root)).players[0].caps).toBe(31);
    expect(clients.calls).toEqual([]);
  });

  it("refuses offline when a source has no usable copy, writing nothing", async () => {
    const root = await setup();
    const outcome = await run({
      root,
      today: "2026-10-04",
      offline: true,
      log: () => {},
    });
    expect(outcome).toEqual({
      ok: false,
      reason: "wikidata has no usable cached copy (offline build)",
    });
    expect(await exists(file(root, "pool.json"))).toBe(false);
  });

  it("takes a cache of the old, parsed shape (version 1) for no cache", async () => {
    const root = await setup();
    await mkdir(path.join(root, "data", "cache"), { recursive: true });
    await writeFile(
      cachePath(root, "wikidata"),
      JSON.stringify({
        version: 1,
        savedAt: "2026-10-04",
        source: "wikidata",
        value: {
          players: [],
          aliases: [],
          memberships: [],
          honours: [],
          honoursReading: {},
        },
      }),
    );
    const lines: string[] = [];
    const outcome = await run({
      root,
      today: "2026-10-04",
      offline: true,
      log: (l) => lines.push(l),
    });
    expect(outcome).toMatchObject({ ok: false });
    expect(lines).toContain(
      `wikidata: cached copy ignored: version 1, this build reads ${CACHE_VERSION}`,
    );
    expect(CACHE_VERSION).toBeGreaterThan(1);
  });

  it("runs offline from the CLI without reaching fetch", async () => {
    const root = await setup();
    await run(deps(root));
    const here = path.join(process.cwd(), "src", "pipeline");
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        "--import",
        pathToFileURL(path.join(here, "no-network.ts")).href,
        path.join(here, "cli.ts"),
        "build",
        "--offline",
      ],
      { cwd: root },
    );
    expect(stdout).toContain("offline build: every source from data/cache/");
    expect(stdout).not.toContain(NO_NETWORK);
    expect(stdout).toMatch(/data:build: (no change|the pool changed)/);
  }, 30_000);
});

describe("fame from page views in the run (D-S2-4)", () => {
  const views = (lang: string) =>
    JSON.parse(
      readFileSync(
        path.join(
          import.meta.dirname,
          "__fixtures__",
          `pageviews-${lang}.json`,
        ),
        "utf8",
      ),
    ) as unknown;
  /** Wikimedia, plus the Pageviews API answering from the fixtures. */
  function withViews(calls: Calls = { urls: [], queries: [] }): PoliteClient {
    const base = wikimedia(calls);
    return {
      async getJson(url, init) {
        if (url.startsWith("https://wikimedia.org/api/rest_v1/")) {
          calls.urls.push(url);
          return views(url.includes("/fr.wikipedia/") ? "fr" : "en");
        }
        return base.getJson(url, init);
      },
      getText: base.getText,
    };
  }

  it("the build with recorded fixtures writes fame for active footballers", async () => {
    const root = await setup();
    const calls: Calls = { urls: [], queries: [] };
    expect(await run(deps(root, { wikimedia: withViews(calls) }))).toEqual({
      ok: true,
      changed: true,
    });
    const pool = await readPool(root);
    // The test footballer has an English article only.
    expect(pool.players[0].fame).toEqual({
      score: 5.41,
      tier: "A",
      views: { en: 258284, fr: 0, ar: 0 },
      window: "202510-202609",
      localStar: false,
    });
    expect(calls.urls.filter((u) => u.includes("/metrics/pageviews/"))).toEqual(
      [
        "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/user/Test_Footballer/monthly/2025100100/2026090100",
      ],
    );
    const report = await readFile(file(root, "report.md"), "utf8");
    expect(report).toContain(
      "| pageviews | fresh | 2026-10-04 | 1 of 1 articles read; 0 active footballers not measured yet |",
    );
    const cached = JSON.parse(
      await readFile(file(root, "cache/pageviews.json"), "utf8"),
    );
    expect(cached.value).toEqual({
      "202510-202609": { "en:Test Footballer": 258284 },
    });
  });

  it("asks nothing again within the same window", async () => {
    const root = await setup();
    await run(deps(root, { wikimedia: withViews() }));
    const calls: Calls = { urls: [], queries: [] };
    await run(deps(root, { wikimedia: withViews(calls) }));
    expect(calls.urls.some((u) => u.includes("/metrics/pageviews/"))).toBe(
      false,
    );
    expect((await readPool(root)).players[0].fame?.tier).toBe("A");
  });

  it("a local star tag in the overrides adds 0.5", async () => {
    const root = await setup({
      players: {
        Q1001: { localStar: { value: true, by: "jalel", at: "2026-10-05" } },
      },
      clubTitles: {},
    });
    await run(deps(root, { wikimedia: withViews() }));
    expect((await readPool(root)).players[0].fame).toMatchObject({
      score: 5.91,
      tier: "A",
      localStar: true,
    });
  });

  it("fame is null for legends only", async () => {
    const root = await setup({
      players: {
        Q1001: {
          pools: {
            value: { active: false, legend: true },
            by: "jalel",
            at: "2026-10-04",
          },
        },
      },
      clubTitles: {},
    });
    const calls: Calls = { urls: [], queries: [] };
    expect(
      await run(deps(root, { wikimedia: withViews(calls) })),
    ).toMatchObject({ ok: true });
    expect((await readPool(root)).players[0].fame).toBeNull();
    expect(calls.urls.some((u) => u.includes("/metrics/pageviews/"))).toBe(
      false,
    );
  });

  it("never goes over the budget: with no room left, nothing is measured", async () => {
    const root = await setup();
    const calls: Calls = { urls: [], queries: [] };
    const lines: string[] = [];
    // 14 requests planned with the redirects (see above): none left.
    expect(
      await run(
        deps(root, {
          wikimedia: withViews(calls),
          maxRequests: 14,
          log: (l) => lines.push(l),
        }),
      ),
    ).toMatchObject({ ok: true });
    expect(calls.urls.some((u) => u.includes("/metrics/pageviews/"))).toBe(
      false,
    );
    expect(lines).toContain(
      "pageviews: 0 articles this run, 0 requests left in the budget of 14",
    );
    expect((await readPool(root)).players[0].fame).toMatchObject({
      score: null,
      tier: null,
    });
  });

  it("a failed fetch keeps the previous pool's fame, and the report says so", async () => {
    const root = await setup();
    await run(deps(root, { wikimedia: withViews() }));
    // A new window, and the Pageviews API now fails (wikimedia() answers a
    // MediaWiki body, which has no items).
    await rm(file(root, "cache"), { recursive: true, force: true });
    expect(
      await run(deps(root, { today: "2026-11-02", wikimedia: wikimedia() })),
    ).toMatchObject({ ok: true });
    expect((await readPool(root)).players[0].fame).toMatchObject({
      tier: "A",
      window: "202510-202609",
    });
    const report = await readFile(file(root, "report.md"), "utf8");
    expect(report).toMatch(
      /\| pageviews \| failed \| never \| 0 of 1 articles read \(then: no items in the page views\)/,
    );
  });

  it("offline, page views come from the cache with no request", async () => {
    const root = await setup();
    await run(deps(root, { wikimedia: withViews() }));
    const lines: string[] = [];
    expect(
      await run({
        root,
        today: "2026-10-04",
        offline: true,
        log: (l) => lines.push(l),
      }),
    ).toMatchObject({ ok: true });
    expect((await readPool(root)).players[0].fame?.score).toBe(5.41);
    const report = await readFile(file(root, "report.md"), "utf8");
    expect(report).toContain("| pageviews | cached | 2026-10-04 |");
  });
});
