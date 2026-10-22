import type { Line } from "@/engine/chkoun/types.ts";
import type { Decade } from "@/engine/season/types.ts";

// What the 30–0 page prints for values the API sends as numbers (plan
// Task 10). The browser imports no engine code, only its types: the slot
// lines are the engine's FORMATION, copied (labels.test.ts keeps them equal).

/** D-S3-7: GK, DEF×4, MID×3, FWD×3, as the draft endpoint fills them. */
export const SLOT_LINES: readonly Line[] = [
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

type T = (key: string, values?: Record<string, number>) => string;

/** "Années 1990", with Western digits in every locale. */
export function decadeLabel(decade: Decade, t: T): string {
  return t("decade", { decade });
}

/** The rating's band of ten, for the card's styling (the number is always shown). */
export function ratingBand(r: number): "60" | "70" | "80" | "90" {
  if (r >= 90) return "90";
  if (r >= 80) return "80";
  if (r >= 70) return "70";
  return "60";
}

/**
 * D-S3-6: a doubtful caps count is rated from its band's midpoint
 * (RATING.bandCaps 0, 5, 20, 45, 75); the card shows the band instead.
 */
const BAND_BY_MIDPOINT: Record<number, string> = {
  0: "0",
  5: "1-9",
  20: "10-29",
  45: "30-59",
  75: "60+",
};

export function capsBandText(midpoint: number): string {
  return BAND_BY_MIDPOINT[midpoint] ?? "?";
}
