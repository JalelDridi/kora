// Shapes shared by the Chkoun? engine. Everything in src/engine is pure: no
// I/O, no clock, no imports from outside src/engine. Node runs these files by
// stripping types: no enums, no namespaces, no parameter properties.

/** A day in Africa/Tunis, written YYYY-MM-DD. */
export type Day = string;

export type Line = "goalkeeper" | "defender" | "midfielder" | "forward";

/** Bands 0 / 1-9 / 10-29 / 30-59 / 60+ (D-S2-13). */
export type CapsBand = 0 | 1 | 2 | 3 | 4;

/** "unknown" is a guessed footballer's missing value: "?" on screen, never grey. */
export type Colour = "green" | "amber" | "grey" | "unknown";

/** Points from the guess towards the answer: "up" means the answer is older, or in a higher band. */
export type Arrow = "up" | "down" | null;

/** What the six tiles need to know about one footballer. */
export type TileFacts = {
  id: string;
  clubId: string | null;
  /** ISO 3166-1 alpha-2 of the current club's country. */
  clubCountry: string | null;
  confederation: string | null;
  line: Line;
  birthDate: Day;
  /** Null when the caps are not known. */
  capsBand: CapsBand | null;
  /** Governorate id when born in Tunisia and placed; null otherwise. */
  governorate: string | null;
  region: string | null;
  /** ISO 3166-1 alpha-2; "TN" when born in Tunisia. */
  birthCountry: string | null;
  /** Clubs of earlier spells, for the club tile's amber (D-S2-7). */
  pastClubIds: string[];
};

/**
 * One tile. `value` is the guessed footballer's own value: club id, ISO code,
 * line, age in years, band index, `gov:<id>` or `abroad:<XX>`; null when
 * unknown.
 */
export type Tile = {
  colour: Colour;
  arrow: Arrow;
  value: string | number | null;
};

export type TileRow = {
  club: Tile;
  country: Tile;
  position: Tile;
  age: Tile;
  caps: Tile;
  governorate: Tile;
};
