import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildEntries, match } from "@/engine/names/index.ts";
import type { Pool } from "@/pipeline/types.ts";
import { packNames, unpackNames } from "./search-index";

const pool = JSON.parse(
  readFileSync(new URL("../../data/pool.json", import.meta.url), "utf8"),
) as Pool;

describe("the game page's name index", () => {
  const packed = packNames(pool);

  it("holds every active footballer once, and no legend-only footballer", () => {
    const active = pool.players.filter((p) => p.pools.active).map((p) => p.id);
    const ids = packed.map((row) => row[0]);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...active].sort());
    const legendsOnly = pool.players.filter(
      (p) => !p.pools.active && p.pools.legend,
    );
    for (const p of legendsOnly) expect(ids).not.toContain(p.id);
  });

  it("carries no field beyond id, display names, aliases and the fame tier's rank", () => {
    for (const row of packed) {
      expect(row).toHaveLength(6);
      const [id, latin, arabic, french, aliases, fame] = row;
      const player = pool.players.find((p) => p.id === id)!;
      expect(latin).toBe(player.nameLatin);
      expect(arabic).toBe(player.nameArabic);
      expect([player.nameFrench, null]).toContain(french);
      expect(aliases).toEqual(player.aliases);
      // Only the tier, which data/pool.json already makes public; never the
      // finer score (review 2b, L1).
      const rank = { A: 4, B: 3, C: 2, D: 1 };
      expect(fame).toBe(player.fame?.tier ? rank[player.fame.tier] : 0);
    }
    // No club, caps or birth date.
    const text = JSON.stringify(packed);
    for (const p of pool.players.filter((x) => x.pools.active).slice(0, 20)) {
      if (p.clubId) expect(text).not.toContain(`"${p.clubId}"`);
      expect(text).not.toContain(p.birthDate);
    }
  });

  it("is sorted by id, so the page does not depend on the pool's order", () => {
    const ids = packed.map((row) => row[0]);
    expect(ids).toEqual([...ids].sort());
  });

  it("finds footballers in the three scripts once unpacked", () => {
    const entries = buildEntries(unpackNames(packed));
    const someone = pool.players.find(
      (p) => p.pools.active && p.nameArabic !== null,
    )!;
    expect(match(entries, someone.nameLatin)).toContain(someone.id);
    expect(match(entries, someone.nameArabic!)).toContain(someone.id);
  });

  it("stays small: about 10 KB compressed (plan Task 12)", async () => {
    const { gzipSync } = await import("node:zlib");
    expect(gzipSync(JSON.stringify(packed)).length).toBeLessThan(12_000);
  });
});
