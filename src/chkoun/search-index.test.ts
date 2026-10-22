import { isGuessable } from "@/pipeline/grace.ts";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildEntries, match } from "@/engine/names/index.ts";
import type { Pool } from "@/pipeline/types.ts";
import { buildFootballers } from "./attributes";
import { packNames, unpackNames } from "./search-index";

const pool = JSON.parse(
  readFileSync(new URL("../../data/pool.json", import.meta.url), "utf8"),
) as Pool;

describe("the game page's name index", () => {
  const packed = packNames(pool);

  it("holds every guessable footballer once (active or in grace, P54), and no legend-only footballer", () => {
    const guessable = pool.players
      .filter((p) => isGuessable(p.pools))
      .map((p) => p.id);
    const ids = packed.map((row) => row[0]);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...guessable].sort());
    const legendsOnly = pool.players.filter(
      (p) => !isGuessable(p.pools) && p.pools.legend,
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

  it("lists footballers in grace too, as the guessable set does (P54)", () => {
    const legend = pool.players.find((p) => !p.pools.active)!;
    const active = pool.players.find((p) => p.pools.active)!;
    const withGrace: Pool = {
      ...pool,
      players: pool.players.map((p) =>
        p.id === legend.id
          ? { ...p, pools: { ...p.pools, graceUntil: "2026-12-03" } }
          : p.id === active.id
            ? {
                ...p,
                pools: {
                  active: false,
                  legend: false,
                  graceUntil: "2026-12-03",
                },
              }
            : p,
      ),
    };
    const ids = packNames(withGrace).map((row) => row[0]);
    expect(ids).toContain(legend.id);
    expect(ids).toContain(active.id);
    const guessable = buildFootballers(withGrace, []).guessable;
    expect([...ids].sort()).toEqual([...guessable].sort());
  });

  it("stays small: about 10 KB compressed (plan Task 12)", async () => {
    const { gzipSync } = await import("node:zlib");
    expect(gzipSync(JSON.stringify(packed)).length).toBeLessThan(12_000);
  });
});
