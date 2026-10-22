import type { ApiResult } from "@/chkoun/guess.ts";
import { tunisDay } from "@/engine/chkoun/day.ts";
import type { Day } from "@/engine/chkoun/types.ts";
import { readCode, slotCode } from "@/engine/season/data.ts";
import { FORMATION } from "@/engine/season/draft.ts";
import {
  canonicalXi,
  rateXi,
  simulateSeason,
} from "@/engine/season/simulate.ts";
import type { Season } from "@/engine/season/simulate.ts";
import type { Candidate, Names, SeasonData } from "@/engine/season/types.ts";
import { candidateView } from "./views.ts";
import type { CandidateView } from "./views.ts";

// GET /api/season/replay?d=&xi=, without Next (D-S3-9): a shared season,
// played again on the server from its day and its squad's code. The same
// squad on the same day always gets the same season, so the answer is
// public and cached a day at the CDN. Only days up to today in Tunis.

export type SeasonView = {
  day: Day;
  code: string;
  season: Season;
  squad: CandidateView[];
  clubs: Record<string, Names>;
};

export const REPLAY_CACHE =
  "public, s-maxage=86400, stale-while-revalidate=3600";
/** 11 codes of at most 100 characters and their separators. */
const MAX_XI_LENGTH = 1200;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The day's season for these 11 candidates, with the squad in code order and the clubs' names. */
export function seasonView(
  data: SeasonData,
  day: Day,
  picks: readonly Candidate[],
): SeasonView {
  const xi = rateXi(data, picks);
  const code = canonicalXi(xi);
  const season = simulateSeason({ day, xi, table: data.table });
  const byCode = new Map(picks.map((c) => [slotCode(data, c), c]));
  const squad = code.split("~").map((k) => candidateView(data, byCode.get(k)!));
  const clubs: Record<string, Names> = {};
  const ids = [
    season.replaces,
    ...season.matches.map((m) => m.opponent),
    ...picks.map((c) => c.clubId),
  ];
  for (const id of ids) {
    const names = data.clubs.get(id);
    if (names) clubs[id] = names;
  }
  return { day, code, season, squad, clubs };
}

/**
 * The squad a share code names: 11 codes `{id}_{k}` joined by `~`, each in
 * its formation line, 11 different footballers; null for anything else.
 */
export function decodeXi(data: SeasonData, xi: string): Candidate[] | null {
  if (xi.length > MAX_XI_LENGTH) return null;
  const codes = xi.split("~");
  if (codes.length !== FORMATION.length) return null;
  const picks: Candidate[] = [];
  const seen = new Set<string>();
  for (const [slot, code] of codes.entries()) {
    if (code.includes(".")) return null;
    const c = readCode(data, code);
    if (!c || c.line !== FORMATION[slot] || seen.has(c.footballerId))
      return null;
    seen.add(c.footballerId);
    picks.push(c);
  }
  return picks;
}

/** A real calendar day written YYYY-MM-DD. */
function isDay(d: string): d is Day {
  if (!DAY.test(d)) return false;
  const t = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().startsWith(d);
}

export function handleReplay(
  deps: { now: Date; data: SeasonData },
  query: { d: string | null; xi: string | null },
): ApiResult {
  const { d, xi } = query;
  if (d === null || xi === null)
    return { status: 400, body: { error: "badRequest" } };
  if (!isDay(d)) return { status: 400, body: { error: "badRequest" } };
  if (d > tunisDay(deps.now))
    return { status: 404, body: { error: "notFound" } };
  const picks = decodeXi(deps.data, xi);
  if (!picks) return { status: 400, body: { error: "badRequest" } };
  return {
    status: 200,
    body: seasonView(deps.data, d, picks),
    headers: { "Cache-Control": REPLAY_CACHE },
  };
}
