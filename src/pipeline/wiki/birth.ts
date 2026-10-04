import { parseFrDate } from "./dates.ts";

// Birth dates as the infoboxes write them, as ISO YYYY-MM-DD. They are the
// second and third votes on Wikidata's P569 (decision P26, addendum Step 6.0).

/** {{birth date and age|1993|7|2|df=y}}, named parameters allowed before the numbers. */
export function parseEnBirth(text: string): string | null {
  const m =
    /\{\{\s*birth date(?: and age)?\s*\|\s*(?:[a-z]+\s*=[^|}]*\|\s*)*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})/i.exec(
      text,
    );
  const [mo, d] = m ? [Number(m[2]), Number(m[3])] : [0, 0];
  return m && mo >= 1 && mo <= 12 && d >= 1 && d <= 31
    ? `${m[1]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    : null;
}

/** {{date de naissance|2|7|1993|âge=oui}} or plain "21 janvier 2003". */
export function parseFrBirth(text: string): string | null {
  return parseFrDate(text.replace(/\{\{\s*date de naissance\s*\|/i, "{{date|"));
}
