import {
  addDays,
  FIRST_DAY,
  nextMidnight,
  puzzleNumber,
  tunisDay,
} from "@/engine/chkoun/day.ts";
import type { ApiResult, GameDeps, Store } from "./guess.ts";
import { allowGuess, rateLimitSalt } from "./rate-limit.ts";
import { readToday } from "./store.ts";
import { readVisitorId, widenVisitorCookie } from "./visitor.ts";

// GET /api/chkoun/today, without Next: the day's number, when it ends, where
// results are kept, yesterday's number and day when there was one (mobile
// polish M7), and, for a visitor who has already finished today's game on
// the server, his game and record. The answer's card goes only to
// a visitor whose finished game the server holds.

export type TodayDeps = Pick<
  GameDeps,
  "now" | "puzzle" | "footballers" | "kv" | "env" | "firstDay" | "secureCookie"
> & {
  /** CHKOUN_SEED, for the rate limit's salt; without it, no limit. */
  seed?: string;
};

export async function handleToday(
  deps: TodayDeps,
  cookie: string | null,
  ip: string | null = null,
): Promise<ApiResult> {
  // Read before any answer, so every one of them, soon and closed included,
  // moves a known visitor's id to the path every game shares (T-S3-9).
  const visitorId = readVisitorId(cookie);
  const result = await answerToday(deps, visitorId, ip);
  return deps.kv && visitorId
    ? {
        ...result,
        setCookies: widenVisitorCookie(visitorId, deps.secureCookie),
      }
    : result;
}

async function answerToday(
  deps: TodayDeps,
  visitorId: string | null,
  ip: string | null,
): Promise<ApiResult> {
  const first = deps.firstDay ?? FIRST_DAY;
  const day = tunisDay(deps.now);
  // The guesses' per-address limit (N4), shared, when Redis is on: a loop
  // on /today must not keep the database awake (review 2a, G1).
  if (deps.seed) {
    const limit = await allowGuess(deps.kv, {
      ip,
      now: deps.now,
      salt: rateLimitSalt(deps.seed, day),
      env: deps.env,
    });
    if (!limit.allowed)
      return {
        status: 429,
        body: { error: "tooMany", retryAfter: limit.retryAfter },
        headers: { "Retry-After": String(limit.retryAfter) },
      };
  }
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

  // Yesterday's game, from puzzle 2 on: its number and day only, no read.
  const yesterday =
    number - 1 >= 1
      ? { yesterday: { number: number - 1, day: addDays(day, -1) } }
      : {};
  if (!deps.kv || !visitorId)
    return {
      status: 200,
      body: { status: "open", number, day, endsAt, store, ...yesterday },
    };
  const mine = await readToday(deps.kv, deps.env, day, visitorId);
  if (mine === "unavailable") {
    store = "device";
    return {
      status: 200,
      body: { status: "open", number, day, endsAt, store, ...yesterday },
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
      ...yesterday,
      ...(finished ? { finished } : {}),
      ...(mine.stats ? { stats: mine.stats } : {}),
    },
  };
}
