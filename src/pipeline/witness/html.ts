// Just enough HTML for the two sites' tables, without a parser dependency:
// rows, cells by class, links, text. Pure.

export function decode(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

/** The text a reader sees: tags dropped, entities decoded, spaces collapsed. */
export function text(html: string): string {
  return decode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The inner HTML of each top-level `<tag ...>` in `html` whose opening tag
 * matches `open`, nested tags of the same name included in their parent.
 */
export function elements(html: string, tag: string, open?: RegExp): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}\\b[^>]*>|</${tag}\\s*>`, "gi");
  let depth = 0;
  let start = -1;
  let take = false;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const closing = m[0].startsWith("</");
    if (!closing) {
      if (depth === 0) {
        take = !open || open.test(m[0]);
        start = m.index + m[0].length;
      }
      depth++;
    } else if (depth > 0) {
      depth--;
      if (depth === 0 && take) out.push(html.slice(start, m.index));
    }
  }
  return out;
}

/** The cells of a row, each with its opening tag's class. */
export function cells(row: string): { cls: string; html: string }[] {
  const out: { cls: string; html: string }[] = [];
  const re = /<td\b([^>]*)>|<\/td\s*>/gi;
  let depth = 0;
  let start = -1;
  let cls = "";
  for (let m = re.exec(row); m; m = re.exec(row)) {
    if (!m[0].startsWith("</")) {
      if (depth === 0) {
        cls = /class\s*=\s*"([^"]*)"/i.exec(m[1] ?? "")?.[1] ?? "";
        start = m.index + m[0].length;
      }
      depth++;
    } else if (depth > 0) {
      depth--;
      if (depth === 0) out.push({ cls, html: row.slice(start, m.index) });
    }
  }
  return out;
}

export const hasClass = (cls: string, ...names: string[]) =>
  names.every((n) => cls.split(/\s+/).includes(n));

/** Every `<a href="...">text</a>` in order. */
export function anchors(
  html: string,
): { href: string; title: string | null; text: string }[] {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map((m) => ({
    href: decode(/href\s*=\s*"([^"]*)"/i.exec(m[1])?.[1] ?? ""),
    title: (() => {
      const t = /title\s*=\s*"([^"]*)"/i.exec(m[1])?.[1];
      return t === undefined ? null : decode(t);
    })(),
    text: text(m[2]),
  }));
}

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

/** "2001-08-25", "25.08.2001", "Aug 25, 2001" or "25/08/2001" to ISO; null otherwise. */
export function isoDate(raw: string): string | null {
  const t = raw.trim();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ok = (y: number, m: number, d: number) =>
    m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : null;
  let m = /(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return ok(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(t);
  if (m) return ok(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4})/.exec(t);
  if (m)
    return ok(
      Number(m[3]),
      MONTHS.indexOf(m[1].toLowerCase()) + 1,
      Number(m[2]),
    );
  return null;
}
