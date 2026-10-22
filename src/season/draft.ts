import { randomBytes } from "node:crypto";
import type { ApiResult } from "@/chkoun/guess.ts";
import { seasonKey } from "@/chkoun/kv.ts";
import type { Kv } from "@/chkoun/kv.ts";
import {
  allowRequest,
  rateLimitSalt,
  SEASON_LIMIT,
} from "@/chkoun/rate-limit.ts";
import { tunisDay } from "@/engine/chkoun/day.ts";
import {
  applyPick,
  applyRespin,
  drafted,
  FORMATION,
  spinFor,
} from "@/engine/season/draft.ts";
import type { DraftContext, DraftState } from "@/engine/season/draft.ts";
import type { SeasonData } from "@/engine/season/types.ts";
import { DRAFT_TTL_MS, draftKeys, readDraft, signDraft } from "./token.ts";
import type { DraftToken } from "./token.ts";
import { candidateView, spinView } from "./views.ts";

// POST /api/season/draft, without Next (D-S3-4, D-S3-14): start a draft,
// pick from the current spin, or re-spin it once. The server keeps no
// draft: the signed token carries it. Only starts are rate limited; picks
// and re-spins are bounded by the token, never counted in Redis (T-S3-8:
// about 2 commands a pick would break the 500K Upstash month). Error bodies
// hold no id.

export const MAX_DRAFT_BODY_BYTES = 2048;

export type SeasonDeps = {
  now: Date;
  data: SeasonData;
  /** Null when Redis is off: no rate limit. */
  kv: Kv | null;
  /** The Redis key prefix's environment. */
  env: string;
  /** CHKOUN_SEED: derives the signing and spin keys, salts the limit. */
  seed: string;
  secureCookie: boolean;
};

type DraftBody =
  | { action: "start" }
  | { action: "pick"; token: string; pick: string }
  | { action: "respin"; token: string };

const fail = (
  status: number,
  body: Record<string, unknown>,
  headers?: Record<string, string>,
): ApiResult => ({ status, body, headers });

const isText = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= max;

function parseBody(raw: string): DraftBody | null {
  if (Buffer.byteLength(raw, "utf8") > MAX_DRAFT_BODY_BYTES) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const { action, token, pick } = v as Record<string, unknown>;
  if (action === "start") return { action };
  if (!isText(token, MAX_DRAFT_BODY_BYTES)) return null;
  if (action === "respin") return { action, token };
  if (action === "pick" && isText(pick, 100)) return { action, token, pick };
  return null;
}

/** The draft's answer: the next spin, or the full squad after 11 picks. */
function answer(ctx: DraftContext, state: DraftToken, key: Buffer): ApiResult {
  const squad = drafted(ctx, state);
  if (!squad) return fail(422, { error: "refused" });
  const body = {
    token: signDraft(state, key),
    squad: squad.map((c) => candidateView(ctx.data, c)),
    respinLeft: state.respin === null,
  };
  const slot = state.picks.length;
  if (slot >= FORMATION.length)
    return { status: 200, body: { ...body, status: "complete" } };
  return {
    status: 200,
    body: {
      ...body,
      status: "drafting",
      spin: spinView(ctx.data, spinFor(ctx, state, slot), slot),
    },
  };
}

export async function handleDraft(
  deps: SeasonDeps,
  raw: string,
  ctx: { ip: string | null },
): Promise<ApiResult> {
  const body = parseBody(raw);
  if (!body) return fail(400, { error: "badRequest" });
  const keys = draftKeys(deps.seed);
  const draft: DraftContext = { data: deps.data, key: keys.spin };

  if (body.action === "start") {
    const limit = await allowRequest(deps.kv, {
      key: (rest) => seasonKey(deps.env, rest),
      limit: SEASON_LIMIT,
      ip: ctx.ip,
      now: deps.now,
      salt: rateLimitSalt(deps.seed, tunisDay(deps.now)),
    });
    if (!limit.allowed)
      return fail(
        429,
        { error: "tooMany", retryAfter: limit.retryAfter },
        { "Retry-After": String(limit.retryAfter) },
      );
    return answer(
      draft,
      {
        id: randomBytes(12).toString("base64url"),
        picks: [],
        respin: null,
        t: deps.now.getTime(),
      },
      keys.sign,
    );
  }

  const token = readDraft(body.token, keys.sign);
  if (!token) return fail(403, { error: "forbidden" });
  if (deps.now.getTime() - token.t > DRAFT_TTL_MS)
    return fail(409, { error: "expired" });
  // The counts the signed token carries, checked before any work.
  const respins = token.respin !== null ? 1 : 0;
  if (token.picks.length > FORMATION.length || respins > 1)
    return fail(400, { error: "refused" });

  const state: DraftState = {
    id: token.id,
    picks: token.picks,
    respin: token.respin,
  };
  const next =
    body.action === "pick"
      ? applyPick(draft, state, body.pick)
      : applyRespin(state);
  if (!next) return fail(422, { error: "refused" });
  return answer(draft, { ...next, t: token.t }, keys.sign);
}
