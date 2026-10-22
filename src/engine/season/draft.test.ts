import { describe, expect, it } from "vitest";
import { buildSeasonData } from "./data.ts";
import {
  applyPick,
  applyRespin,
  drafted,
  FORMATION,
  spinFor,
} from "./draft.ts";
import type { DraftState } from "./draft.ts";
import { DECADES } from "./types.ts";
import type { SeasonSource, SourcePlayer } from "./types.ts";

const sure = { confidence: "high" as const };
const LINES = ["goalkeeper", "defender", "midfielder", "forward"] as const;
const CLUBS = ["club-a", "club-b", "club-c"];

// draftData: built like spinData, with enough footballers in every line for
// the 1-4-3-3: two per club, decade and line.
const players: SourcePlayer[] = [];
for (const clubId of CLUBS)
  for (const decade of DECADES)
    for (const line of LINES)
      for (const n of [1, 2]) {
        const id = `${clubId}-${decade}-${line}-${n}`;
        players.push({
          id,
          wikidataId: `Q${players.length + 1}`,
          nameLatin: id,
          nameArabic: null,
          nameFrench: null,
          position: line,
          caps: 20,
          goals: 2,
          history: [
            { clubId, from: decade + 2, to: decade + 5, apps: 40, loan: false },
          ],
          provenance: { caps: sure, goals: sure, history: sure },
        });
      }
const source: SeasonSource = {
  clubs: CLUBS.map((id) => ({
    id,
    ligue1: true,
    nameLatin: id,
    nameArabic: null,
    nameFrench: null,
  })),
  honours: [],
  players,
};
const draftData = buildSeasonData(
  source,
  {
    strength: { clubs: { "club-a": 70, "club-b": 60, "club-c": 65 } },
    afcon: { footballers: [] },
  },
  2026,
);

const ctx = { data: draftData, key: "test-key-not-the-real-one" };
const start: DraftState = { id: "d1", picks: [], respin: null };

/** Picks the first candidate of every slot. */
const fullDraft = (state: DraftState): DraftState => {
  let s = state;
  for (let slot = 0; slot < 11; slot++)
    s = applyPick(ctx, s, spinFor(ctx, s, slot).candidates[0].footballerId)!;
  return s;
};

describe("the draft", () => {
  it("the same draft id and picks give the same spins", () =>
    expect(spinFor(ctx, start, 0)).toEqual(spinFor(ctx, start, 0)));
  it("another draft id gives other spins", () => {
    const ids = (id: string) =>
      spinFor(ctx, { id, picks: [], respin: null }, 0);
    expect(
      ["d1", "d2", "d3", "d4"]
        .map((id) => JSON.stringify(ids(id)))
        .every((x, _, all) => x === all[0]),
    ).toBe(false);
  });
  it("one re-spin per game, on the current slot only", () => {
    const r = applyRespin(start)!;
    expect([r.respin, applyRespin(r)]).toEqual([0, null]);
    expect(spinFor(ctx, r, 0)).not.toEqual(spinFor(ctx, start, 0)); // true for this key and id; pinned in the test
    expect(spinFor(ctx, r, 1)).toEqual(spinFor(ctx, start, 1));
  });
  it("FORMATION is 1-4-3-3", () =>
    expect(FORMATION.join()).toBe(
      "goalkeeper,defender,defender,defender,defender,midfielder,midfielder,midfielder,forward,forward,forward",
    ));
  it("a pick must be one of the current spin's candidates", () => {
    expect(applyPick(ctx, start, "not-offered")).toBeNull();
    const first = spinFor(ctx, start, 0).candidates[0].footballerId;
    expect(applyPick(ctx, start, first)).toEqual({
      id: "d1",
      picks: [first],
      respin: null,
    });
  });
  it("a finished draft takes no more picks and no re-spin", () => {
    const done = fullDraft(start);
    expect(done.picks).toHaveLength(11);
    expect(new Set(done.picks).size).toBe(11);
    expect(applyPick(ctx, done, done.picks[0])).toBeNull();
    expect(applyRespin(done)).toBeNull();
  });
  it("drafted replays the spins: the picked candidates, in formation order", () => {
    const done = fullDraft(applyRespin(start)!);
    const team = drafted(ctx, done)!;
    expect(team.map((c) => c.footballerId)).toEqual(done.picks);
    expect(team.map((c) => c.line)).toEqual([...FORMATION]);
  });
  it("drafted is null when a pick is not from its spin", () => {
    expect(
      drafted(ctx, { id: "d1", picks: ["f-anyone"], respin: null }),
    ).toBeNull();
    const done = fullDraft(start);
    expect(drafted(ctx, { ...done, id: "d2" })).toBeNull();
  });
});
