import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSiteClient } from "./client.ts";
import type { SiteClient } from "./client.ts";
import { runSample } from "./run.ts";
import { openStore } from "./store.ts";

const fixture = (name: string) =>
  readFile(path.join(import.meta.dirname, "__fixtures__", name), "utf8");

/** A site client on a fake host and a fake clock; `pages` maps a path to its body or status. */
export function fakeSite(
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

export async function tempStore() {
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
