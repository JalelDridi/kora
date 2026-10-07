// Fame (D-S2-4): how widely a footballer is known, from 12 full months of
// Wikipedia user page views, weighted towards French and Arabic, the
// languages Tunisians read. Pure. The thresholds and weights are the
// research's (sprint-2-chkoun-design §1.5), kept here and nowhere else.

import type { Fame, FameTier, PageViews } from "./types.ts";

export const FAME_WEIGHTS = { en: 1, fr: 1.5, ar: 3 } as const;
/** Jalel's "local star" tag: known at home beyond his page views. */
export const LOCAL_STAR_BOOST = 0.5;
/** The lowest score of each tier; below C is D. */
export const TIER_FLOORS = { A: 5.0, B: 4.5, C: 3.0 } as const;

/** log10(en + 1.5·fr + 3·ar + 1), plus the boost for a local star. */
export function fameScore(views: PageViews, localStar: boolean): number {
  const weighted =
    FAME_WEIGHTS.en * views.en +
    FAME_WEIGHTS.fr * views.fr +
    FAME_WEIGHTS.ar * views.ar;
  const score = Math.log10(weighted + 1) + (localStar ? LOCAL_STAR_BOOST : 0);
  // Two decimals are plenty for a tier, and keep the pool's diff quiet.
  return Math.round(score * 100) / 100;
}

/** A ≥ 5.0, B 4.5 to 5.0, C 3.0 to 4.5 (P53), D below 3.0 or no views. */
export function fameTier(score: number | null): FameTier {
  if (score === null) return "D";
  if (score >= TIER_FLOORS.A) return "A";
  if (score >= TIER_FLOORS.B) return "B";
  if (score >= TIER_FLOORS.C) return "C";
  return "D";
}

/**
 * A footballer's fame. `views` null: not measured yet (the build fetches page
 * views a few footballers a night within its request budget), so no score
 * and no tier: he cannot be a daily answer until measured.
 */
export function fameOf(
  views: PageViews | null,
  window: string | null,
  localStar: boolean,
): Fame {
  if (views === null)
    return { score: null, tier: null, views: null, window: null, localStar };
  const score = fameScore(views, localStar);
  return { score, tier: fameTier(score), views, window, localStar };
}
