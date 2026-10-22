import { createHash, createHmac } from "node:crypto";
import type { Day } from "@/engine/chkoun/types.ts";
import { chkounKey } from "./kv.ts";
import type { Kv } from "./kv.ts";

// The guess limit (N4 (a)): with Redis on, at most 80 guesses per 10 minutes
// per network address. The address is never stored: the counter's key holds
// the first 16 hex digits of SHA-256(salt + address), and the salt, derived
// from the secret seed, changes every Tunis day. With Redis off, or when it
// fails, there is no limit (fail open); the signed token still bounds a game
// to 8 guesses. allowRequest is the same limit for any game, under that
// game's own keys and count.

export const GUESS_LIMIT = 80;
/** 30–0's requests per address and window, counted apart from Chkoun?'s. */
export const SEASON_LIMIT = 80;
export const WINDOW_SECONDS = 600;

/** The day's salt, from CHKOUN_SEED: an address hash cannot be linked across days. */
export function rateLimitSalt(seed: string, day: Day): string {
  return createHmac("sha256", seed)
    .update(`kora/chkoun/rl/${day}`)
    .digest("hex");
}

export type Allowance = { allowed: boolean; retryAfter: number };

/**
 * A per-address limit under one game's keys (`key` builds them): at most
 * `limit` requests per window. Fails open without Redis, without an address,
 * or when Redis fails.
 */
export async function allowRequest(
  kv: Kv | null,
  input: {
    key: (rest: string) => string;
    limit: number;
    ip: string | null;
    now: Date;
    salt: string;
  },
): Promise<Allowance> {
  const open: Allowance = { allowed: true, retryAfter: 0 };
  if (!kv || !input.ip) return open;
  const windowMs = WINDOW_SECONDS * 1000;
  const window = Math.floor(input.now.getTime() / windowMs);
  const hash = createHash("sha256")
    .update(input.salt + input.ip)
    .digest("hex")
    .slice(0, 16);
  const key = input.key(`rl:${hash}:${window}`);
  try {
    // The count and its expiry in one transaction: no counter outlives its
    // window. Each call renews the expiry; the key names its window, so a
    // renewed one is never read again.
    const count = await kv.incrEx(key, WINDOW_SECONDS);
    if (count <= input.limit) return open;
    const ends = (window + 1) * windowMs;
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((ends - input.now.getTime()) / 1000)),
    };
  } catch {
    return open;
  }
}

/** Chkoun?'s guesses (and /today): GUESS_LIMIT under kora:{env}:chkoun:. */
export function allowGuess(
  kv: Kv | null,
  input: { ip: string | null; now: Date; salt: string; env: string },
): Promise<Allowance> {
  return allowRequest(kv, {
    key: (rest) => chkounKey(input.env, rest),
    limit: GUESS_LIMIT,
    ip: input.ip,
    now: input.now,
    salt: input.salt,
  });
}
