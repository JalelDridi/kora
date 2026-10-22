// Seeded randomness for 30–0. Pure and deterministic: the same bytes always
// give the same numbers, so a draft replays on the server from its id and
// picks alone. sfc32 (Chris Doty-Humphrey's Small Fast Counting generator)
// is seeded from a SHA-256 digest or an HMAC; the key is a secret passed in by
// server code only, nothing here reads it.

import { createHash, createHmac } from "node:crypto";

/** Uniform in [0, 1). */
export type Rand = () => number;

/** sfc32 seeded from the first 16 bytes (four little-endian words). */
export function sfc32(bytes: Uint8Array): Rand {
  if (bytes.length < 16) throw new Error("sfc32: needs 16 bytes");
  const view = new DataView(bytes.buffer, bytes.byteOffset, 16);
  let a = view.getUint32(0, true);
  let b = view.getUint32(4, true);
  let c = view.getUint32(8, true);
  let d = view.getUint32(12, true);
  const next = () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  // Mix the seed in before the first number is used.
  for (let i = 0; i < 12; i++) next();
  return next;
}

/** A generator seeded by SHA-256(text). */
export const hashRand = (text: string): Rand =>
  sfc32(createHash("sha256").update(text, "utf8").digest());

/** A generator seeded by HMAC-SHA-256(key, label): unguessable without the key. */
export const hmacRand = (key: string, label: string): Rand =>
  sfc32(createHmac("sha256", key).update(label, "utf8").digest());

/** A shuffled copy (Fisher–Yates). */
export function shuffle<T>(items: readonly T[], rand: Rand): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The Poisson(λ) count for a uniform u, by inverse CDF: the least k whose
 * cumulative probability passes u, at most `max`. For a fixed u it never
 * decreases as λ rises, since every cumulative probability falls.
 */
export function poisson(lambda: number, u: number, max: number): number {
  let k = 0;
  let p = Math.exp(-lambda);
  let cdf = p;
  while (cdf <= u && k < max) {
    k += 1;
    p *= lambda / k;
    cdf += p;
  }
  return k;
}
