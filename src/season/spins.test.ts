import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSeasonData, seasonProblems } from "@/engine/season/data.ts";
import { applyPick, applyRespin, spinFor } from "@/engine/season/draft.ts";
import type { DraftState } from "@/engine/season/draft.ts";
import type { Line } from "@/engine/chkoun/types.ts";
import type { SeasonData } from "@/engine/season/types.ts";
import type { Pool } from "@/pipeline/types.ts";

// 30–0 on the committed pool: whatever the spins, every slot of the 1-4-3-3
// offers someone (D-S3-2, D-S3-4).

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
const ctx = { data, key: "test-key-not-the-real-one" };

/** A copy of `data` keeping only the first `n` footballers of `line`. */
function withOnly(data: SeasonData, line: Line, n: number): SeasonData {
  const ofLine = [...data.people.values()]
    .filter((p) => p.line === line)
    .map((p) => p.id)
    .sort();
  const kept = new Set(ofLine.slice(0, n));
  const index = new Map(
    [...data.index]
      .map(
        ([key, list]) =>
          [
            key,
            list.filter((c) => c.line !== line || kept.has(c.footballerId)),
          ] as const,
      )
      .filter(([, list]) => list.length > 0),
  );
  const gone = (id: string) =>
    data.people.get(id)?.line === line && !kept.has(id);
  return {
    ...data,
    index,
    people: new Map([...data.people].filter(([id]) => !gone(id))),
    combos: new Map([...data.combos].filter(([id]) => !gone(id))),
  };
}

describe("30–0 spins on the real pool", () => {
  it("no slot can come up empty: 2,000 random drafts on the real pool finish 11 distinct footballers", () => {
    for (let i = 0; i < 2000; i++) {
      let state: DraftState = { id: `draft-${i}`, picks: [], respin: null };
      for (let slot = 0; slot < 11; slot++) {
        if (i % 3 === 0 && slot === i % 11) state = applyRespin(state)!;
        const s = spinFor(ctx, state, slot);
        expect(s.candidates.length).toBeGreaterThan(0);
        state = applyPick(
          ctx,
          state,
          s.candidates[i % s.candidates.length].footballerId,
        )!;
      }
      expect(new Set(state.picks).size).toBe(11);
    }
  }, 20_000); // about 0.6 s alone; the whole suite runs in parallel
  it("the committed pool passes seasonProblems", () =>
    expect(seasonProblems(data)).toEqual([]));
  it("seasonProblems refuses a line with fewer footballers than the formation needs", () => {
    expect(seasonProblems(withOnly(data, "goalkeeper", 0))).toContain(
      "30–0: 0 goalkeepers can be drafted, 1 needed",
    );
    expect(seasonProblems(withOnly(data, "defender", 3))).toContain(
      "30–0: 3 defenders can be drafted, 4 needed",
    );
    expect(seasonProblems(withOnly(data, "defender", 4))).toEqual([]);
  });
  it("seasonProblems refuses a strength table that is not the 16 clubs", () => {
    expect(seasonProblems({ ...data, table: data.table.slice(1) })).toEqual([
      "30–0: the strength table has 15 clubs, 16 needed",
      `30–0: no strength for ${data.table[0].clubId}`,
    ]);
  });
});
