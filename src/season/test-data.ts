import { buildSeasonData } from "@/engine/season/data.ts";
import type { Line } from "@/engine/chkoun/types.ts";
import type { SeasonSource, SourcePlayer } from "@/engine/season/types.ts";
import { handleDraft } from "./draft.ts";
import type { SeasonDeps } from "./draft.ts";

// For tests only: the small source of src/engine/season/data.test.ts,
// extended to every line: two Ligue 1 clubs and enough footballers for a
// full 4-3-3, and a strength table of 16 clubs so a season can be played.

const sure = { confidence: "high" as const };
const player = (
  id: string,
  position: Line,
  clubId: string,
  from: number,
  to: number | null,
): SourcePlayer => ({
  id,
  wikidataId: `Q-${id}`,
  nameLatin: id.toUpperCase(),
  nameArabic: null,
  nameFrench: null,
  position,
  caps: 30,
  goals: 3,
  history: [{ clubId, from, to, apps: 40, loan: false }],
  provenance: { caps: sure, goals: sure, history: sure },
});

const lines: [Line, number][] = [
  ["goalkeeper", 3],
  ["defender", 6],
  ["midfielder", 5],
  ["forward", 5],
];

export const testSource: SeasonSource = {
  clubs: [
    {
      id: "club-a",
      ligue1: true,
      nameLatin: "Club A",
      nameArabic: null,
      nameFrench: null,
    },
    {
      id: "club-b",
      ligue1: true,
      nameLatin: "Club B",
      nameArabic: "نادي ب",
      nameFrench: "Club B",
    },
  ],
  honours: [],
  players: lines.flatMap(([line, n]) =>
    Array.from({ length: n }, (_, i) =>
      player(
        `${line}-${i}`,
        line,
        i % 2 ? "club-b" : "club-a",
        [1995, 2004, 2013, 2021][i % 4],
        i % 4 === 3 ? null : [1999, 2008, 2017][i % 4],
      ),
    ),
  ),
};

/** club-a, club-b and 14 others, from 70 down. */
const strength: Record<string, number> = { "club-a": 70, "club-b": 60 };
for (let i = 0; i < 14; i++)
  strength[`club-${String(i).padStart(2, "0")}`] = 50 + i;

export const testData = buildSeasonData(
  testSource,
  { strength: { clubs: strength }, afcon: { footballers: [] } },
  2026,
);

export const TEST_SEED = "test-seed-not-the-real-one";

/** A draft token after `picks` picks, each the spin's `choice`-th candidate. */
export async function draftToken(
  deps: SeasonDeps,
  picks: number,
  choice = 0,
): Promise<string> {
  const step = async (body: unknown) =>
    (await handleDraft(deps, JSON.stringify(body), { ip: null })).body as {
      token: string;
      spin?: { candidates: { id: string }[] };
    };
  let r = await step({ action: "start" });
  for (let k = 0; k < picks; k++) {
    const offered = r.spin!.candidates;
    r = await step({
      action: "pick",
      token: r.token,
      pick: offered[Math.min(choice, offered.length - 1)].id,
    });
  }
  return r.token;
}
