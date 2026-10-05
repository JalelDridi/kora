// What a witness run will ask, before it asks anything (B1, B8): hosts,
// paths, gaps, request caps and the longest it may take. Pure.

export type SiteName = "transfermarkt" | "national-football-teams";
export const SITE_NAMES: readonly SiteName[] = [
  "transfermarkt",
  "national-football-teams",
];

/** S27: honest, named, no contact address unless Jalel wants one. */
export const WITNESS_USER_AGENT =
  "KoraWitness/0.1 (+https://github.com/JalelDridi/kora; weekly check run by hand)";

export type SiteSettings = {
  name: SiteName;
  host: string;
  /** S26: the least time between two request starts; robots.txt may ask more. */
  gapMs: number;
  /** S26: the most requests in one run, robots.txt included. */
  maxRequests: number;
};

/** S26: Transfermarkt 30 s, at most 20; national-football-teams max(60 s, Crawl-delay), at most 40. */
export const SITES: Record<SiteName, SiteSettings> = {
  transfermarkt: {
    name: "transfermarkt",
    host: "www.transfermarkt.com",
    gapMs: 30_000,
    maxRequests: 20,
  },
  "national-football-teams": {
    name: "national-football-teams",
    host: "www.national-football-teams.com",
    gapMs: 60_000,
    maxRequests: 40,
  },
};

/** Transfermarkt's Tunisian Ligue Professionnelle 1, this season. */
export const TM_LEAGUE_PATH =
  "/ligue-professionnelle-1/startseite/wettbewerb/TUN1/saison_id/2026";
/** B5's one club squad page (Club Africain, id 819, as the league page links it). */
export const TM_SAMPLE_SQUAD_PATH =
  "/club-africain-tunis/kader/verein/819/saison_id/2026";
/** national-football-teams.com's Tunisia page for the current year. */
export const nftCountryPath = (year: number) =>
  `/country/190/${year}/Tunisia.html`;

/** Where the sample run (B5) saves each page, under pages/<site>/ in the private folder. */
export const SAMPLE_PAGES = {
  transfermarkt: {
    robots: "sample-robots",
    squad: "sample-squad",
    profile: "sample-profile",
  },
  "national-football-teams": {
    robots: "sample-robots",
    country: "sample-country",
    player: "sample-player",
  },
} as const;

export type Mode =
  { kind: "weekly" } | { kind: "sample" } | { kind: "backfill"; pages: number };

/** Per site: the requests at most, in order, and why. */
export function plannedRequests(
  mode: Mode,
  year: number,
): Record<SiteName, string[]> {
  const nft = nftCountryPath(year);
  if (mode.kind === "sample")
    return {
      transfermarkt: [
        "/robots.txt",
        TM_SAMPLE_SQUAD_PATH,
        "/<player>/profil/spieler/<id> (one player of that squad page)",
      ],
      "national-football-teams": [
        "/robots.txt",
        nft,
        "/player/<id>/<name>.html (one player of that country page)",
      ],
    };
  if (mode.kind === "backfill")
    return {
      transfermarkt: [],
      "national-football-teams": [
        "/robots.txt",
        ...Array.from(
          {
            length: Math.min(
              mode.pages,
              SITES["national-football-teams"].maxRequests - 1,
            ),
          },
          () => "/player/<id>/<name>.html (next not done)",
        ),
      ],
    };
  return {
    transfermarkt: [
      "/robots.txt",
      TM_LEAGUE_PATH,
      ...Array.from(
        { length: 16 },
        () => "/<club>/kader/verein/<id>/saison_id/2026 (each Ligue 1 club)",
      ),
    ],
    "national-football-teams": [
      "/robots.txt",
      nft,
      ...Array.from(
        { length: SITES["national-football-teams"].maxRequests - 2 },
        () =>
          "/player/<id>/<name>.html (only those whose matches this year changed)",
      ),
    ],
  };
}

/** The longest a site's part may take: one gap before every request but the first. */
export function longestMinutes(site: SiteName, requests: number): number {
  return (Math.max(0, requests - 1) * SITES[site].gapMs) / 60_000;
}

/** The dry run's text (B1): no request, not even to Wikidata. */
export function describePlan(input: {
  mode: Mode;
  year: number;
  sites: readonly SiteName[];
  privateDir: string;
  /**
   * Fix round 1: our Ligue 1 clubs with no Transfermarkt id in the last
   * mapping, with how many of our footballers each holds; null when there
   * is no mapping yet. Their footballers get no club verdict.
   */
  unmappedClubs?: { name: string; footballers: number }[] | null;
  /** From the private folder's last mapping, or null before the first Wikidata query. */
  mapping: {
    players: number;
    transfermarkt: number;
    nft: number;
    clubs: number;
  } | null;
}): string[] {
  const planned = plannedRequests(input.mode, input.year);
  const lines = [
    `witness plan (${input.mode.kind === "backfill" ? `backfill ${input.mode.pages}` : input.mode.kind}): nothing is sent without --live`,
    `private folder: ${input.privateDir}`,
    `User-Agent: ${WITNESS_USER_AGENT}`,
    input.mapping
      ? `ids from the last Wikidata query: ${input.mapping.transfermarkt} of ${input.mapping.players} footballers on Transfermarkt, ${input.mapping.nft} on national-football-teams, ${input.mapping.clubs} clubs`
      : "ids: unknown until the Wikidata query (one request to query.wikidata.org, live runs only)",
    ...(input.mode.kind === "sample"
      ? []
      : [
          "Wikidata: a live run first asks query.wikidata.org once for the ids (P2446, P2574, P7223)",
        ]),
    ...(input.unmappedClubs === undefined ||
    !input.sites.includes("transfermarkt")
      ? []
      : input.unmappedClubs === null
        ? [
            "Ligue 1 clubs without a Transfermarkt id: unknown until the Wikidata query",
          ]
        : [
            input.unmappedClubs.length === 0
              ? "Ligue 1 clubs without a Transfermarkt id in the last mapping: none"
              : `Ligue 1 clubs without a Transfermarkt id in the last mapping, so no club verdict for their ${input.unmappedClubs.reduce((n, c) => n + c.footballers, 0)} footballers: ${input.unmappedClubs.map((c) => `${c.name} (${c.footballers})`).join(", ")}`,
            "A club whose id is not on the league page (a mismatch) is found only by a live run, and gets no verdict either",
          ]),
  ];
  for (const site of input.sites) {
    const s = SITES[site];
    const paths = planned[site];
    if (paths.length === 0) continue;
    lines.push(
      "",
      `${s.name}: https://${s.host}, at least ${s.gapMs / 1000} s apart (more if robots.txt asks), at most ${paths.length} requests (cap ${s.maxRequests}), no retry, stops at the first refusal`,
      `  longest: about ${Math.ceil(longestMinutes(site, paths.length))} min`,
      ...[...new Set(paths)].map(
        (p) =>
          `  ${p}${paths.filter((q) => q === p).length > 1 ? ` (up to ${paths.filter((q) => q === p).length})` : ""}`,
      ),
    );
  }
  return lines;
}
