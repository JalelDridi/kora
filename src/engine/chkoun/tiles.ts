// The six Chkoun? tiles (design §4, D-S2-7, D-S2-8, D-S2-13). Pure.

import { ageOn } from "./day.ts";
import type {
  Arrow,
  Colour,
  Day,
  Line,
  Tile,
  TileFacts,
  TileRow,
} from "./types.ts";

export const LINE_ORDER: readonly Line[] = [
  "goalkeeper",
  "defender",
  "midfielder",
  "forward",
];

const AGE_AMBER_YEARS = 2;

function tile(colour: Colour, value: Tile["value"], arrow: Arrow = null): Tile {
  return { colour, arrow, value };
}

const unknown: Tile = { colour: "unknown", arrow: null, value: null };

function arrowTowards(guess: number, answer: number): Arrow {
  if (answer > guess) return "up";
  if (answer < guess) return "down";
  return null;
}

function clubTile(guess: TileFacts, answer: TileFacts): Tile {
  if (guess.clubId === null) return unknown;
  if (guess.clubId === answer.clubId) return tile("green", guess.clubId);
  if (answer.pastClubIds.includes(guess.clubId))
    return tile("amber", guess.clubId);
  return tile("grey", guess.clubId);
}

function countryTile(guess: TileFacts, answer: TileFacts): Tile {
  if (guess.clubCountry === null) return unknown;
  if (guess.clubCountry === answer.clubCountry)
    return tile("green", guess.clubCountry);
  if (
    guess.confederation !== null &&
    guess.confederation === answer.confederation
  )
    return tile("amber", guess.clubCountry);
  return tile("grey", guess.clubCountry);
}

function positionTile(guess: TileFacts, answer: TileFacts): Tile {
  const distance = Math.abs(
    LINE_ORDER.indexOf(guess.line) - LINE_ORDER.indexOf(answer.line),
  );
  if (distance === 0) return tile("green", guess.line);
  return tile(distance === 1 ? "amber" : "grey", guess.line);
}

function ageTile(guess: TileFacts, answer: TileFacts, day: Day): Tile {
  const g = ageOn(guess.birthDate, day);
  const a = ageOn(answer.birthDate, day);
  if (g === a) return tile("green", g);
  const colour = Math.abs(g - a) <= AGE_AMBER_YEARS ? "amber" : "grey";
  return tile(colour, g, arrowTowards(g, a));
}

function capsTile(guess: TileFacts, answer: TileFacts): Tile {
  if (guess.capsBand === null) return unknown;
  if (answer.capsBand === null) return tile("grey", guess.capsBand);
  if (guess.capsBand === answer.capsBand) return tile("green", guess.capsBand);
  const colour =
    Math.abs(guess.capsBand - answer.capsBand) === 1 ? "amber" : "grey";
  return tile(
    colour,
    guess.capsBand,
    arrowTowards(guess.capsBand, answer.capsBand),
  );
}

/** Where a footballer was born, as the tile reads it; null when unknown. */
function birthKey(f: TileFacts): string | null {
  if (f.governorate !== null) return `gov:${f.governorate}`;
  if (f.birthCountry !== null && f.birthCountry !== "TN")
    return `abroad:${f.birthCountry}`;
  return null;
}

function governorateTile(guess: TileFacts, answer: TileFacts): Tile {
  const g = birthKey(guess);
  if (g === null) return unknown;
  const a = birthKey(answer);
  if (g === a) return tile("green", g);
  if (a === null) return tile("grey", g);
  const bothHome = guess.governorate !== null && answer.governorate !== null;
  const bothAbroad = guess.governorate === null && answer.governorate === null;
  if (bothHome && guess.region !== null && guess.region === answer.region)
    return tile("amber", g);
  if (bothAbroad) return tile("amber", g);
  return tile("grey", g);
}

/** The row a guess earns against the answer on `day`. */
export function compare(
  guess: TileFacts,
  answer: TileFacts,
  day: Day,
): TileRow {
  return {
    club: clubTile(guess, answer),
    country: countryTile(guess, answer),
    position: positionTile(guess, answer),
    age: ageTile(guess, answer, day),
    caps: capsTile(guess, answer),
    governorate: governorateTile(guess, answer),
  };
}

const LETTER: Record<Colour, string> = {
  green: "g",
  amber: "a",
  grey: "x",
  unknown: "u",
};

/** Six letters, club to governorate: the share grid and `results.detail.grid`. */
export function colourKey(row: TileRow): string {
  return [
    row.club,
    row.country,
    row.position,
    row.age,
    row.caps,
    row.governorate,
  ]
    .map((t) => LETTER[t.colour])
    .join("");
}
