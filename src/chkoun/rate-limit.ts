import { createHash, createHmac } from "node:crypto";
import type { Day } from "@/engine/chkoun/types.ts";
import { chkounKey } from "./kv.ts";
import type { Kv } from "./kv.ts";

// The guess limit (N4 (a)): with Redis on, at most 80 guesses per 10 minutes
// per network address. The address is never stored: the counter's key holds
// the first 16 hex digits of SHA-256(salt + address), and the salt, derived
// from the secret seed, changes every Tunis day. With Redis off, or when it
// fails, there is no limit (fail open); the signed token still bounds a game
// to 8 guesses.

export const GUESS_LIMIT = 80;
export const WINDOW_SECONDS = 600;

/** The day's salt, from CHKOUN_SEED: an address hash cannot be linked across days. */
export function rateLimitSalt(seed: string, day: Day): string {
  return createHmac("sha256", seed)
    .update(`kora/chkoun/rl/${day}`)
    .digest("hex");
}

export type Allowance = { allowed: boolean; retryAfter: number };

export async function allowGuess(
  kv: Kv | null,
  input: { ip: string | null; now: Date; salt: string; env: string },
): Promise<Allowance> {
  const open: Allowance = { allowed: true, retryAfter: 0 };
  if (!kv || !input.ip) return open;
  const windowMs = WINDOW_SECONDS * 1000;
  const window = Math.floor(input.now.getTime() / windowMs);
  const hash = createHash("sha256")
    .update(input.salt + input.ip)
    .digest("hex")
    .slice(0, 16);
  const key = chkounKey(input.env, `rl:${hash}:${window}`);
  try {
    const count = await kv.incr(key);
    if (count === 1) await kv.expire(key, WINDOW_SECONDS);
    if (count <= GUESS_LIMIT) return open;
    const ends = (window + 1) * windowMs;
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((ends - input.now.getTime()) / 1000)),
    };
  } catch {
    return open;
  }
}
