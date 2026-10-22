import { FORMATION } from "@/engine/season/draft.ts";
import type { Names } from "@/engine/season/types.ts";
import fr from "../../messages/fr.json";
import type { SeasonView } from "./replay.ts";

// What the squad card shows (plan Task 17, Latin-only, T-S3-14): the
// record, the points and the team rating in Western digits, and the eleven
// Latin names grouped by line, every word the French page's own (Jalel's
// wording, messages/fr.json). No Arabic at
// all: next/og (Satori) reverses Arabic words and crashes on IBM Plex Sans
// Arabic, so the card is the same in every locale. No photo, no crest.

const t = fr.season;

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

/** The footballer's Latin name; his French one if that is in Arabic letters; else none. */
function latinName(names: Names): string | null {
  for (const name of [names.nameLatin, names.nameFrench])
    if (name && !ARABIC.test(name)) return name;
  return null;
}

export type CardLines = {
  /** "Kora · 30–0". */
  header: string;
  /** "28-2-0". */
  record: string;
  /** "86 points". */
  points: string;
  /** "Note 91.2". */
  rating: string;
  lines: { label: string; names: string[] }[];
};

export function cardLines(view: SeasonView): CardLines {
  const { w, d, l, points, rating } = view.season;
  const lines = [...new Set(FORMATION)].map((line) => ({
    label: t.lines[line],
    names: view.squad
      .filter((_, slot) => FORMATION[slot] === line)
      .map((c) => latinName(c.names))
      .filter((name): name is string => name !== null),
  }));
  return {
    header: t.share.header,
    record: `${w}-${d}-${l}`,
    points: `${points} ${t.share.points}`,
    rating: `${t.rating} ${rating.toFixed(1)}`,
    lines,
  };
}
