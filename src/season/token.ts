import { createHmac, timingSafeEqual } from "node:crypto";
import type { DraftState } from "@/engine/season/draft.ts";

// The 30–0 draft, signed (D-S3-4, T-S3-8): the server keeps no draft, so
// the visitor's browser carries it in a token the server signed: the draft
// id, the picks so far, the re-spun slot and the start time. The picks are
// bounded by the token itself, never counted in Redis. Both keys come from
// CHKOUN_SEED under their own labels, so the seed itself signs nothing.

export type DraftToken = DraftState & {
  /** When the draft started, in ms. */
  t: number;
};

export const DRAFT_TTL_MS = 86_400_000;
export const MAX_DRAFT_TOKEN_LENGTH = 2048;
const VERSION = "v1";

const derive = (seed: string, label: string) =>
  createHmac("sha256", seed).update(label).digest();

/** The signing key and the spins' key, each derived from the seed. */
export function draftKeys(seed: string): { sign: Buffer; spin: string } {
  return {
    sign: derive(seed, "kora/season/draft/v1"),
    spin: derive(seed, "kora/season/spin/v1").toString("hex"),
  };
}

function mac(key: Buffer, signed: string): Buffer {
  return createHmac("sha256", key).update(signed).digest();
}

export function signDraft(state: DraftToken, key: Buffer): string {
  const payload = Buffer.from(
    JSON.stringify({
      id: state.id,
      picks: state.picks,
      respin: state.respin,
      t: state.t,
    }),
  ).toString("base64url");
  const signed = `${VERSION}.${payload}`;
  return `${signed}.${mac(key, signed).toString("base64url")}`;
}

// The shape only: how many picks a token may carry is the endpoint's rule.
function isDraft(value: unknown): value is DraftToken {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    v.id.length > 0 &&
    Array.isArray(v.picks) &&
    v.picks.every((id) => typeof id === "string" && id.length > 0) &&
    (v.respin === null ||
      (Number.isInteger(v.respin) && (v.respin as number) >= 0)) &&
    Number.isInteger(v.t)
  );
}

/** The draft a token carries, or null for anything not signed by `key`. */
export function readDraft(token: string, key: Buffer): DraftToken | null {
  if (token.length > MAX_DRAFT_TOKEN_LENGTH) return null;
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
  if (!isDraft(parsed)) return null;
  return {
    id: parsed.id,
    picks: [...parsed.picks],
    respin: parsed.respin,
    t: parsed.t,
  };
}
