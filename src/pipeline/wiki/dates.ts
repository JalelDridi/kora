// Infobox "as of" dates, as ISO YYYY-MM-DD.

const EN = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const FR = [
  "janvier",
  "fevrier",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "aout",
  "septembre",
  "octobre",
  "novembre",
  "decembre",
];

function bare(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function iso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function month(name: string, names: string[]): number {
  return /^\d+$/.test(name) ? Number(name) : names.indexOf(bare(name)) + 1;
}

/** {{x|a|b}} → "a|b", so a date template's content can be read as text. */
function unwrap(text: string): string {
  return text.replace(/\{\{\s*[^|{}]+\|([^{}]*)\}\}/g, "$1");
}

export function parseEnDate(text: string): string | null {
  const numeric =
    /\{\{\s*(?:start date|date)[^|}]*\|\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})/i.exec(
      text,
    );
  if (numeric)
    return iso(Number(numeric[1]), Number(numeric[2]), Number(numeric[3]));
  const t = unwrap(text);
  let m = /(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  // "15 September, 2026" (a squad list's {{updated}}) has a comma before the year.
  m = /(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})/.exec(t);
  if (m && month(m[2], EN) > 0)
    return iso(Number(m[3]), month(m[2], EN), Number(m[1]));
  m = /([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/.exec(t);
  if (m && month(m[1], EN) > 0)
    return iso(Number(m[3]), month(m[1], EN), Number(m[2]));
  return null;
}

export function parseFrDate(text: string): string | null {
  const parts =
    /\{\{\s*date-?\s*\|\s*(\d{1,2})(?:er)?\s*\|\s*([^|{}]+?)\s*\|\s*(\d{4})/i.exec(
      text,
    );
  if (parts) {
    const m = month(parts[2], FR);
    return m > 0 ? iso(Number(parts[3]), m, Number(parts[1])) : null;
  }
  const t = unwrap(text);
  let m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
  if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /(\d{1,2})(?:er)?\s+(\p{L}+)\s+(\d{4})/u.exec(t);
  if (m && month(m[2], FR) > 0)
    return iso(Number(m[3]), month(m[2], FR), Number(m[1]));
  m = /(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
}
