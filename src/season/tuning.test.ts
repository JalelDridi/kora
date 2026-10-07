import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { addDays } from "@/engine/chkoun/day.ts";
import { buildSeasonData } from "@/engine/season/data.ts";
import {
  applyPick,
  drafted,
  FORMATION,
  spinFor,
} from "@/engine/season/draft.ts";
import type { DraftState } from "@/engine/season/draft.ts";
import { rateXi, simulateSeason } from "@/engine/season/simulate.ts";
import type { RatedSlot } from "@/engine/season/simulate.ts";
import type { Pool } from "@/pipeline/types.ts";

// How often a 30–0 season happens on the real pool (D-S3-8): it needs an XI
// rated about 90, and even greedy drafts reach it in under 1% of seasons.

const read = <T>(file: string) =>
  JSON.parse(
    readFileSync(new URL(`../../data/${file}`, import.meta.url), "utf8"),
  ) as T;
const pool = read<Pool>("pool.json");
const strength = read<{ clubs: Record<string, number> }>(
  "curated/ligue1-strength.json",
);
const afcon = read<{ footballers: string[] }>("curated/afcon-2004.json");
const data = buildSeasonData(pool, { strength, afcon }, 2026);
const table = data.table;
const ctx = { data, key: "test-key-not-the-real-one" };

/** 11 slots all rated `r`, one per club in data.clubIds order. */
const xiRated = (r: number): RatedSlot[] =>
  FORMATION.map((line, i) => ({
    code: `p${i}_0`,
    line,
    clubId: data.clubIds[i],
    rating: r,
  }));

const rate30 = (r: number, n = 20_000) => {
  let perfect = 0;
  for (let i = 0; i < n; i++)
    if (
      simulateSeason({ day: addDays("2026-10-07", i), xi: xiRated(r), table })
        .w === 30
    )
      perfect++;
  return perfect / n;
};

describe("30–0 tuning", { timeout: 120_000 }, () => {
  it("a side rated 80 almost never goes 30–0", () =>
    expect(rate30(80)).toBeLessThan(0.0005));
  it("a side rated 85 rarely does", () =>
    expect(rate30(85)).toBeLessThan(0.0025));
  it("a side rated 90 sometimes does", () => {
    const p = rate30(90);
    expect(p).toBeGreaterThan(0.0025);
    expect(p).toBeLessThan(0.05);
  });
  it("a side rated 95 does more often", () =>
    expect(rate30(95)).toBeGreaterThan(0.02));
  it("drafts of a visitor who always takes the best candidate go 30–0 in under 1% of seasons", () => {
    let perfect = 0;
    for (let i = 0; i < 3000; i++) {
      let state: DraftState = { id: `greedy-${i}`, picks: [], respin: null };
      for (let slot = 0; slot < 11; slot++) {
        const best = [...spinFor(ctx, state, slot).candidates].sort(
          (a, b) => b.rating - a.rating,
        )[0];
        state = applyPick(ctx, state, best.footballerId)!;
      }
      const xi = rateXi(data, drafted(ctx, state)!);
      if (
        simulateSeason({
          day: addDays("2026-10-07", i % 365),
          xi,
          table: data.table,
        }).w === 30
      )
        perfect++;
    }
    expect(perfect / 3000).toBeLessThan(0.01);
  });
});
