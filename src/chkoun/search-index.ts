import type { NameSource } from "@/engine/names/index.ts";
import type { FameTier, Pool } from "@/pipeline/types.ts";

// The game page's name list (plan Task 12): every footballer a visitor may
// guess, the active pool, and nothing that could single out the day's
// answer: an id, the names to search and show, aliases, and the fame tier
// (as a rank) for ties. No club, caps or birth. The tier is public anyway
// (data/pool.json carries it); the finer fame score is not shipped (review
// 2b, L1). Packed as tuples to keep the page light;
// the browser builds the search keys itself (src/engine/names).

/** [id, Latin name, Arabic name, French name, aliases, fame rank]. */
export type PackedName = [
  string,
  string,
  string | null,
  string | null,
  string[],
  number,
];

/** The fame tier as a rank for ties: A is 4, D is 1, none is 0. */
const TIER_RANK: Record<FameTier, number> = { A: 4, B: 3, C: 2, D: 1 };

export function packNames(pool: Pool): PackedName[] {
  return pool.players
    .filter((p) => p.pools.active)
    .map((p): PackedName => [
      p.id,
      p.nameLatin,
      p.nameArabic,
      // The French name only when it differs: most are the Latin one.
      p.nameFrench && p.nameFrench !== p.nameLatin ? p.nameFrench : null,
      p.aliases,
      p.fame?.tier ? TIER_RANK[p.fame.tier] : 0,
    ])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

export function unpackNames(packed: PackedName[]): NameSource[] {
  return packed.map(
    ([id, nameLatin, nameArabic, nameFrench, aliases, fame]) => ({
      id,
      nameLatin,
      nameArabic,
      nameFrench,
      aliases,
      fame,
    }),
  );
}
