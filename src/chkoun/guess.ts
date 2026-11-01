import {
  addDays,
  FIRST_DAY,
  puzzleNumber,
  tunisDay,
} from "@/engine/chkoun/day.ts";
import { firstLetter, HINT_AFTER } from "@/engine/chkoun/hint.ts";
import type { Hint } from "@/engine/chkoun/hint.ts";
import type { Stats } from "@/engine/chkoun/stats.ts";
import { colourKey, compare } from "@/engine/chkoun/tiles.ts";
import type { Day, TileRow } from "@/engine/chkoun/types.ts";
import type { Card, Footballers } from "./attributes.ts";
import type { Kv } from "./kv.ts";
import { allowGuess, rateLimitSalt } from "./rate-limit.ts";
import { recordFinish } from "./store.ts";
import {
  MAX_GUESSES,
  pastTokenKey,
  readToken,
  signToken,
  tokenKey,
} from "./token.ts";
import type { GameState } from "./token.ts";
import { newVisitorCookie, readVisitorId } from "./visitor.ts";
import type { VisitorCookie } from "./visitor.ts";

// POST /api/chkoun/guess, without Next (plan Task 9): the route only passes
// the request in and the answer out. The server keeps no game: the signed
// token carries the guesses so far. Before a game ends, no response holds
// the answer's id, name, photo or card; error bodies hold no id at all.
// Yesterday's number plays yesterday's footballer (mobile polish M7): its
// token is signed with the past key, and it records nothing, anywhere.
// From the 5th guess on, a game still under way gets the first letter of
// each of the answer's name forms (M8), one letter and never more; the
// final answer carries the card instead.

export const MAX_BODY_BYTES = 2048;

export type Puzzle = { day: Day; number: number; playerId: string };

export type GameDeps = {
  now: Date;
  puzzle: (now: Date) => Promise<Puzzle | null>;
  /** A past day's puzzle, read and never drawn (M7); none: no past game. */
  pastPuzzle?: (day: Day) => Promise<Puzzle | null>;
  footballers: Footballers;
  /** Null when Redis is off: the game is kept on the device only. */
  kv: Kv | null;
  /** CHKOUN_SEED: signs the tokens and salts the rate limit. */
  seed: string;
  /** The Redis key prefix's environment. */
  env: string;
  firstDay?: Day;
  /** Secure cookies everywhere but a plain-HTTP local server. */
  secureCookie: boolean;
};

export type ApiResult = {
  status: number;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
  setCookie?: VisitorCookie;
  /** Several cookies, each its own Set-Cookie header (the widened id). */
  setCookies?: VisitorCookie[];
};

export type Store = "server" | "device";

/** The first letter of each name form, or null without a card. */
function hintFor(footballers: Footballers, id: string): Hint | null {
  const card = footballers.card(id);
  const latin = card ? firstLetter(card.nameLatin) : null;
  if (!card || latin === null) return null;
  return {
    latin,
    arabic: firstLetter(card.nameArabic),
    french: firstLetter(card.nameFrench),
  };
}

type GuessBody = { n: number; token: string | null; guess: string };

const fail = (
  status: number,
  body: Record<string, unknown>,
  headers?: Record<string, string>,
): ApiResult => ({ status, body, headers });

function parseBody(raw: string): GuessBody | null {
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const { n, token, guess } = v as Record<string, unknown>;
  if (!Number.isInteger(n)) return null;
  if (token !== null && typeof token !== "string") return null;
  if (typeof guess !== "string" || guess.length === 0 || guess.length > 100)
    return null;
  return { n: n as number, token, guess };
}

export async function handleGuess(
  deps: GameDeps,
  raw: string,
  ctx: { cookie: string | null; ip: string | null },
): Promise<ApiResult> {
  const body = parseBody(raw);
  if (!body) return fail(400, { error: "badRequest" });

  const today = tunisDay(deps.now);
  const number = puzzleNumber(today, deps.firstDay ?? FIRST_DAY);
  if (number < 1) return fail(409, { error: "soon" });
  // Yesterday's number, from puzzle 2 on, plays yesterday's footballer.
  const past =
    deps.pastPuzzle !== undefined && body.n === number - 1 && body.n >= 1;
  if (body.n !== number && !past) return fail(409, { error: "newDay", number });
  const day = past ? addDays(today, -1) : today;
  const key = past ? pastTokenKey(deps.seed) : tokenKey(deps.seed);

  let state: GameState = { n: body.n, d: day, g: [] };
  if (body.token !== null) {
    const read = readToken(body.token, key);
    if (!read) {
      // A today game that crosses midnight posts its number, now
      // yesterday's, with a today-key token of that day: the day has
      // turned, so the page reloads it (409), as before M7. Anything else
      // that the past key does not read stays refused (T-MP-5).
      const turned = past ? readToken(body.token, tokenKey(deps.seed)) : null;
      if (turned && turned.d === day && turned.n === body.n)
        return fail(409, { error: "newDay", number });
      return fail(403, { error: "forbidden" });
    }
    if (read.d !== day || read.n !== body.n)
      return fail(409, { error: "newDay", number });
    state = read;
  }

  const limit = await allowGuess(deps.kv, {
    ip: ctx.ip,
    now: deps.now,
    salt: rateLimitSalt(deps.seed, today),
    env: deps.env,
  });
  if (!limit.allowed)
    return fail(
      429,
      { error: "tooMany", retryAfter: limit.retryAfter },
      { "Retry-After": String(limit.retryAfter) },
    );

  const puzzle = past
    ? await deps.pastPuzzle!(day)
    : await deps.puzzle(deps.now);
  const answer = puzzle ? deps.footballers.facts.get(puzzle.playerId) : null;
  if (!puzzle || !answer || puzzle.day !== day)
    return fail(503, { error: "closed" });

  if (state.g.includes(answer.id) || state.g.length >= MAX_GUESSES)
    return fail(422, { error: "finished" });
  if (!deps.footballers.guessable.has(body.guess))
    return fail(422, { error: "unknown" });
  if (state.g.includes(body.guess)) return fail(422, { error: "repeated" });

  const guesses = [...state.g, body.guess];
  const facts = (id: string) => deps.footballers.facts.get(id)!;
  const row: TileRow = compare(facts(body.guess), answer, day);
  const won = body.guess === answer.id;
  const done = won || guesses.length === MAX_GUESSES;
  const token = signToken({ n: body.n, d: day, g: guesses }, key);
  const status = won ? "won" : done ? "lost" : "playing";

  if (!done) {
    const hint =
      guesses.length >= HINT_AFTER
        ? hintFor(deps.footballers, answer.id)
        : null;
    return {
      status: 200,
      body: {
        token,
        row,
        guesses: guesses.length,
        status,
        store: past || !deps.kv ? "device" : "server",
        ...(past ? { past: true } : {}),
        ...(hint ? { hint } : {}),
      },
    };
  }

  const card: Card | null = deps.footballers.card(answer.id);
  // Yesterday's game ends here: the card, and nothing kept on the server,
  // no record, no streak, no cookie (M7).
  if (past)
    return {
      status: 200,
      body: {
        token,
        row,
        guesses: guesses.length,
        status,
        card,
        store: "device",
        past: true,
      },
    };
  let store: Store = "device";
  let stats: Stats | undefined;
  let setCookie: VisitorCookie | undefined;
  if (deps.kv) {
    const known = readVisitorId(ctx.cookie);
    const fresh = known ? undefined : newVisitorCookie(deps.secureCookie);
    const visitorId = known ?? fresh!.value;
    const recorded = await recordFinish(deps.kv, deps.env, {
      day: today,
      n: number,
      visitorId,
      solved: won,
      guesses: guesses.length,
      grid: guesses.map((id) => colourKey(compare(facts(id), answer, today))),
    });
    if (recorded !== "unavailable") {
      store = "server";
      stats = recorded;
      setCookie = fresh;
    }
  }
  return {
    status: 200,
    body: {
      token,
      row,
      guesses: guesses.length,
      status,
      card,
      ...(stats ? { stats } : {}),
      store,
    },
    setCookie,
  };
}
