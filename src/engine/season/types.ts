// Shapes shared by the 30–0 season engine. Everything in src/engine is pure:
// no I/O, no clock, no imports from outside src/engine. Node runs these files
// by stripping types: no enums, no namespaces, no parameter properties.

import type { Line } from "../chkoun/types.ts";

export type Decade = 1990 | 2000 | 2010 | 2020;
export const DECADES: readonly Decade[] = [1990, 2000, 2010, 2020];

export type Titles = { league: number; cup: number; caf: number };

export type RatingInputs = {
  line: Line;
  decade: Decade;
  caps: number;
  /** D-S3-6: the caps band's midpoint was used, the count being doubtful. */
  capsFromBand: boolean;
  goalsPerCap: number;
  goalsDoubt: boolean;
  /** Null when no matching spell gives its apps. */
  apps: number | null;
  /** The career is rated low or has no confidence: "?" on the card. */
  historyDoubt: boolean;
  titles: Titles;
  afcon2004: boolean;
};

export type Candidate = {
  footballerId: string;
  clubId: string;
  decade: Decade;
  line: Line;
  rating: number;
  inputs: RatingInputs;
};

export type Person = {
  id: string;
  nameLatin: string;
  nameArabic: string | null;
  nameFrench: string | null;
  line: Line;
};

export type Opponent = { clubId: string; strength: number };

export type Names = {
  nameLatin: string;
  nameArabic: string | null;
  nameFrench: string | null;
};

export type SeasonData = {
  people: Map<string, Person>;
  /** tripleKey → candidates sorted by footballer id. */
  index: Map<string, Candidate[]>;
  /** footballer id → his sorted triple keys (share codes `{id}_{k}`, T-S3-6: `_`, never `.`, so a share URL holds no dot). */
  combos: Map<string, string[]>;
  /** The Ligue 1 clubs, sorted. */
  clubIds: string[];
  clubs: Map<string, Names>;
  /** From ligue1-strength.json, sorted by club id. */
  table: Opponent[];
};

export const tripleKey = (clubId: string, decade: Decade, line: Line) =>
  `${clubId}|${decade}|${line}`;

// The part of the pool (src/pipeline/types.ts, Pool) the engine reads. Each
// shape is a structural subset, so a Pool is a SeasonSource without this
// folder importing the pipeline.

export type SourceSpell = {
  clubId: string | null;
  from: number | null;
  /** Null for a spell still open. */
  to: number | null;
  apps: number | null;
  loan: boolean;
};

/** A field's provenance, as far as the engine reads it (P26, D-S2-6). */
export type SourceProvenance = {
  confidence?: "high" | "medium" | "low";
  bandAgreed?: boolean;
};

export type SourcePlayer = {
  id: string;
  wikidataId: string;
  nameLatin: string;
  nameArabic: string | null;
  nameFrench: string | null;
  position: Line;
  caps: number;
  goals: number;
  history: readonly SourceSpell[];
  provenance: Partial<Record<"caps" | "goals" | "history", SourceProvenance>>;
};

export type SourceClub = {
  id: string;
  ligue1: boolean;
  nameLatin: string;
  nameArabic: string | null;
  nameFrench: string | null;
};

export type SourceHonour = {
  /** tn_ligue1, tn_cup, caf_cl or caf_cc. */
  competition: string;
  /** The edition's end year: 2019 for 2018–19. */
  seasonEnd: number;
  clubId: string;
};

export type SeasonSource = {
  players: readonly SourcePlayer[];
  clubs: readonly SourceClub[];
  honours: readonly SourceHonour[];
};
