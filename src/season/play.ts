import type { ApiResult, Store } from "@/chkoun/guess.ts";
import { seasonKey } from "@/chkoun/kv.ts";
import {
  allowRequest,
  rateLimitSalt,
  SEASON_LIMIT,
} from "@/chkoun/rate-limit.ts";
import { newVisitorCookie, readVisitorId } from "@/chkoun/visitor.ts";
import type { VisitorCookie } from "@/chkoun/visitor.ts";
import { tunisDay } from "@/engine/chkoun/day.ts";
import { drafted, FORMATION } from "@/engine/season/draft.ts";
import { boardScore } from "@/engine/season/simulate.ts";
import { MAX_DRAFT_BODY_BYTES } from "./draft.ts";
import type { SeasonDeps } from "./draft.ts";
import { seasonView } from "./replay.ts";
import { playedKey, recordSeason } from "./store.ts";
import { DRAFT_TTL_MS, draftKeys, readDraft } from "./token.ts";

// POST /api/season/play, without Next (D-S3-9, D-S3-11): a complete draft
// token in, its season out. The squad and its ratings are the server's own,
// replayed from the signed token; nothing else in the body is read. A token
// is played once (SET NX on its draft id). With Redis on, the visitor's
// first season of the day is kept and enters the day's board; any Redis
// failure only keeps the season on the device. Error bodies hold no id.

/**
 * How long a played draft stays marked: as long as its token can live, so
 * it is derived from the token's lifetime (one source of truth).
 */
export const PLAYED_TTL_SECONDS = DRAFT_TTL_MS / 1000;

const fail = (
  status: number,
  body: Record<string, unknown>,
  headers?: Record<string, string>,
): ApiResult => ({ status, body, headers });

function parseToken(raw: string): string | null {
  if (Buffer.byteLength(raw, "utf8") > MAX_DRAFT_BODY_BYTES) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const { token } = v as Record<string, unknown>;
  return typeof token === "string" && token.length > 0 ? token : null;
}

export async function handlePlay(
  deps: SeasonDeps,
  raw: string,
  ctx: { cookie: string | null; ip: string | null },
): Promise<ApiResult> {
  const text = parseToken(raw);
  if (!text) return fail(400, { error: "badRequest" });
  const keys = draftKeys(deps.seed);
  const token = readDraft(text, keys.sign);
  if (!token) return fail(403, { error: "forbidden" });
  if (deps.now.getTime() - token.t > DRAFT_TTL_MS)
    return fail(409, { error: "expired" });
  if (token.picks.length > FORMATION.length)
    return fail(400, { error: "refused" });
  const picks = drafted(
    { data: deps.data, key: keys.spin },
    { id: token.id, picks: token.picks, respin: token.respin },
  );
  if (!picks || picks.length < FORMATION.length)
    return fail(422, { error: "refused" });

  const day = tunisDay(deps.now);
  const limit = await allowRequest(deps.kv, {
    key: (rest) => seasonKey(deps.env, rest),
    limit: SEASON_LIMIT,
    ip: ctx.ip,
    now: deps.now,
    salt: rateLimitSalt(deps.seed, day),
  });
  if (!limit.allowed)
    return fail(
      429,
      { error: "tooMany", retryAfter: limit.retryAfter },
      { "Retry-After": String(limit.retryAfter) },
    );

  // Redis off: nothing is recorded, so a replayed token changes nothing.
  let redisUp = deps.kv !== null;
  if (deps.kv) {
    try {
      const fresh = await deps.kv.set(playedKey(deps.env, token.id), "1", {
        nx: true,
        ex: PLAYED_TTL_SECONDS,
      });
      if (!fresh) return fail(409, { error: "already-played" });
    } catch {
      redisUp = false;
    }
  }

  const view = seasonView(deps.data, day, picks);
  let store: Store = "device";
  let board: { counted: boolean; rank: number | null } = {
    counted: false,
    rank: null,
  };
  let setCookie: VisitorCookie | undefined;
  if (deps.kv && redisUp) {
    const known = readVisitorId(ctx.cookie);
    const fresh = known ? undefined : newVisitorCookie(deps.secureCookie);
    const { season } = view;
    const recorded = await recordSeason(deps.kv, {
      env: deps.env,
      day,
      visitorId: known ?? fresh!.value,
      entry: {
        xi: view.code,
        w: season.w,
        d: season.d,
        l: season.l,
        gf: season.gf,
        ga: season.ga,
        points: season.points,
        rating: season.rating,
      },
      score: boardScore(season),
    });
    if (recorded !== "unavailable") {
      store = "server";
      board = { counted: recorded.first, rank: recorded.rank };
      setCookie = fresh;
    }
  }
  return { status: 200, body: { ...view, store, board }, setCookie };
}
