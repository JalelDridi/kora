import type { NameSource } from "@/engine/names/index.ts";
import type { Pool } from "@/pipeline/types.ts";

// The game page's name list (plan Task 12): every footballer a visitor may
// guess, the active pool, and nothing that could single out the day's
// answer: an id, the names to search and show, aliases, and fame for ties.
// No club, caps, birth or tier. Packed as tuples to keep the page light;
// the browser builds the search keys itself (src/engine/names).

/** [id, Latin name, Arabic name, French name, aliases, fame]. */
export type PackedName = [
  string,
  string,
  string | null,
  string | null,
  string[],
  number,
];

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
      Math.round((p.fame?.score ?? 0) * 100) / 100,
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
