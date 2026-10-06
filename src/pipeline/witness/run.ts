import { SiteRefusal, SiteStopped } from "./client.ts";
import type { SiteClient } from "./client.ts";
import { plainLatin } from "../places.ts";
import type { Pool } from "../types.ts";
import type { Mapping } from "./mapping.ts";
import { latestFifaMatch, parseCountryPage, parsePlayerPage } from "./nft.ts";
import type { NftCountryPage } from "./nft.ts";
import {
  nftCountryPath,
  SAMPLE_PAGES,
  SITES,
  TM_LEAGUE_PATH,
  TM_SAMPLE_SQUAD_PATH,
} from "./plan.ts";
import type { SiteName } from "./plan.ts";
import type { Store, WitnessState } from "./store.ts";
import { parseLeague, parseSquad } from "./transfermarkt.ts";
import {
  capsVerdicts,
  clubVerdicts,
  mergeChecks,
  witnessJson,
} from "./verdicts.ts";
import type { Tally, WitnessFile } from "./verdicts.ts";

// The witness runs (B5, B8). All logic lives here and receives its clients:
// the entry point creates real clients only after every guard passed, and
// tests pass fakes. Nothing read from the sites is logged beyond counts.

export type WitnessDeps = {
  /** The site clients this run may use; a site left out is not asked. */
  sites: Partial<Record<SiteName, SiteClient>>;
  store: Store;
  log: (line: string) => void;
  /** The run's date, ISO. */
  today: string;
  /** Ctrl+C: checked between requests; what arrived is kept. */
  signal?: AbortSignal;
};

/** Runs one site's steps; the first refusal ends that site, never the other. */
async function forSite(
  deps: WitnessDeps,
  site: SiteName,
  steps: (client: SiteClient) => Promise<void>,
): Promise<string | null> {
  const client = deps.sites[site];
  if (!client) return null;
  try {
    await steps(client);
    return null;
  } catch (error) {
    if (error instanceof SiteStopped || error instanceof SiteRefusal) {
      deps.log(`${site}: stopped for this run: ${error.message}`);
      return error.message;
    }
    if (deps.signal?.aborted) {
      deps.log(`${site}: interrupted; what arrived is kept`);
      return "interrupted";
    }
    throw error;
  }
}

function checkAbort(deps: WitnessDeps): void {
  if (deps.signal?.aborted) throw new Error("interrupted");
}

/**
 * B5: the one-off sample. Six requests (robots.txt, a club squad page and
 * one profile on Transfermarkt; robots.txt, the country page and one
 * player page on national-football-teams.com), each saved to the private
 * folder only. No verdict is made. Prints counts only, for the checks the
 * plan lists.
 */
export async function runSample(
  deps: WitnessDeps,
): Promise<{ saved: string[]; stopped: Partial<Record<SiteName, string>> }> {
  const saved: string[] = [];
  const robotsSaved = new Set<SiteName>();
  const stopped: Partial<Record<SiteName, string>> = {};
  const keep = async (
    site: SiteName,
    client: SiteClient,
    name: string,
    text: string,
  ) => {
    const robots = client.robotsText();
    if (robots !== null && !robotsSaved.has(site)) {
      robotsSaved.add(site);
      saved.push(
        await deps.store.savePage(
          site,
          SAMPLE_PAGES[site].robots,
          robots,
          "txt",
        ),
      );
    }
    saved.push(await deps.store.savePage(site, name, text));
  };

  const tm = await forSite(deps, "transfermarkt", async (client) => {
    const squad = await client.get(TM_SAMPLE_SQUAD_PATH);
    await keep(
      "transfermarkt",
      client,
      SAMPLE_PAGES.transfermarkt.squad,
      squad,
    );
    const players = parseSquad(squad);
    deps.log(
      `transfermarkt: squad page saved; the squad parser (UNVERIFIED) read ${players.length} rows, ${players.filter((p) => p.birthDate).length} with a birth date, ${players.filter((p) => p.loan).length} marked as loans`,
    );
    deps.log(
      `transfermarkt: robots.txt Crawl-delay ${client.robots()?.crawlDelaySec ?? "none"}`,
    );
    checkAbort(deps);
    const first = players[0];
    if (!first) {
      deps.log(
        "transfermarkt: no player link read, so no profile is asked; check the saved squad page by hand",
      );
      return;
    }
    const profile = await client.get(first.path);
    await keep(
      "transfermarkt",
      client,
      SAMPLE_PAGES.transfermarkt.profile,
      profile,
    );
    deps.log("transfermarkt: one player profile saved");
  });
  if (tm) stopped.transfermarkt = tm;

  const nft = await forSite(deps, "national-football-teams", async (client) => {
    const year = Number(deps.today.slice(0, 4));
    const country = await client.get(nftCountryPath(year));
    await keep(
      "national-football-teams",
      client,
      SAMPLE_PAGES["national-football-teams"].country,
      country,
    );
    const page = parseCountryPage(country);
    deps.log(
      `national-football-teams: country page saved; ${page.players.length} players, ${page.matches.length} matches (${page.matches.filter((m) => m.fifa).length} FIFA), last update ${page.lastUpdate ? "read" : "not found"}`,
    );
    deps.log(
      `national-football-teams: robots.txt Crawl-delay ${client.robots()?.crawlDelaySec ?? "none"} (expected 60)`,
    );
    checkAbort(deps);
    const first = page.players[0];
    if (!first) {
      deps.log(
        "national-football-teams: no player link read, so no player page is asked",
      );
      return;
    }
    const player = await client.get(first.path);
    await keep(
      "national-football-teams",
      client,
      SAMPLE_PAGES["national-football-teams"].player,
      player,
    );
    deps.log("national-football-teams: one player page saved");
  });
  if (nft) stopped["national-football-teams"] = nft;

  deps.log(
    `sample: ${saved.length} files saved in ${deps.store.dir}; no verdict made`,
  );
  return { saved, stopped };
}

/** What a weekly or backfill run needs besides its clients. */
export type CheckInput = WitnessDeps & {
  /** data/pool.json: our published values. */
  pool: Pool;
  /** From the Wikidata query (B4), or the private folder's last copy. */
  mapping: Mapping;
  /** data/witness.json as it is now. */
  witness: WitnessFile;
  /** Writes the new data/witness.json (the entry point writes it atomically). */
  writeWitness: (text: string) => Promise<void>;
};

export type CheckResult = {
  stopped: Partial<Record<SiteName, string>>;
  /** Null when nothing was written (interrupted, or no verdict). */
  witness: WitnessFile | null;
  tallies: Partial<Record<SiteName, Tally>>;
};

/** Our published club (Wikidata id) and caps per footballer. */
function published(pool: Pool) {
  const clubs = new Map(pool.clubs.map((c) => [c.id, c.wikidataId]));
  return pool.players.map((p) => ({
    qid: p.wikidataId,
    clubQid: p.clubId === null ? null : (clubs.get(p.clubId) ?? null),
    caps: p.caps,
    capsAsOf: p.capsAsOf,
  }));
}

/** The verdicts made, then data/witness.json written and what to commit printed. */
async function finish(
  input: CheckInput,
  tallies: Partial<Record<SiteName, Tally>>,
  stopped: Partial<Record<SiteName, string>>,
): Promise<CheckResult> {
  const checks = Object.values(tallies).flatMap((t) => t?.checks ?? []);
  for (const [site, t] of Object.entries(tallies)) {
    if (!t) continue;
    const by = (v: string) =>
      t.checks.filter((c) => c.check.verdict === v).length;
    input.log(
      `${site}: ${t.checks.length} verdicts (${by("agrees")} agree, ${by("differs")} differ, ${by("not-found")} not found, ${by("not-comparable")} not comparable); ${t.noId} footballers without an id, ${t.unjudged} not judged`,
    );
  }
  if (input.signal?.aborted) {
    input.log(
      "interrupted: the pages and the state are kept in the private folder; data/witness.json was not changed",
    );
    return { stopped, witness: null, tallies };
  }
  if (checks.length === 0) {
    input.log("no verdict made: data/witness.json was not changed");
    return { stopped, witness: null, tallies };
  }
  const witness = mergeChecks(input.witness, checks);
  await input.writeWitness(witnessJson(witness));
  input.log(
    "data/witness.json updated. To publish the verdicts: review it, then commit data/witness.json alone in a small pull request (this command never runs git).",
  );
  return { stopped, witness, tallies };
}

/**
 * Each player's page path exactly as a country page links it: from the
 * private state, then from the country pages saved in the private folder
 * (any saved page that parses as one; other pages give nothing).
 */
export function knownPlayerPaths(
  state: WitnessState,
  savedPages: string[],
): Map<string, string> {
  const out = new Map<string, string>();
  for (const html of savedPages)
    for (const p of parseCountryPage(html).players) out.set(p.id, p.path);
  for (const [id, s] of Object.entries(state.nft))
    if (s.path) out.set(id, s.path);
  return out;
}

/**
 * Last resort, UNVERIFIED path form: a player page from his id and a name (the country
 * page links each player as /player/<id>/<Given_Family>.html).
 */
export function playerPath(id: string, name: string): string {
  const slug = plainLatin(name)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/(^|_)([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
  return `/player/${id}/${slug}.html`;
}

/**
 * B8, weekly: Transfermarkt's league page and its 16 squad pages (18
 * requests with robots.txt), then national-football-teams.com's country
 * page and the player pages whose matches this year changed since they
 * were last read. Each page is saved as it arrives, the state after each
 * player page. The first refusal stops that site; the other goes on.
 */
export async function runWeekly(input: CheckInput): Promise<CheckResult> {
  const stopped: Partial<Record<SiteName, string>> = {};
  const tallies: Partial<Record<SiteName, Tally>> = {};
  const ours = published(input.pool);
  const state: WitnessState = await input.store.readState();

  // Transfermarkt: which club page lists whom.
  const squads = new Map<string, Set<string>>();
  const leagueIds = new Set<string>();
  const loans = new Set<string>();
  const tm = await forSite(input, "transfermarkt", async (client) => {
    const league = await client.get(TM_LEAGUE_PATH);
    await input.store.savePage("transfermarkt", "league", league);
    const clubs = parseLeague(league);
    for (const c of clubs) leagueIds.add(c.id);
    input.log(`transfermarkt: the league page lists ${clubs.length} clubs`);
    for (const club of clubs) {
      checkAbort(input);
      const page = await client.get(club.squadPath);
      await input.store.savePage("transfermarkt", `squad-${club.id}`, page);
      const players = parseSquad(page);
      squads.set(club.id, new Set(players.map((p) => p.id)));
      for (const p of players) if (p.loan) loans.add(p.id);
    }
  });
  if (tm) stopped.transfermarkt = tm;
  if (squads.size > 0) {
    const ligue1 = new Set(
      input.pool.clubs.filter((c) => c.ligue1).map((c) => c.wikidataId),
    );
    const t = clubVerdicts({
      players: ours,
      mapping: input.mapping,
      squads,
      ligue1,
      leagueIds,
      loans,
      today: input.today,
    });
    tallies.transfermarkt = t;
    const name = (q: string) =>
      input.pool.clubs.find((c) => c.wikidataId === q)?.nameLatin ?? q;
    const left = (qs: string[]) =>
      ours.filter((p) => p.clubQid !== null && qs.includes(p.clubQid)).length;
    if (t.unmappedClubs?.length)
      input.log(
        `transfermarkt: no Transfermarkt id on Wikidata for ${t.unmappedClubs.map(name).join(", ")}: ${left(t.unmappedClubs)} footballers left unjudged`,
      );
    if (t.mismatchedClubs?.length)
      input.log(
        `transfermarkt: Wikidata's id is not a club of the league page for ${t.mismatchedClubs.map(name).join(", ")} (mismatch): ${left(t.mismatchedClubs)} footballers left unjudged`,
      );
  }

  // national-football-teams.com: careers, refreshed where this year changed.
  const read: { country: NftCountryPage | null } = { country: null };
  const nft = await forSite(
    input,
    "national-football-teams",
    async (client) => {
      const year = Number(input.today.slice(0, 4));
      const html = await client.get(nftCountryPath(year));
      await input.store.savePage(
        "national-football-teams",
        `country-${year}`,
        html,
      );
      const country = parseCountryPage(html);
      read.country = country;
      const wanted = new Set(
        [...input.mapping.players.values()]
          .map((m) => m.nft)
          .filter((id): id is string => Boolean(id)),
      );
      // Fix round 2: keep each player's exact link for later backfills.
      for (const p of country.players)
        if (wanted.has(p.id))
          state.nft[p.id] = { ...state.nft[p.id], path: p.path };
      await input.store.writeState(state);
      const due = country.players.filter(
        (p) =>
          wanted.has(p.id) &&
          (state.nft[p.id]?.careerA === undefined ||
            state.nft[p.id]?.yearMatches !== (p.fifaMatches ?? undefined)),
      );
      const room =
        SITES["national-football-teams"].maxRequests - client.requests();
      input.log(
        `national-football-teams: ${country.players.length} players on the country page; ${due.length} player pages due, ${Math.min(due.length, room)} asked this run`,
      );
      for (const p of due.slice(0, room)) {
        checkAbort(input);
        const page = await client.get(p.path);
        await input.store.savePage(
          "national-football-teams",
          `player-${p.id}`,
          page,
        );
        state.nft[p.id] = {
          ...careerOf(parsePlayerPage(page)),
          path: p.path,
          yearMatches: p.fifaMatches ?? undefined,
          readOn: input.today,
        };
        await input.store.writeState(state);
      }
    },
  );
  if (nft) stopped["national-football-teams"] = nft;
  const country = read.country;
  if (country)
    tallies["national-football-teams"] = judgeCaps(
      state,
      country,
      ours,
      input.mapping,
      input.today,
    );
  return finish(input, tallies, stopped);
}

/** What the private state keeps of a player page (fix round 3). */
function careerOf(page: ReturnType<typeof parsePlayerPage>) {
  return {
    careerA: page.careerA ?? undefined,
    careerFifa: page.careerFifa ?? undefined,
    latestMatch: page.latestMatch ?? undefined,
  };
}

/**
 * Caps verdicts from the state and a country page. A career read earlier
 * still holds when the country page shows no match of his since: same
 * count this year, or absent from it.
 */
function judgeCaps(
  state: WitnessState,
  country: NftCountryPage,
  ours: ReturnType<typeof published>,
  mapping: Mapping,
  today: string,
): Tally {
  const careers = new Map<string, number | null>();
  const siteAsOf = new Map<string, string | null>();
  for (const [id, s] of Object.entries(state.nft)) {
    const row = country.players.find((p) => p.id === id);
    const current =
      !row ||
      (s.yearMatches !== undefined &&
        s.yearMatches === (row.fifaMatches ?? undefined));
    if (s.careerA !== undefined && current) {
      careers.set(id, s.careerA);
      siteAsOf.set(id, s.latestMatch ?? null);
    }
  }
  return capsVerdicts({
    players: ours,
    mapping,
    careers,
    latestMatch: latestFifaMatch(country),
    siteAsOf,
    lastUpdate: country.lastUpdate,
    today,
  });
}

/**
 * Fix round 3, `--rejudge`: every verdict made again from the pages already
 * in the private folder, with no client at all (no request is possible).
 * Transfermarkt from the saved league and squad pages; national-football-
 * teams from the newest saved country page and the saved player pages,
 * whose counts refresh the private state. Each verdict is dated by the day
 * its pages were saved. The re-derived site's verdicts replace its old ones
 * in data/witness.json; the rest stay.
 */
export async function runRejudge(
  input: Omit<CheckInput, "sites" | "signal">,
): Promise<CheckResult> {
  const ours = published(input.pool);
  const state = await input.store.readState();
  const tallies: Partial<Record<SiteName, Tally>> = {};

  const tmPages = await input.store.readPagesNamed("transfermarkt", "");
  const league = tmPages.find((p) => p.name === "league");
  if (league) {
    const leagueIds = new Set(parseLeague(league.text).map((c) => c.id));
    const squads = new Map<string, Set<string>>();
    const loans = new Set<string>();
    for (const page of tmPages) {
      const id = /^squad-(\d+)$/.exec(page.name)?.[1];
      if (!id || !leagueIds.has(id)) continue;
      const players = parseSquad(page.text);
      squads.set(id, new Set(players.map((p) => p.id)));
      for (const p of players) if (p.loan) loans.add(p.id);
    }
    tallies.transfermarkt = clubVerdicts({
      players: ours,
      mapping: input.mapping,
      squads,
      ligue1: new Set(
        input.pool.clubs.filter((c) => c.ligue1).map((c) => c.wikidataId),
      ),
      leagueIds,
      loans,
      today: league.savedOn,
    });
  }

  const nftPages = await input.store.readPagesNamed(
    "national-football-teams",
    "",
  );
  const country = nftPages
    .filter((p) => /^country-\d{4}$/.test(p.name))
    .sort((a, b) => b.name.localeCompare(a.name))[0];
  for (const page of nftPages) {
    const id = /^player-(\d+)$/.exec(page.name)?.[1];
    if (!id) continue;
    state.nft[id] = {
      ...state.nft[id],
      ...careerOf(parsePlayerPage(page.text)),
    };
  }
  await input.store.writeState(state);
  if (country)
    tallies["national-football-teams"] = judgeCaps(
      state,
      parseCountryPage(country.text),
      ours,
      input.mapping,
      country.savedOn,
    );

  // The re-derived sites' verdicts replace their old ones.
  const cleared: WitnessFile = { version: 1, checks: {} };
  for (const [qid, fields] of Object.entries(input.witness.checks)) {
    const kept = Object.fromEntries(
      Object.entries(fields).filter(
        ([, v]) => !(v && tallies[v.site] !== undefined),
      ),
    );
    if (Object.keys(kept).length > 0) cleared.checks[qid] = kept;
  }
  return finish({ ...input, sites: {}, witness: cleared }, tallies, {});
}

/**
 * B8, backfill: the next `pages` national-football-teams player pages not
 * read yet, low-confidence caps first, at the site's pace (60 s or its
 * Crawl-delay). The careers go to the private state; the next weekly run
 * makes the verdicts, with the country page's latest match to compare.
 */
export async function runBackfill(
  input: CheckInput & { pages: number },
): Promise<CheckResult> {
  const state = await input.store.readState();
  const rank = { low: 0, medium: 1, high: 2 } as const;
  // Fix round 2: the exact link a country page gave him (this run's state,
  // or a country page saved in the private folder); a guessed name only
  // as a last resort, after every known link (squad-lists review, L2).
  const known = knownPlayerPaths(
    state,
    await input.store.readPages("national-football-teams", ""),
  );
  const queue = input.pool.players
    .map((p) => ({ p, id: input.mapping.players.get(p.wikidataId)?.nft }))
    .filter((x): x is { p: Pool["players"][number]; id: string } =>
      Boolean(x.id && !state.backfill.done[x.id]),
    )
    .sort(
      (a, b) =>
        Number(!known.has(a.id)) - Number(!known.has(b.id)) ||
        rank[a.p.provenance.caps?.confidence ?? "low"] -
          rank[b.p.provenance.caps?.confidence ?? "low"] ||
        Number(a.p.wikidataId.slice(1)) - Number(b.p.wikidataId.slice(1)),
    )
    .slice(0, input.pages);
  const guessed = queue.filter(({ id }) => !known.has(id)).length;
  input.log(
    `national-football-teams: backfill of ${queue.length} player pages, ${queue.length - guessed} by the link a country page gave, ${guessed} by a guessed name (UNVERIFIED)`,
  );
  const stopped: Partial<Record<SiteName, string>> = {};
  let missed = 0;
  const why = await forSite(
    input,
    "national-football-teams",
    async (client) => {
      for (const { p, id } of queue) {
        checkAbort(input);
        const exact = known.get(id);
        // A guessed path that answers 404 is skipped, never a stop: it
        // stays not done until a country page gives his link.
        const page = exact
          ? await client.get(exact)
          : await client.get(playerPath(id, p.nameLatin), { missingOk: true });
        if (page === "") {
          missed++;
          continue;
        }
        await input.store.savePage(
          "national-football-teams",
          `player-${id}`,
          page,
        );
        state.nft[id] = {
          ...state.nft[id],
          ...careerOf(parsePlayerPage(page)),
          readOn: input.today,
        };
        state.backfill.done[id] = input.today;
        await input.store.writeState(state);
      }
    },
  );
  if (why) stopped["national-football-teams"] = why;
  if (guessed > 0)
    input.log(
      `national-football-teams: ${missed} of ${guessed} guessed names answered 404; they wait for a country page's link`,
    );
  input.log(
    `backfill: ${Object.keys(state.backfill.done).length} player pages read so far; the next weekly run turns them into verdicts`,
  );
  return { stopped, witness: null, tallies: {} };
}
