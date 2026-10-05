import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSiteClient } from "./client.ts";
import type { SiteClient } from "./client.ts";
import type { Pool } from "../types.ts";
import { parseMapping } from "./mapping.ts";
import { playerPath, runBackfill, runSample, runWeekly } from "./run.ts";
import type { CheckInput } from "./run.ts";
import { parseLeague } from "./transfermarkt.ts";
import { emptyWitness, mergeChecks, validateWitness } from "./verdicts.ts";
import type { WitnessFile } from "./verdicts.ts";
import { openStore } from "./store.ts";

const fixture = (name: string) =>
  readFile(path.join(import.meta.dirname, "__fixtures__", name), "utf8");

/** A site client on a fake host and a fake clock; `pages` maps a path to its body or status. */
function fakeSite(
  host: string,
  pages: Record<string, string | number>,
  over: { gapMs?: number; maxRequests?: number } = {},
) {
  let time = 0;
  const asked: { path: string; at: number }[] = [];
  const client: SiteClient = createSiteClient({
    host,
    gapMs: over.gapMs ?? 30_000,
    maxRequests: over.maxRequests ?? 40,
    userAgent: "KoraWitness/0.1 (test)",
    now: () => time,
    sleep: async (ms) => {
      time += ms;
    },
    fetch: async (url) => {
      const p = new URL(url).pathname;
      asked.push({ path: p, at: time });
      const page = pages[p];
      if (page === undefined) return new Response("", { status: 404 });
      return typeof page === "number"
        ? new Response("", { status: page })
        : new Response(page);
    },
  });
  return { client, asked, minutes: () => time / 60_000 };
}

async function tempStore() {
  return openStore({
    env: { KORA_WITNESS_DIR: await mkdtemp(path.join(tmpdir(), "kora-w-")) },
    home: await mkdtemp(path.join(tmpdir(), "kora-home-")),
    repoRoot: await mkdtemp(path.join(tmpdir(), "kora-repo-")),
  });
}

describe("the sample run (B5)", () => {
  it("asks six pages, saves each to the private folder only, and makes no verdict", async () => {
    const store = await tempStore();
    const tm = fakeSite("www.transfermarkt.com", {
      "/robots.txt": "User-agent: *\nAllow: /\n",
      "/club-africain-tunis/kader/verein/819/saison_id/2026":
        await fixture("tm-squad.html"),
      "/ali-invente/profil/spieler/700001": await fixture("tm-profile.html"),
    });
    const nft = fakeSite(
      "www.national-football-teams.com",
      {
        "/robots.txt": "User-agent: *\nCrawl-delay: 60\n",
        "/country/190/2026/Tunisia.html": await fixture("nft-country.html"),
        "/player/800001/Ali_Invente.html": await fixture("nft-player.html"),
      },
      { gapMs: 60_000 },
    );
    const lines: string[] = [];
    const out = await runSample({
      sites: {
        transfermarkt: tm.client,
        "national-football-teams": nft.client,
      },
      store,
      log: (l) => lines.push(l),
      today: "2026-10-05",
    });
    expect(tm.asked.map((a) => a.path)).toEqual([
      "/robots.txt",
      "/club-africain-tunis/kader/verein/819/saison_id/2026",
      "/ali-invente/profil/spieler/700001",
    ]);
    expect(nft.asked.map((a) => a.path)).toEqual([
      "/robots.txt",
      "/country/190/2026/Tunisia.html",
      "/player/800001/Ali_Invente.html",
    ]);
    expect(out.stopped).toEqual({});
    expect(
      (await readdir(path.join(store.dir, "pages", "transfermarkt"))).sort(),
    ).toEqual([
      "sample-profile.html",
      "sample-robots.txt",
      "sample-squad.html",
    ]);
    expect(
      (
        await readdir(path.join(store.dir, "pages", "national-football-teams"))
      ).sort(),
    ).toEqual([
      "sample-country.html",
      "sample-player.html",
      "sample-robots.txt",
    ]);
    // No verdict file anywhere, and the log names no value of theirs.
    expect(await readdir(store.dir)).toEqual(["pages"]);
    expect(lines.join("\n")).not.toMatch(/Inventé|Exemple|Invented FC/);
    expect(lines).toContain(
      "national-football-teams: robots.txt Crawl-delay 60 (expected 60)",
    );
  });

  it("a refusal stops that site; the other site goes on", async () => {
    const store = await tempStore();
    const tm = fakeSite("www.transfermarkt.com", {
      "/robots.txt": "",
      "/club-africain-tunis/kader/verein/819/saison_id/2026": 403,
    });
    const nft = fakeSite("www.national-football-teams.com", {
      "/robots.txt": "",
      "/country/190/2026/Tunisia.html": await fixture("nft-country.html"),
      "/player/800001/Ali_Invente.html": await fixture("nft-player.html"),
    });
    const out = await runSample({
      sites: {
        transfermarkt: tm.client,
        "national-football-teams": nft.client,
      },
      store,
      log: () => {},
      today: "2026-10-05",
    });
    expect(out.stopped.transfermarkt).toMatch(/HTTP 403/);
    expect(tm.asked).toHaveLength(2);
    expect(nft.asked).toHaveLength(3);
  });
});

// B8: weekly runs and the backfill, on fake hosts and a fake clock.
const uri = (q: string) => ({
  type: "uri",
  value: `http://www.wikidata.org/entity/${q}`,
});
const lit = (value: string) => ({ type: "literal", value });
const mapping = parseMapping({
  results: {
    bindings: [
      { item: uri("Q1"), tm: lit("700001"), nft: lit("800001") },
      { item: uri("Q2"), tm: lit("700002"), nft: lit("800002") },
      { item: uri("Q3"), nft: lit("800003") },
      { item: uri("Q900"), tmClub: lit("90001") },
    ],
  },
});
const poolPlayer = (
  qid: string,
  fields: Partial<Pool["players"][number]>,
): Pool["players"][number] => ({
  id: qid.toLowerCase(),
  wikidataId: qid,
  nameLatin: `Player ${qid}`,
  nameArabic: null,
  nameFrench: null,
  aliases: [],
  position: "defender",
  positionDetail: null,
  birthDate: "1995-01-01",
  birthPlace: null,
  birthCountry: "TN",
  governorate: null,
  clubId: null,
  caps: 0,
  goals: 0,
  capsAsOf: null,
  history: [],
  photo: null,
  wiki: { en: null, fr: null, ar: null },
  pools: { active: true, legend: false },
  provenance: {},
  ...fields,
});
const pool: Pool = {
  version: 1,
  players: [
    poolPlayer("Q1", { clubId: "our-club", caps: 21, capsAsOf: "2026-09-28" }),
    poolPlayer("Q2", {
      caps: 5,
      provenance: {
        caps: {
          source: "enwiki",
          retrievedAt: "2026-10-05",
          confidence: "high",
        },
      },
    }),
    poolPlayer("Q3", {
      caps: 2,
      provenance: {
        caps: {
          source: "enwiki",
          retrievedAt: "2026-10-05",
          confidence: "low",
        },
      },
    }),
  ],
  clubs: [
    {
      id: "our-club",
      wikidataId: "Q900",
      nameLatin: "Our Club",
      nameArabic: null,
      nameFrench: null,
      country: "TN",
      confederation: "CAF",
      leagueWikidataId: null,
      ligue1: true,
    },
  ],
  honours: [],
  flags: [],
  dropped: [],
};

async function tmPages(): Promise<Record<string, string | number>> {
  const league = await fixture("tm-league.html");
  const pages: Record<string, string | number> = {
    "/robots.txt": "User-agent: *\nAllow: /\n",
    "/ligue-professionnelle-1/startseite/wettbewerb/TUN1/saison_id/2026":
      league,
  };
  for (const club of parseLeague(league))
    pages[club.squadPath.split("?")[0]] =
      club.id === "90001"
        ? await fixture("tm-squad.html")
        : '<table class="items"><tbody></tbody></table>';
  return pages;
}

async function nftPages(): Promise<Record<string, string | number>> {
  return {
    "/robots.txt": "User-agent: *\nCrawl-delay: 60\n",
    "/country/190/2026/Tunisia.html": await fixture("nft-country.html"),
    "/player/800001/Ali_Invente.html": await fixture("nft-player.html"),
    "/player/800002/Sami_Exemple.html": await fixture("nft-player.html"),
  };
}

function checkInput(
  store: Awaited<ReturnType<typeof tempStore>>,
  sites: CheckInput["sites"],
  over: Partial<CheckInput> = {},
) {
  const written: string[] = [];
  const lines: string[] = [];
  const input: CheckInput = {
    sites,
    store,
    log: (l) => lines.push(l),
    today: "2026-10-05",
    pool,
    mapping,
    witness: emptyWitness(),
    writeWitness: async (text) => {
      written.push(text);
    },
    ...over,
  };
  return { input, written, lines };
}

describe("the weekly run (B8)", () => {
  it("weekly: Transfermarkt league plus 16 squads (18 requests with robots.txt), national-football-teams country page plus the player pages whose this-year matches changed since the last check", async () => {
    const store = await tempStore();
    // Ali's page was read last week, with the 7 matches the country page
    // still shows: not asked again. Sami's was never read.
    await store.writeState({
      version: 1,
      nft: {
        "800001": { careerFifa: 21, yearMatches: 7, readOn: "2026-09-28" },
      },
      backfill: { done: {} },
    });
    const tm = fakeSite("www.transfermarkt.com", await tmPages());
    const nft = fakeSite("www.national-football-teams.com", await nftPages(), {
      gapMs: 60_000,
    });
    const { input, written, lines } = checkInput(store, {
      transfermarkt: tm.client,
      "national-football-teams": nft.client,
    });
    const result = await runWeekly(input);
    expect(tm.asked).toHaveLength(18);
    expect(tm.minutes()).toBe(8.5); // 17 gaps of 30 s: about 9 min
    expect(nft.asked.map((a) => a.path)).toEqual([
      "/robots.txt",
      "/country/190/2026/Tunisia.html",
      "/player/800002/Sami_Exemple.html",
    ]);
    expect(nft.minutes()).toBe(2);
    expect(lines).toContain(
      "transfermarkt: 1 verdicts (1 agree, 0 differ, 0 not found, 0 not comparable); 1 footballers without an id, 1 not judged",
    );
    expect(result.stopped).toEqual({});
    const file = JSON.parse(written[0]) as WitnessFile;
    expect(file.checks.Q1).toEqual({
      clubId: {
        site: "transfermarkt",
        checkedOn: "2026-10-05",
        verdict: "agrees",
        checked: "Q900",
      },
      caps: {
        site: "national-football-teams",
        checkedOn: "2026-10-05",
        verdict: "agrees",
        checked: 21,
      },
    });
    // Sami: listed by a Ligue 1 page while we give him no club, but his row
    // is marked as a loan: no club verdict. His page says another count and
    // we have no date for ours.
    expect(file.checks.Q2.clubId).toBeUndefined();
    expect(file.checks.Q2.caps).toMatchObject({
      verdict: "differs",
      reason: "older",
      checked: 5,
    });
    // Q3's page was never read: no caps verdict.
    expect(file.checks.Q3).toBeUndefined();
    expect((await store.readState()).nft["800002"]).toEqual({
      careerFifa: 21,
      yearMatches: 3,
      readOn: "2026-10-05",
    });
    expect(lines.at(-1)).toBe(
      "data/witness.json updated. To publish the verdicts: review it, then commit data/witness.json alone in a small pull request (this command never runs git).",
    );
  });

  it("the first refusal stops that site for the run; the other site goes on", async () => {
    const store = await tempStore();
    const pages = await tmPages();
    pages[
      "/ligue-professionnelle-1/startseite/wettbewerb/TUN1/saison_id/2026"
    ] = 429;
    const tm = fakeSite("www.transfermarkt.com", pages);
    const nft = fakeSite("www.national-football-teams.com", await nftPages());
    const { input, written } = checkInput(store, {
      transfermarkt: tm.client,
      "national-football-teams": nft.client,
    });
    const result = await runWeekly(input);
    expect(result.stopped.transfermarkt).toMatch(/HTTP 429/);
    expect(tm.asked).toHaveLength(2);
    expect(nft.asked).toHaveLength(4);
    const file = JSON.parse(written[0]) as WitnessFile;
    expect(file.checks.Q1.clubId).toBeUndefined();
    expect(file.checks.Q1.caps?.verdict).toBe("agrees");
  });

  it("the run ends by writing data/witness.json and printing what to commit", async () => {
    const store = await tempStore();
    const old = mergeChecks(emptyWitness(), [
      {
        qid: "Q9",
        field: "caps",
        check: {
          site: "national-football-teams",
          checkedOn: "2026-09-28",
          verdict: "agrees",
          checked: 4,
        },
      },
    ]);
    const nft = fakeSite("www.national-football-teams.com", await nftPages());
    const { input, written, lines } = checkInput(
      store,
      { "national-football-teams": nft.client },
      { witness: old },
    );
    await runWeekly(input);
    const file = JSON.parse(written[0]) as WitnessFile;
    // Earlier verdicts stay; the new ones join them.
    expect(Object.keys(file.checks).sort()).toEqual(["Q1", "Q2", "Q9"]);
    expect(validateWitness(file)).toEqual([]);
    expect(lines.join("\n")).toContain(
      "commit data/witness.json alone in a small pull request",
    );
    expect(lines.join("\n")).not.toMatch(/Inventé|Invented FC|Exemple/);
  });
});

describe("the backfill (B8)", () => {
  it("--backfill N fetches the next N not-done player pages, low-confidence caps first, 60 s apart", async () => {
    const store = await tempStore();
    await store.writeState({
      version: 1,
      nft: {},
      backfill: { done: { "800001": "2026-09-28" } },
    });
    const nft = fakeSite(
      "www.national-football-teams.com",
      {
        "/robots.txt": "User-agent: *\nCrawl-delay: 60\n",
        [playerPath("800003", "Player Q3")]: await fixture("nft-player.html"),
        [playerPath("800002", "Player Q2")]: await fixture("nft-player.html"),
      },
      { gapMs: 60_000 },
    );
    const { input, written } = checkInput(store, {
      "national-football-teams": nft.client,
    });
    await runBackfill({ ...input, pages: 2 });
    expect(nft.asked.map((a) => [a.path, a.at / 1000])).toEqual([
      ["/robots.txt", 0],
      ["/player/800003/Player_Q3.html", 60], // low-confidence caps first
      ["/player/800002/Player_Q2.html", 120],
    ]);
    const state = await store.readState();
    expect(state.backfill.done).toEqual({
      "800001": "2026-09-28",
      "800002": "2026-10-05",
      "800003": "2026-10-05",
    });
    expect(state.nft["800003"]).toEqual({
      careerFifa: 21,
      readOn: "2026-10-05",
    });
    // No verdict: the next weekly run makes them, with the latest match.
    expect(written).toEqual([]);
  });

  it("Ctrl+C after a page keeps it and the state", async () => {
    const store = await tempStore();
    await store.writeState({
      version: 1,
      nft: {},
      backfill: { done: { "800001": "2026-09-28" } },
    });
    const controller = new AbortController();
    const inner = fakeSite("www.national-football-teams.com", {
      "/robots.txt": "",
      [playerPath("800003", "Player Q3")]: await fixture("nft-player.html"),
      [playerPath("800002", "Player Q2")]: await fixture("nft-player.html"),
    });
    // Ctrl+C arrives while the first player page is on its way.
    const client = {
      ...inner.client,
      async get(path: string) {
        const page = await inner.client.get(path);
        if (path.startsWith("/player/")) controller.abort();
        return page;
      },
    };
    const { input, lines } = checkInput(
      store,
      { "national-football-teams": client },
      { signal: controller.signal },
    );
    const result = await runBackfill({ ...input, pages: 2 });
    expect(inner.asked.map((a) => a.path)).toEqual([
      "/robots.txt",
      "/player/800003/Player_Q3.html",
    ]);
    expect(result.stopped["national-football-teams"]).toBe("interrupted");
    expect((await store.readState()).backfill.done).toEqual({
      "800001": "2026-09-28",
      "800003": "2026-10-05",
    });
    expect(
      await readdir(path.join(store.dir, "pages", "national-football-teams")),
    ).toEqual(["player-800003.html"]);
    expect(lines).toContain(
      "national-football-teams: interrupted; what arrived is kept",
    );
  });
});

describe("unmapped and mismatched clubs in the weekly run (fix round 1)", () => {
  it("lists the clubs it cannot tie and counts their footballers left unjudged", async () => {
    const store = await tempStore();
    const tm = fakeSite("www.transfermarkt.com", await tmPages());
    const unmapped = parseMapping({
      results: {
        bindings: [{ item: uri("Q1"), tm: lit("700001") }],
      },
    });
    const { input, lines, written } = checkInput(
      store,
      { transfermarkt: tm.client },
      { mapping: unmapped },
    );
    await runWeekly(input);
    expect(lines).toContain(
      "transfermarkt: no Transfermarkt id on Wikidata for Our Club: 1 footballers left unjudged",
    );
    expect(written).toEqual([]);
    const mismatch = parseMapping({
      results: {
        bindings: [
          { item: uri("Q1"), tm: lit("700001") },
          { item: uri("Q900"), tmClub: lit("12345") },
        ],
      },
    });
    const second = checkInput(
      store,
      {
        transfermarkt: fakeSite("www.transfermarkt.com", await tmPages())
          .client,
      },
      { mapping: mismatch },
    );
    await runWeekly(second.input);
    expect(second.lines).toContain(
      "transfermarkt: Wikidata's id is not a club of the league page for Our Club (mismatch): 1 footballers left unjudged",
    );
  });
});
