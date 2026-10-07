import type { RatingInputs } from "./types.ts";

// D-S3-5: one documented formula (data/README.md, "30–0 ratings"). Each part
// is scaled to 0..1, weighted by line, then mapped onto 60..99.
export const RATING = {
  floor: 60,
  span: 39,
  curve: 0.8,
  bandCaps: [0, 5, 20, 45, 75], // D-S3-6
  capsFull: 100,
  appsFull: 200,
  titlesFull: 6,
  eraCaps: { 1990: 1.15, 2000: 1, 2010: 1, 2020: 1.1 }, // fewer matches in the 1990s; careers still open
  gpcFull: { goalkeeper: 0, defender: 0.1, midfielder: 0.25, forward: 0.5 },
  titleWeight: { league: 1, cup: 0.5, caf: 1.5 },
  afconBonus: 0.05,
  weights: {
    goalkeeper: { caps: 0.5, goals: 0, apps: 0.3, titles: 0.2 },
    defender: { caps: 0.45, goals: 0.05, apps: 0.3, titles: 0.2 },
    midfielder: { caps: 0.4, goals: 0.15, apps: 0.25, titles: 0.2 },
    forward: { caps: 0.35, goals: 0.3, apps: 0.2, titles: 0.15 },
  },
} as const;

const log01 = (x: number, full: number) =>
  Math.min(1, Math.log1p(Math.max(0, x)) / Math.log1p(full));

export function rate(i: RatingInputs): number {
  const w = RATING.weights[i.line];
  const full = RATING.gpcFull[i.line];
  const t = i.titles;
  const raw =
    w.caps * log01(i.caps * RATING.eraCaps[i.decade], RATING.capsFull) +
    w.goals * (full === 0 ? 0 : Math.min(1, i.goalsPerCap / full)) +
    w.apps * (i.apps === null ? 0 : log01(i.apps, RATING.appsFull)) +
    w.titles *
      Math.min(
        1,
        (t.league * RATING.titleWeight.league +
          t.cup * RATING.titleWeight.cup +
          t.caf * RATING.titleWeight.caf) /
          RATING.titlesFull,
      ) +
    (i.afcon2004 ? RATING.afconBonus : 0);
  return Math.round(
    RATING.floor + RATING.span * Math.min(1, raw) ** RATING.curve,
  );
}
