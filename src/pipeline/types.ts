// Shapes shared by the data pipeline. Everything in src/pipeline is pure
// except run.ts, cli.ts and sync-cli.ts, which read, fetch and write.
// Node runs these files by stripping types: no enums, no namespaces.

export type Line = "goalkeeper" | "defender" | "midfielder" | "forward";
export const lines: readonly Line[] = [
  "goalkeeper",
  "defender",
  "midfielder",
  "forward",
];

export type Confederation =
  "CAF" | "UEFA" | "AFC" | "CONCACAF" | "CONMEBOL" | "OFC";

export type Region =
  | "grand_tunis"
  | "north_east"
  | "north_west"
  | "centre_east"
  | "centre_west"
  | "south_east"
  | "south_west";
export const regions: readonly Region[] = [
  "grand_tunis",
  "north_east",
  "north_west",
  "centre_east",
  "centre_west",
  "south_east",
  "south_west",
];

export type Competition = "tn_ligue1" | "tn_cup" | "caf_cl" | "caf_cc";
export const competitions: readonly Competition[] = [
  "tn_ligue1",
  "tn_cup",
  "caf_cl",
  "caf_cc",
];

export type SourceId =
  | "wikidata"
  | "enwiki"
  | "frwiki"
  | "commons"
  | "martj42"
  | "override"
  | "curated"
  /** No source gives the value; the merge stores a placeholder rated low. */
  | "none";

/** Decision P26: how far the sources agree on a chosen value. */
export type Confidence = "high" | "medium" | "low";
export const confidences: readonly Confidence[] = ["high", "medium", "low"];

export type Provenance = {
  source: SourceId;
  /** ISO date the value was first read with this value. */
  retrievedAt: string;
  /** The source's own "as of" date, when it has one. */
  asOf?: string;
  /** Page title, property or file the value came from. */
  ref?: string;
  /** For overrides: who decided. */
  by?: string;
  /** Decision P26, set by the merge. Optional so Tasks 3–5 compile; validatePool requires it. */
  confidence?: Confidence;
  /** The sources that give the chosen value; ["override"] when Jalel decided. */
  agreeing?: SourceId[];
  /** Why the level is what it is, in a few words. */
  confidenceNote?: string;
};

/** A senior club spell as an infobox writes it. */
export type Spell = {
  /** Link target title, or plain text when the club is not linked. */
  clubTitle: string;
  from: number | null;
  /** Null for a spell still open. */
  to: number | null;
  apps: number | null;
  goals: number | null;
  loan: boolean;
};

export type Infobox = {
  lang: "en" | "fr";
  /** The article's title. */
  title: string;
  /** Link target title of the current club; null when none or a staff role. */
  currentClub: string | null;
  currentClubIsStaff: boolean;
  positionText: string | null;
  spells: Spell[];
  /** Senior Tunisia caps and goals; null when the infobox has no such row. */
  caps: number | null;
  goals: number | null;
  /** The senior Tunisia spell has no end year. */
  nationalOpen: boolean;
  clubsAsOf: string | null;
  capsAsOf: string | null;
  /** Rows the parser could not read; empty when nothing was skipped. */
  skipped: SkippedRow[];
  /** ISO birth date; absent when the parser does not read it. */
  birthDate?: string | null;
};

/**
 * An infobox row the parser dropped, so a reviewer can see it.
 * `field` names the infobox parameter exactly as the page writes it: the
 * numbered parameter in English (`clubs3`, `nationalteam2`), the career field
 * in French (`parcours pro`, `parcours senior`, `sélection nationale`).
 * `raw` is the row's wikitext, whitespace collapsed, cut to 200 characters.
 * Reasons: `years`, the years cell is unreadable; `no-club`, no team name;
 * `no-wrapper`, a non-empty French field without a wrapper template to split
 * (one entry per field); `limit`, the first English numbered parameter beyond
 * the loop limit.
 */
export type SkippedRow = {
  field: string;
  raw: string;
  reason: "years" | "no-club" | "no-wrapper" | "limit";
};

export type WdPlayer = {
  qid: string;
  nameEn: string | null;
  nameFr: string | null;
  nameAr: string | null;
  aliases: string[];
  /** P21 is male, or missing. */
  male: boolean;
  birthDate: string | null;
  /** English labels of P413. */
  positions: string[];
  birthPlaceQid: string | null;
  birthPlaceName: string | null;
  /** ISO 3166-1 alpha-2 of the birthplace's country. */
  birthCountry: string | null;
  /** English labels of the governorates above the birthplace. */
  governorates: string[];
  /** "File:Name.jpg", spaces not underscores. */
  imageFile: string | null;
  titles: { en: string | null; fr: string | null; ar: string | null };
};

export type WdMembership = {
  playerQid: string;
  teamQid: string;
  teamName: string | null;
  start: number | null;
  end: number | null;
  /** The end is Wikidata's "unknown value": ended, date unknown. */
  endUnknown: boolean;
  apps: number | null;
  goals: number | null;
  national: boolean;
};

export type WdClub = {
  qid: string;
  nameEn: string | null;
  nameFr: string | null;
  nameAr: string | null;
  country: string | null;
  leagues: string[];
  titleEn: string | null;
  titleFr: string | null;
};

export type WdHonour = {
  competition: Competition;
  seasonStart: number;
  /** The edition's end year: 2019 for 2018–19, 2018 for 2018. */
  seasonEnd: number;
  winnerQid: string;
};

export type Photo = {
  file: string;
  thumbUrl: string;
  width: number;
  height: number;
  licence: string;
  licenceUrl: string | null;
  author: string | null;
  sourceUrl: string;
  attributionRequired: boolean;
};

export type Match = {
  date: string;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  tournament: string;
};

/**
 * A correction or a drop made while reading honours, for the reviewer.
 * `end-out-of-range`: the end date's year is neither the start year nor the
 * next; `label-unreadable`: no usable end date and no end year in the label,
 * so the end is the start year; `duplicate-edition`: a second winner for the
 * same edition, dropped.
 */
export type HonourIssue = {
  kind: "end-out-of-range" | "label-unreadable" | "duplicate-edition";
  competition: string;
  seasonStart: number;
  detail: string;
};

export type GovernorateRow = {
  id: string;
  nameLatin: string;
  nameArabic: string;
  nameFrench: string;
  region: Region;
};

export type CuratedHonour = {
  competition: Competition;
  seasonStart: number;
  /** The edition's end year: 2019 for 2018–19, 2018 for 2018. */
  seasonEnd: number;
  clubWikidataId: string;
  by: string;
  at: string;
};

export type PoolSpell = {
  clubId: string | null;
  clubName: string;
  from: number | null;
  to: number | null;
  apps: number | null;
  goals: number | null;
  loan: boolean;
};

/** Fields that carry provenance. "caps" covers caps and capsAsOf; "goals" has its own confidence. */
export type ProvenancedField =
  | "nameLatin"
  | "nameArabic"
  | "position"
  | "positionDetail"
  | "birthDate"
  | "birthPlace"
  | "governorate"
  | "clubId"
  | "caps"
  | "goals"
  | "history"
  | "photo";

export type PoolPlayer = {
  id: string;
  wikidataId: string;
  nameLatin: string;
  nameArabic: string | null;
  nameFrench: string | null;
  aliases: string[];
  position: Line;
  positionDetail: string | null;
  birthDate: string;
  birthPlace: string | null;
  birthCountry: string | null;
  governorate: string | null;
  clubId: string | null;
  caps: number;
  goals: number;
  capsAsOf: string | null;
  history: PoolSpell[];
  photo: Photo | null;
  wiki: { en: string | null; fr: string | null; ar: string | null };
  pools: { active: boolean; legend: boolean };
  provenance: Partial<Record<ProvenancedField, Provenance>>;
};

export type PoolClub = {
  id: string;
  wikidataId: string;
  nameLatin: string;
  nameArabic: string | null;
  nameFrench: string | null;
  country: string;
  confederation: Confederation | null;
  leagueWikidataId: string | null;
  ligue1: boolean;
};

export type PoolHonour = {
  competition: Competition;
  seasonStart: number;
  /** The edition's end year: 2019 for 2018–19, 2018 for 2018. */
  seasonEnd: number;
  clubId: string;
  source: "wikidata" | "curated";
};

export type FlagKind =
  | "caps-newer-but-lower"
  | "caps-sources-disagree"
  | "caps-maybe-stale"
  | "club-staff-role"
  | "club-unresolved"
  | "club-sources-disagree"
  | "club-override-disagrees"
  | "multiple-open-clubs"
  | "position-disagrees"
  | "position-unmapped"
  | "birthplace-country-only"
  | "governorate-unresolved"
  | "birthdate-january-first"
  | "photo-small"
  | "dropped-missing-field"
  | "ligue1-club-unresolved"
  | "caps-above-ceiling"
  | "goals-below-floor"
  | "caps-row-skipped"
  | "career-row-skipped"
  /** Ruling R1: a French spell without a start year, dropped beside an English career. */
  | "fr-undated-spell"
  /** No source gives his Tunisia caps; the 0 stored is a placeholder. */
  | "caps-unknown"
  /** The caps source gives no goals and no other source does; the 0 is a placeholder. */
  | "goals-unknown";

/** Something for Jalel to look at. `subject` is a Wikidata id or a title. */
export type Flag = { subject: string; kind: FlagKind; detail: string };

export type Pool = {
  version: 1;
  players: PoolPlayer[];
  clubs: PoolClub[];
  honours: PoolHonour[];
  flags: Flag[];
};

export type SourceStatus = {
  status: "fresh" | "cached" | "failed";
  retrievedAt: string | null;
  note?: string;
};
