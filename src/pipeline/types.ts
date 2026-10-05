// Shapes shared by the data pipeline. Everything in src/pipeline is pure
// except run.ts, cli.ts, sync-run.ts and sync-cli.ts, which read, fetch and
// write (sync.ts writes only through the connection it is given).
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
  /** Decision P42 (P47): an English club's current squad list, a vote on the club. */
  | "enwiki-squad"
  /** A French club's "Effectif professionnel" list of the current season. */
  | "frwiki-squad"
  /** The English national team's current squad table: caps, goals and a club vote. */
  | "enwiki-national"
  /** Decision P43 (P48): the private witness, named as it agrees (S23); never its value. */
  | "transfermarkt"
  | "national-football-teams"
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
  /**
   * French only: the English article's title (`trad`) when the club is named
   * by {{Lien}}, a link to an article that exists only on another wiki, and
   * that wiki is English (no `langue`, or `langue=en`).
   */
  clubTitleForeign?: string;
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
  /** French only: the English title of a current club named by {{Lien}}, as for a spell. */
  currentClubForeign?: string;
  currentClubIsStaff: boolean;
  /** The club a staff post names ("[[Club Africain]] (manager)"), when it names one. */
  staffClub?: string;
  positionText: string | null;
  spells: Spell[];
  /** Senior Tunisia caps and goals; null when the infobox has no such row. */
  caps: number | null;
  goals: number | null;
  /** The senior Tunisia spell has no end year. */
  nationalOpen: boolean;
  /**
   * The latest end year of the senior Tunisia rows; null when there is no
   * senior row, or one of them is open or has no readable end.
   */
  nationalEnd: number | null;
  clubsAsOf: string | null;
  capsAsOf: string | null;
  /** Rows the parser could not read; empty when nothing was skipped. */
  skipped: SkippedRow[];
  /** ISO birth date; absent when the parser does not read it. */
  birthDate?: string | null;
  /**
   * A row or numbered parameter reads as the senior Tunisia team, whatever its
   * caps: true with caps null means an international whose count is unreadable.
   */
  seniorRow: boolean;
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
  | "photo"
  /** Only when an override decided the pools (fix round 2). */
  | "pools";

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
  /** Decisions P37-P39: the birth-date sources do not all agree; the detail names who differs. */
  | "birthdate-sources-disagree"
  | "photo-small"
  | "dropped-missing-field"
  | "ligue1-club-unresolved"
  | "caps-above-ceiling"
  | "goals-below-floor"
  /** Both pages show a closed national career, and a caps count differs that no date explains. */
  | "caps-closed-career-disagree"
  | "caps-row-skipped"
  | "career-row-skipped"
  /** Ruling R1: a French spell without a start year, dropped beside an English career. */
  | "fr-undated-spell"
  /** No source gives his Tunisia caps; the 0 stored is a placeholder. */
  | "caps-unknown"
  /** The caps source gives no goals and no other source does; the 0 is a placeholder. */
  | "goals-unknown"
  /** Decision D-S1-2 ignored Wikidata's one open club: it started over 8 years ago. */
  | "wd-club-too-old"
  /** A spell's years the database cannot hold (outside 1900–2100, or ending before it starts). */
  | "spell-years-unusable"
  /** An honour's winner has no club row with a country, so the honour is left out. */
  | "honour-winner-unresolved"
  /** A curated honour replaced a Wikidata edition of the same competition and start year. */
  | "honour-replaced-by-curated"
  /** S7: a current squad list (or the national table) names another club than the chosen one, or a club where none is chosen. */
  | "club-squad-list-differs"
  /** S10: his chosen club has a current squad list, and it does not name him. */
  | "club-not-on-squad-list"
  /** S11: the current lists of two clubs both name him; neither votes. */
  | "squad-lists-disagree"
  /** S12: the row links to him but names the club a namesake already has; no vote. */
  | "squad-namesake"
  /** P48 (S21 = b): Transfermarkt, checked lately, does not list him at the published club; the club is rated low. */
  | "club-witness-differs"
  /** P48 (S21 = b): national-football-teams.com, checked lately, has another count; the caps are rated low. */
  | "caps-witness-differs";

/** Something for Jalel to look at. `subject` is a Wikidata id or a title. */
export type Flag = { subject: string; kind: FlagKind; detail: string };

/**
 * A footballer the pipeline read but left out of the pool, so a reviewer can
 * see him. `excluded`: an override excludes him (no merge ran: no flags).
 * `not-candidate`: the research rule does not take him. `no-pool`: a
 * candidate in neither pool. `missing-field`: placed in a pool but missing a
 * required field (name, position, birth date); his merge flags end with
 * `dropped-missing-field` naming the fields. `no-pool`, `missing-field` and
 * `excluded` keep their flags (`excluded` has none: no merge ran);
 * `not-candidate` has none, so a list of about 1,000 stays light.
 */
export type PoolDropped = {
  wikidataId: string;
  name: string;
  reason: "excluded" | "not-candidate" | "no-pool" | "missing-field";
  flags: Flag[];
};
export const droppedReasons: readonly PoolDropped["reason"][] = [
  "excluded",
  "not-candidate",
  "no-pool",
  "missing-field",
];

/** One namespace of the id registry: Wikidata id → id, every id ever given (append-only). */
export type IdNamespace = Record<string, string>;
/** data/ids.json: permanent ids for footballers and for clubs, each its own namespace. */
export type IdRegistry = { players: IdNamespace; clubs: IdNamespace };

export type Pool = {
  version: 1;
  players: PoolPlayer[];
  clubs: PoolClub[];
  honours: PoolHonour[];
  flags: Flag[];
  /** Sorted by Wikidata number. */
  dropped: PoolDropped[];
};

export type SourceStatus = {
  status: "fresh" | "cached" | "failed";
  retrievedAt: string | null;
  note?: string;
};
