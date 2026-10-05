// Footballers for the calendar's database tests: answer-ready (or not) and
// with a fame tier, synced the way a deploy syncs data/pool.json.

import { syncPool } from "../sync.ts";
import type { Queryable } from "../sync.ts";
import type { FameTier, Pool, PoolPlayer, Provenance } from "../types.ts";

const rated = (confidence: "high" | "low"): Provenance => ({
  source: "enwiki",
  retrievedAt: "2026-10-04",
  confidence,
  agreeing: ["enwiki"],
});

let qid = 1000;
const qids = new Map<string, string>();

export function footballer(id: string, tier: FameTier, ready = true): PoolPlayer {
  if (!qids.has(id)) qids.set(id, `Q${qid++}`);
  return {
    id,
    wikidataId: qids.get(id)!,
    nameLatin: id,
    nameArabic: null,
    nameFrench: null,
    aliases: [],
    position: "midfielder",
    positionDetail: null,
    birthDate: "1995-01-01",
    birthPlace: "Sfax",
    birthCountry: "TN",
    governorate: "sfax",
    clubId: null,
    caps: 10,
    goals: 0,
    capsAsOf: null,
    history: [],
    photo: null,
    wiki: { en: id, fr: null, ar: null },
    pools: { active: true, legend: false },
    provenance: {
      clubId: rated("high"),
      position: rated("high"),
      birthDate: rated("high"),
      caps: rated(ready ? "high" : "low"),
      governorate: rated("high"),
    },
    fame: {
      score: tier === "A" ? 5.5 : tier === "B" ? 4.7 : tier === "C" ? 4.2 : 3,
      tier,
      views: { en: 1, fr: 0, ar: 0 },
      window: "202510-202609",
      localStar: false,
    },
  };
}

/**
 * Fifteen footballers in each of the tiers A, B and C: enough for 30 days
 * without a repeat (weekdays draw from A and B, weekends from B and C).
 */
export const eligible = (["A", "B", "C"] as const).flatMap((tier) =>
  Array.from({ length: 15 }, (_, i) =>
    footballer(`tier-${tier.toLowerCase()}-footballer-${i}`, tier),
  ),
);

export async function syncFootballers(
  client: Queryable,
  players: PoolPlayer[],
): Promise<void> {
  const pool: Pool = {
    version: 1,
    players,
    clubs: [],
    honours: [],
    flags: [],
    dropped: [],
  };
  await syncPool(
    client,
    pool,
    [
      {
        id: "sfax",
        nameLatin: "Sfax",
        nameArabic: "صفاقس",
        nameFrench: "Sfax",
        region: "centre_east",
      },
    ],
  );
}

