// B4 (S24, S25): the sites' ids for the pool's footballers and Ligue 1
// clubs, from one Wikidata query run by the witness command (the nightly
// budget is untouched). P2446 Transfermarkt player id, P2574
// national-football-teams.com player id, P7223 Transfermarkt team id [U:
// confirm on the first run]. Ids only: no name or birth-date matching yet.
// Pure.

export type Mapping = {
  /** Footballer (Wikidata id) → his ids on the two sites. */
  players: Map<string, { transfermarkt?: string; nft?: string }>;
  /** Club (Wikidata id) → its Transfermarkt id. */
  clubs: Map<string, string>;
};

export type MappingCounts = {
  players: number;
  transfermarkt: number;
  nft: number;
  clubs: number;
};

const QID = /^Q\d+$/;

/** One query: P2446 and P2574 for the footballers, P7223 for the clubs. */
export function mappingQuery(playerQids: string[], clubQids: string[]): string {
  const values = (qids: string[]) =>
    qids
      .filter((q) => QID.test(q))
      .map((q) => `wd:${q}`)
      .join(" ");
  return `SELECT ?item ?tm ?nft ?tmClub WHERE {
  {
    VALUES ?item { ${values(playerQids)} }
    OPTIONAL { ?item wdt:P2446 ?tm }
    OPTIONAL { ?item wdt:P2574 ?nft }
  } UNION {
    VALUES ?item { ${values(clubQids)} }
    ?item wdt:P7223 ?tmClub .
  }
}`;
}

type Binding = Record<string, { value?: string } | undefined>;

export function parseMapping(json: unknown): Mapping {
  const bindings =
    (json as { results?: { bindings?: Binding[] } })?.results?.bindings ?? [];
  const mapping: Mapping = { players: new Map(), clubs: new Map() };
  for (const b of bindings) {
    const qid = /Q\d+$/.exec(b.item?.value ?? "")?.[0];
    if (!qid) continue;
    if (b.tmClub?.value) {
      if (!mapping.clubs.has(qid)) mapping.clubs.set(qid, b.tmClub.value);
      continue;
    }
    const ids = mapping.players.get(qid) ?? {};
    // A footballer with two ids keeps the first: one is enough to compare.
    if (b.tm?.value && !ids.transfermarkt) ids.transfermarkt = b.tm.value;
    if (b.nft?.value && !ids.nft) ids.nft = b.nft.value;
    mapping.players.set(qid, ids);
  }
  return mapping;
}

/** How many of the asked footballers and clubs have an id (S25: count the gaps). */
export function mappingCounts(
  mapping: Mapping,
  playerQids: string[],
): MappingCounts & { withoutTransfermarkt: number; withoutNft: number } {
  const tm = playerQids.filter((q) => mapping.players.get(q)?.transfermarkt);
  const nft = playerQids.filter((q) => mapping.players.get(q)?.nft);
  return {
    players: playerQids.length,
    transfermarkt: tm.length,
    nft: nft.length,
    clubs: mapping.clubs.size,
    withoutTransfermarkt: playerQids.length - tm.length,
    withoutNft: playerQids.length - nft.length,
  };
}

/** The mapping as the private folder keeps it (JSON has no Map). */
export function mappingToJson(mapping: Mapping, counts: MappingCounts) {
  return {
    counts,
    players: Object.fromEntries(mapping.players),
    clubs: Object.fromEntries(mapping.clubs),
  };
}

export function mappingFromJson(json: {
  players?: Record<string, { transfermarkt?: string; nft?: string }>;
  clubs?: Record<string, string>;
}): Mapping {
  return {
    players: new Map(Object.entries(json.players ?? {})),
    clubs: new Map(Object.entries(json.clubs ?? {})),
  };
}
