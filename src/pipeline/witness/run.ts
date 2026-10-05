import { SiteRefusal, SiteStopped } from "./client.ts";
import type { SiteClient } from "./client.ts";
import { parseCountryPage } from "./nft.ts";
import { nftCountryPath, SAMPLE_PAGES, TM_SAMPLE_SQUAD_PATH } from "./plan.ts";
import type { SiteName } from "./plan.ts";
import type { Store } from "./store.ts";
import { parseSquad } from "./transfermarkt.ts";

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
