import type { ApiResult } from "@/chkoun/guess.ts";
import type { Kv } from "@/chkoun/kv.ts";
import { tunisDay } from "@/engine/chkoun/day.ts";
import type { Line } from "@/engine/chkoun/types.ts";
import {
  boardScore,
  canonicalXi,
  rateXi,
  simulateSeason,
} from "@/engine/season/simulate.ts";
import type { Season } from "@/engine/season/simulate.ts";
import type { Names, SeasonData } from "@/engine/season/types.ts";
import { decodeXi } from "./replay.ts";
import { BOARD_KEEP, boardKey } from "./store.ts";
import { candidateView } from "./views.ts";

// GET /api/season/board, without Next (D-S3-10): today's top sides. Redis
// only says which squads played today; no score is read from it. Every
// member is played again with today's data and ranked by the server's own
// boardScore (then by code, for a stable order), so a forged score moves
// nothing. A member that no longer decodes, or is not its squad's canonical
// code, is skipped. Read-only. Redis off or failing: status "off", no rows.
// Every answer is public and cached 30 s at the CDN.

export const BOARD_SHOWN = 20;
export const BOARD_CACHE = "public, s-maxage=30, stale-while-revalidate=30";

export type BoardRow = {
  rank: number;
  code: string;
  w: number;
  d: number;
  l: number;
  points: number;
  gf: number;
  ga: number;
  rating: number;
  squad: { id: string; names: Names; line: Line }[];
};

export type BoardDeps = {
  now: Date;
  data: SeasonData;
  /** Null when Redis is off. */
  kv: Kv | null;
  env: string;
};

export async function handleBoard(deps: BoardDeps): Promise<ApiResult> {
  const day = tunisDay(deps.now);
  const answer = (status: "on" | "off", rows: BoardRow[]): ApiResult => ({
    status: 200,
    body: { day, status, rows },
    headers: { "Cache-Control": BOARD_CACHE },
  });
  if (!deps.kv) return answer("off", []);
  let members: { member: string }[];
  try {
    members = await deps.kv.ztop(boardKey(deps.env, day), BOARD_KEEP);
  } catch {
    return answer("off", []);
  }

  const played: { code: string; season: Season; squad: BoardRow["squad"] }[] =
    [];
  // Sorted-set members are unique, so no code appears twice here.
  for (const { member } of members) {
    const picks = decodeXi(deps.data, member);
    if (!picks) continue;
    const xi = rateXi(deps.data, picks);
    if (canonicalXi(xi) !== member) continue;
    played.push({
      code: member,
      season: simulateSeason({ day, xi, table: deps.data.table }),
      squad: picks.map((c) => ({
        id: c.footballerId,
        names: candidateView(deps.data, c).names,
        line: c.line,
      })),
    });
  }
  played.sort(
    (a, b) =>
      boardScore(b.season) - boardScore(a.season) ||
      (a.code < b.code ? -1 : a.code > b.code ? 1 : 0),
  );
  return answer(
    "on",
    played.slice(0, BOARD_SHOWN).map(({ code, season: s, squad }, i) => ({
      rank: i + 1,
      code,
      w: s.w,
      d: s.d,
      l: s.l,
      points: s.points,
      gf: s.gf,
      ga: s.ga,
      rating: s.rating,
      squad,
    })),
  );
}
