// The 30–0 share text (plan Task 11, D-S2-10). Pure: no I/O, no imports
// beyond types, so the browser can build the text the visitor shares.
//
// Four lines: the header, the record and the points, the team rating, and
// the replay link alone on the last line. The record and the rating lines
// are wrapped in left-to-right marks and the link starts with one, in every
// language: "28-2-0" and "91.2" are never reordered by a right-to-left chat
// bubble, and the marks are invisible in a left-to-right one. Western
// digits only; no footballer's name ever appears.

import type { Day } from "../chkoun/types.ts";

/** U+200E LEFT-TO-RIGHT MARK. */
const LRM = "‎";

export type SeasonShareInput = {
  /** "Kora · 30–0". */
  header: string;
  w: number;
  d: number;
  l: number;
  points: number;
  /** "نقطة", "no9ta", "points". */
  pointsLabel: string;
  /** The team rating, one decimal. */
  rating: number;
  ratingLabel: string;
  /** The replay page, absolute (shareUrl). */
  url: string;
};

export function seasonShareText(input: SeasonShareInput): string {
  const record = `${input.w}-${input.d}-${input.l}`;
  return [
    input.header,
    `${LRM}${record} · ${input.points} ${input.pointsLabel}${LRM}`,
    `${LRM}${input.ratingLabel} ${input.rating.toFixed(1)}${LRM}`,
    `${LRM}${input.url}`,
  ].join("\n");
}

/** The replay page of a squad's season, under the sharer's locale. */
export function shareUrl(
  origin: string,
  prefix: string,
  day: Day,
  code: string,
): string {
  return `${origin}${prefix}/season/r/${day}/${code}`;
}
