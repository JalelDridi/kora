import { createHmac, timingSafeEqual } from "node:crypto";
import type { Day } from "@/engine/chkoun/types.ts";

// The Chkoun? game state, signed (plan Task 8): the server keeps no state
// per game, so the visitor's browser carries the guesses so far in a token
// the server signed. Nothing about the answer is inside: the puzzle number,
// the day and the guessed footballers' ids, in order. Forged or edited
// tokens fail the HMAC; another day's token is refused by the endpoint.

export type GameState = {
  /** The puzzle number. */
  n: number;
  /** The Tunis day the game belongs to. */
  d: Day;
  /** Guessed footballer ids, in order (at most 8). */
  g: string[];
};

export const MAX_TOKEN_LENGTH = 1024;
export const MAX_GUESSES = 8;
const VERSION = "v1";

/** The signing key, derived from CHKOUN_SEED so the seed itself signs nothing. */
export function tokenKey(seed: string): Buffer {
  return createHmac("sha256", seed).update("kora/chkoun/token/v1").digest();
}

function mac(key: Buffer, signed: string): Buffer {
  return createHmac("sha256", key).update(signed).digest();
}

export function signToken(state: GameState, key: Buffer): string {
  const payload = Buffer.from(
    JSON.stringify({ n: state.n, d: state.d, g: state.g }),
  ).toString("base64url");
  const signed = `${VERSION}.${payload}`;
  return `${signed}.${mac(key, signed).toString("base64url")}`;
}

function isState(value: unknown): value is GameState {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const v = value as Record<string, unknown>;
  return (
    Number.isInteger(v.n) &&
    typeof v.d === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v.d) &&
    Array.isArray(v.g) &&
    v.g.length <= MAX_GUESSES &&
    v.g.every((id) => typeof id === "string" && id.length > 0)
  );
}

/** The state a token carries, or null for anything not signed by `key`. */
export function readToken(token: string, key: Buffer): GameState | null {
  if (token.length > MAX_TOKEN_LENGTH) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  const [, payload, sig] = parts;
  const given = Buffer.from(sig, "base64url");
  const expected = mac(key, `${VERSION}.${payload}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!isState(parsed)) return null;
  return { n: parsed.n, d: parsed.d, g: [...parsed.g] };
}
