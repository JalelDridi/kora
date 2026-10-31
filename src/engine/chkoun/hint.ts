// The first-letter hint (mobile polish M8): from the 5th guess on, the
// guess answer carries the first letter of each of the answer's name forms,
// and only that letter. Pure; runs with `node file.ts`.

/** The first letter of each of the answer's name forms. */
export type Hint = {
  latin: string;
  arabic: string | null;
  french: string | null;
};

/** The hint comes with this guess and every one after it. */
export const HINT_AFTER = 5;

/**
 * The first letter of the trimmed name, as written, Latin in capitals;
 * null for no name. Always one code point: never more of the name, even
 * where a capital would be two letters ("ß" stays "ß").
 */
export function firstLetter(name: string | null): string | null {
  if (name === null) return null;
  const first = [...name.trim()][0];
  if (first === undefined) return null;
  const upper = first.toLocaleUpperCase("fr");
  return [...upper].length === 1 ? upper : first;
}

/** A win that came after the hint was shown: the share text marks it. */
export function hinted(solved: boolean, guesses: number): boolean {
  return solved && guesses > HINT_AFTER;
}

/**
 * The letter a page shows: the form its names are written in, as
 * `localName` picks it (Arabic on /ar, French on /fr, Latin on /tn), the
 * Latin one where that form is missing.
 */
export function letterFor(hint: Hint, locale: string): string {
  if (locale === "ar-TN") return hint.arabic ?? hint.latin;
  if (locale === "fr") return hint.french ?? hint.latin;
  return hint.latin;
}
