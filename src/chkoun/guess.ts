import { FIRST_DAY, puzzleNumber, tunisDay } from "@/engine/chkoun/day.ts";
import type { Stats } from "@/engine/chkoun/stats.ts";
import { colourKey, compare } from "@/engine/chkoun/tiles.ts";
import type { Day, TileRow } from "@/engine/chkoun/types.ts";
import type { Card, Footballers } from "./attributes.ts";
import type { Kv } from "./kv.ts";
import { allowGuess, rateLimitSalt } from "./rate-limit.ts";
import { recordFinish } from "./store.ts";
import { MAX_GUESSES, readToken, signToken, tokenKey } from "./token.ts";
import type { GameState } from "./token.ts";
import { newVisitorCookie, readVisitorId } from "./visitor.ts";
import type { VisitorCookie } from "./visitor.ts";

// POST /api/chkoun/guess, without Next (plan Task 9): the route only passes
// the request in and the answer out. The server keeps no game: the signed
// token carries the guesses so far. Before a game ends, no response holds
// the answer's id, name, photo or card; error bodies hold no id at all.

export const MAX_BODY_BYTES = 2048;

export type Puzzle = { day: Day; number: number; playerId: string };

export type GameDeps = {
  now: Date;
  puzzle: (now: Date) => Promise<Puzzle | null>;
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
};

export type Store = "server" | "device";

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
  if (body.n !== number) return fail(409, { error: "newDay", number });

  let state: GameState = { n: number, d: today, g: [] };
  if (body.token !== null) {
    const read = readToken(body.token, tokenKey(deps.seed));
    if (!read) return fail(403, { error: "forbidden" });
    if (read.d !== today || read.n !== number)
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

  const puzzle = await deps.puzzle(deps.now);
  const answer = puzzle ? deps.footballers.facts.get(puzzle.playerId) : null;
  if (!puzzle || !answer || puzzle.day !== today)
    return fail(503, { error: "closed" });

  if (state.g.includes(answer.id) || state.g.length >= MAX_GUESSES)
    return fail(422, { error: "finished" });
  if (!deps.footballers.guessable.has(body.guess))
    return fail(422, { error: "unknown" });
  if (state.g.includes(body.guess)) return fail(422, { error: "repeated" });

  const guesses = [...state.g, body.guess];
  const facts = (id: string) => deps.footballers.facts.get(id)!;
  const row: TileRow = compare(facts(body.guess), answer, today);
  const won = body.guess === answer.id;
  const done = won || guesses.length === MAX_GUESSES;
  const token = signToken(
    { n: number, d: today, g: guesses },
    tokenKey(deps.seed),
  );
  const status = won ? "won" : done ? "lost" : "playing";

  if (!done)
    return {
      status: 200,
      body: {
        token,
        row,
        guesses: guesses.length,
        status,
        store: deps.kv ? "server" : "device",
      },
    };

  const card: Card | null = deps.footballers.card(answer.id);
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
