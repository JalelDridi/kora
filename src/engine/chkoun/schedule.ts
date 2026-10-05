// The Chkoun? calendar draw (D-S2-2, D-S2-4, D-S2-5, N5). Pure and
// deterministic: the same seed, day and candidates always give the same
// footballer, so a deploy and the nightly top-up agree. The seed is a secret
// (CHKOUN_SEED) passed in by server code only; nothing here reads it.

import { createHmac } from "node:crypto";
import { addDays, dayDiff, isFrozen, weekday } from "./day.ts";
import type { Day } from "./types.ts";

export type Tier = "A" | "B" | "C";
/** `tier` may be any fame tier; only A, B and C are ever drawn (D-S2-4). */
export type Candidate = { id: string; tier: string };
export type CalendarSource = "generator" | "pin" | "reserve";
export type CalendarRow = {
  day: Day;
  playerId: string;
  source: CalendarSource;
};

/** D-S2-5: no repeat for as long as the eligible list allows, up to 120 days. */
export const MAX_WINDOW = 120;

const TIERS: readonly Tier[] = ["A", "B", "C"];

/**
 * N5 (a), by weekday (0 = Sunday): Monday to Thursday 60% A, 40% B; Friday
 * 40% A, 60% B; Saturday and Sunday 30% B, 70% C. D is never an answer, C
 * only at weekends (Tunis dates). A pinned day ignores tiers.
 */
export const TIER_WEIGHTS: readonly Record<Tier, number>[] = [
  { A: 0, B: 0.3, C: 0.7 },
  { A: 0.6, B: 0.4, C: 0 },
  { A: 0.6, B: 0.4, C: 0 },
  { A: 0.6, B: 0.4, C: 0 },
  { A: 0.6, B: 0.4, C: 0 },
  { A: 0.4, B: 0.6, C: 0 },
  { A: 0, B: 0.3, C: 0.7 },
];

const isTier = (t: string): t is Tier => (TIERS as string[]).includes(t);

/** Two uniforms in [0, 1) from HMAC-SHA256(seed, "chkoun|" + day). */
function uniforms(seed: string, day: Day): [number, number] {
  const mac = createHmac("sha256", seed).update(`chkoun|${day}`).digest();
  return [mac.readUIntBE(0, 6) / 2 ** 48, mac.readUIntBE(6, 6) / 2 ** 48];
}

/**
 * One day's footballer: a tier by the day's weights (renormalised over the
 * tiers that still have a candidate), then a candidate of that tier, in id
 * order. `recent`: footballers the repeat window rules out. Null when no
 * candidate is left.
 */
export function drawOne(input: {
  seed: string;
  day: Day;
  candidates: Candidate[];
  recent: Iterable<string>;
  tiers: Record<Tier, number>;
}): string | null {
  const blocked = new Set(input.recent);
  const byTier = new Map<Tier, string[]>();
  for (const c of input.candidates) {
    if (!isTier(c.tier) || input.tiers[c.tier] <= 0 || blocked.has(c.id))
      continue;
    byTier.set(c.tier, [...(byTier.get(c.tier) ?? []), c.id]);
  }
  const open = TIERS.filter((t) => byTier.has(t));
  if (open.length === 0) return null;
  const total = open.reduce((sum, t) => sum + input.tiers[t], 0);
  const [forTier, forIndex] = uniforms(input.seed, input.day);
  let at = forTier * total;
  let tier = open[open.length - 1];
  for (const t of open) {
    if (at < input.tiers[t]) {
      tier = t;
      break;
    }
    at -= input.tiers[t];
  }
  const ids = [...new Set(byTier.get(tier)!)].sort();
  return ids[Math.floor(forIndex * ids.length)];
}

/**
 * Fills `days` days from `today` (D-S2-2). `existing` holds the calendar's
 * rows, including the last 120 days before today. Frozen days (today and
 * the next two), pins and reserves are never changed; an empty day is filled,
 * frozen or not (the database lets an empty day be filled once). An unfrozen
 * generator day keeps its footballer while he is a candidate and no pin or
 * reserve within the window holds him, else it is redrawn. A footballer is not drawn within `window` days, before or after,
 * of another day he holds; when no candidate is left for a day, the window
 * shrinks for that day only and a note says so. `write` holds only new or
 * redrawn rows.
 */
export function schedule(input: {
  seed: string;
  today: Day;
  days: number;
  candidates: Candidate[];
  existing: CalendarRow[];
  maxWindow?: number;
}): { write: CalendarRow[]; window: number; notes: string[] } {
  const candidates = input.candidates.filter((c) => isTier(c.tier));
  const eligible = new Set(candidates.map((c) => c.id));
  const window = Math.max(
    0,
    Math.min(input.maxWindow ?? MAX_WINDOW, eligible.size - 1),
  );
  // Days as numbers from today: the window looks at up to 240 days a draw.
  const at = (day: Day) => dayDiff(input.today, day);
  const calendar = new Map<number, CalendarRow>(
    input.existing.map((r) => [at(r.day), r]),
  );
  const write: CalendarRow[] = [];
  const notes: string[] = [];

  const heldNear = (index: number, span: number): Set<string> => {
    const held = new Set<string>();
    for (let d = -span; d <= span; d++) {
      if (d === 0) continue;
      const row = calendar.get(index + d);
      if (row) held.add(row.playerId);
    }
    return held;
  };

  // Review L2: a pin or a reserve within the window that holds the same
  // footballer as a kept generator day sends that day back to the draw.
  const pinnedNear = (index: number, id: string): boolean => {
    for (let d = -window; d <= window; d++) {
      if (d === 0) continue;
      const other = calendar.get(index + d);
      if (other && other.source !== "generator" && other.playerId === id)
        return true;
    }
    return false;
  };

  for (let i = 0; i < input.days; i++) {
    const day = addDays(input.today, i);
    const row = calendar.get(i);
    if (row) {
      const fixed =
        row.source !== "generator" ||
        isFrozen(day, input.today) ||
        (eligible.has(row.playerId) && !pinnedNear(i, row.playerId));
      if (fixed) continue;
    }
    const tiers = TIER_WEIGHTS[weekday(day)];
    let drawn: string | null = null;
    let span = window;
    for (; span >= 0 && drawn === null; span--)
      drawn = drawOne({
        seed: input.seed,
        day,
        candidates,
        recent: heldNear(i, span),
        tiers,
      });
    span++;
    if (drawn === null) {
      notes.push(`${day}: no candidate for this weekday's tiers`);
      continue;
    }
    if (span < window)
      notes.push(
        `${day}: window shrunk to ${span} days, the most this day allows`,
      );
    const next: CalendarRow = { day, playerId: drawn, source: "generator" };
    calendar.set(i, next);
    write.push(next);
  }
  return { write, window, notes };
}

/** The days in `rows` within `window` of each other that share a footballer. */
export function repeats(rows: CalendarRow[], window: number): [Day, Day][] {
  const sorted = [...rows].sort((a, b) => (a.day < b.day ? -1 : 1));
  const out: [Day, Day][] = [];
  for (let i = 0; i < sorted.length; i++)
    for (let j = i + 1; j < sorted.length; j++) {
      if (dayDiff(sorted[i].day, sorted[j].day) > window) break;
      if (sorted[i].playerId === sorted[j].playerId)
        out.push([sorted[i].day, sorted[j].day]);
    }
  return out;
}
