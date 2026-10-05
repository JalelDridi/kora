import {
  addDays,
  FIRST_DAY,
  nextMidnight,
  puzzleNumber,
  tunisDay,
} from "@/engine/chkoun/day.ts";
import type { ApiResult, GameDeps, Store } from "./guess.ts";
import { readToday } from "./store.ts";
import { readVisitorId } from "./visitor.ts";

// GET /api/chkoun/today, without Next: the day's number, when it ends, where
// results are kept, and, for a visitor who has already finished today's
// game on the server, his game and record. The answer's card goes only to
// a visitor whose finished game the server holds.

export type TodayDeps = Pick<
  GameDeps,
  "now" | "puzzle" | "footballers" | "kv" | "env" | "firstDay"
>;

export async function handleToday(
  deps: TodayDeps,
  cookie: string | null,
): Promise<ApiResult> {
  const first = deps.firstDay ?? FIRST_DAY;
  const day = tunisDay(deps.now);
  const number = puzzleNumber(day, first);
  if (number < 1)
    return {
      status: 200,
      body: {
        status: "soon",
        day,
        startsAt: nextMidnight(addDays(first, -1)).toISOString(),
      },
    };
  const endsAt = nextMidnight(day).toISOString();
  let store: Store = deps.kv ? "server" : "device";
  const puzzle = await deps.puzzle(deps.now);
  if (!puzzle || puzzle.day !== day)
    return {
      status: 200,
      body: { status: "closed", number, day, endsAt, store },
    };

  const visitorId = readVisitorId(cookie);
  if (!deps.kv || !visitorId)
    return {
      status: 200,
      body: { status: "open", number, day, endsAt, store },
    };
  const mine = await readToday(deps.kv, deps.env, day, visitorId);
  if (mine === "unavailable") {
    store = "device";
    return {
      status: 200,
      body: { status: "open", number, day, endsAt, store },
    };
  }
  const finished = mine.finished
    ? {
        grid: mine.finished.grid,
        solved: mine.finished.solved,
        guesses: mine.finished.guesses,
        card: deps.footballers.card(puzzle.playerId),
      }
    : undefined;
  return {
    status: 200,
    body: {
      status: "open",
      number,
      day,
      endsAt,
      store,
      ...(finished ? { finished } : {}),
      ...(mine.stats ? { stats: mine.stats } : {}),
    },
  };
}
