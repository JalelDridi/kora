// The 30–0 draft rules (D-S3-4, D-S3-7): eleven slots in a fixed 4-3-3 by
// line, each spun from the draft id, the slot and whether it was re-spun, so
// the server replays any draft from its id and picks alone. One re-spin per
// game, on the current slot. The key is a secret passed in by server code.

import type { Line } from "../chkoun/types.ts";
import { hmacRand } from "./prng.ts";
import { spin } from "./spin.ts";
import type { Spin } from "./spin.ts";
import type { Candidate, SeasonData } from "./types.ts";

/** D-S3-7: GK, DEF×4, MID×3, FWD×3. */
export const FORMATION: readonly Line[] = [
  "goalkeeper",
  "defender",
  "defender",
  "defender",
  "defender",
  "midfielder",
  "midfielder",
  "midfielder",
  "forward",
  "forward",
  "forward",
];

export type DraftState = {
  id: string;
  /** Footballer ids, one per slot filled, in formation order. */
  picks: string[];
  /** The slot that was re-spun; null while the re-spin is unused. */
  respin: number | null;
};

export type DraftContext = { data: SeasonData; key: string };

/** The spin a slot shows, given the picks before it. */
export function spinFor(
  ctx: DraftContext,
  state: DraftState,
  slot: number,
): Spin {
  return spin({
    data: ctx.data,
    line: FORMATION[slot],
    taken: new Set(state.picks.slice(0, slot)),
    rand: hmacRand(
      ctx.key,
      `${state.id}|${slot}|${state.respin === slot ? 1 : 0}`,
    ),
  });
}

/** The draft with this footballer in the current slot; null when he is not offered there. */
export function applyPick(
  ctx: DraftContext,
  state: DraftState,
  footballerId: string,
): DraftState | null {
  const slot = state.picks.length;
  if (slot >= FORMATION.length) return null;
  const offered = spinFor(ctx, state, slot).candidates.some(
    (c) => c.footballerId === footballerId,
  );
  return offered ? { ...state, picks: [...state.picks, footballerId] } : null;
}

/** The current slot re-spun; null once the re-spin is used or the draft is full. */
export function applyRespin(state: DraftState): DraftState | null {
  if (state.respin !== null || state.picks.length >= FORMATION.length)
    return null;
  return { ...state, respin: state.picks.length };
}

/** The picked candidates, replayed slot by slot; null when any pick is not from its spin. */
export function drafted(
  ctx: DraftContext,
  state: DraftState,
): Candidate[] | null {
  const { picks, respin } = state;
  if (picks.length > FORMATION.length) return null;
  if (
    respin !== null &&
    (!Number.isInteger(respin) || respin < 0 || respin > picks.length)
  )
    return null;
  const team: Candidate[] = [];
  for (let slot = 0; slot < state.picks.length; slot++) {
    const found = spinFor(ctx, state, slot).candidates.find(
      (c) => c.footballerId === state.picks[slot],
    );
    if (!found) return null;
    team.push(found);
  }
  return team;
}
