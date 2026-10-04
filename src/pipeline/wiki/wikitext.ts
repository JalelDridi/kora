// Just enough wikitext for infoboxes: templates, parameters, links, years.

export type Link = { title: string; label: string };

/** Removes comments and references, which hide pipes and braces. */
export function stripNoise(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "");
}

function closingBraces(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length - 1; i++) {
    if (text[i] === "{" && text[i + 1] === "{") {
      depth++;
      i++;
    } else if (text[i] === "}" && text[i + 1] === "}") {
      depth--;
      if (depth === 0) return i;
      i++;
    }
  }
  return -1;
}

/** The first template whose name matches, without braces and name. */
export function findTemplate(wikitext: string, name: RegExp): string | null {
  const text = stripNoise(wikitext);
  const head = /\{\{\s*([^|{}]+?)\s*(?=\||\}\})/y;
  for (let i = text.indexOf("{{"); i !== -1; i = text.indexOf("{{", i + 2)) {
    head.lastIndex = i;
    const match = head.exec(text);
    if (!match || !name.test(match[1].replace(/_/g, " "))) continue;
    const end = closingBraces(text, i);
    return end === -1 ? null : text.slice(i + match[0].length, end);
  }
  return null;
}

/** Splits at top-level characters only (outside {{ }} and [[ ]]). */
function topLevel(text: string, char: string): number[] {
  const at: number[] = [];
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const two = text.slice(i, i + 2);
    if (two === "{{" || two === "[[") {
      depth++;
      i++;
    } else if (two === "}}" || two === "]]") {
      depth--;
      i++;
    } else if (text[i] === char && depth === 0) {
      at.push(i);
    }
  }
  return at;
}

/** The cells after each top-level pipe, trimmed: " |a|[[b|c]]" → ["a", "[[b|c]]"]. */
export function cells(text: string): string[] {
  const pipes = topLevel(text, "|");
  return pipes.map((start, index) =>
    text.slice(start + 1, pipes[index + 1] ?? text.length).trim(),
  );
}

/** Template parameters by name; positional ones as "1", "2", … */
export function splitParams(body: string): Map<string, string> {
  const params = new Map<string, string>();
  const pipes = topLevel(body, "|");
  let position = 0;
  pipes.forEach((start, index) => {
    const part = body.slice(start + 1, pipes[index + 1] ?? body.length);
    const eq = topLevel(part, "=")[0];
    if (eq === undefined) {
      position++;
      params.set(String(position), part.trim());
    } else {
      const key = part
        .slice(0, eq)
        .trim()
        .toLowerCase()
        .replace(/[_\s]+/g, " ");
      params.set(key, part.slice(eq + 1).trim());
    }
  });
  return params;
}

export function normalizeTitle(raw: string): string {
  const title = raw
    .split("#")[0]
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return title.charAt(0).toUpperCase() + title.slice(1);
}

const NOT_ARTICLE = /^(?:file|image|fichier|category|catégorie):/i;

export function links(text: string): Link[] {
  return [...text.matchAll(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g)]
    .filter((m) => !NOT_ARTICLE.test(m[1].trim()))
    .map((m) => ({
      title: normalizeTitle(m[1]),
      label: (m[2] ?? m[1]).trim(),
    }));
}

const WRAPPER = /\{\{\s*(?:nowrap|nobr|small)\s*\|([^{}]*)\}\}/gi;
const OTHER_TEMPLATE = /\{\{(?!\s*(?:nowrap|nobr|small)\s*\|)[^{}]*\}\}/gi;

/** The text a reader sees, roughly. */
export function plainText(text: string): string {
  let out = stripNoise(text).replace(/\{\{0\}\}/g, "");
  // Innermost first: {{nobr|{{FRA-d}} [[A|B]]}} loses the flag, then unwraps to [[A|B]].
  for (let i = 0; i < 5 && /\{\{[^{}]*\}\}/.test(out); i++) {
    out = out.replace(WRAPPER, "$1").replace(OTHER_TEMPLATE, "");
  }
  return out
    .replace(/\[\[([^\]|]+)\|([^\]]*)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/'{2,}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A row's wikitext for a report: whitespace collapsed, at most 200 characters. */
export function clip(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 200);
}

export function intOrNull(text: string): number | null {
  const match = /\d+/.exec(plainText(text));
  return match ? Number(match[0]) : null;
}

export function parseYears(text: string): {
  from: number | null;
  to: number | null;
  open: boolean;
} {
  const match = /(\d{4})\s*(?:([-–—])\s*(\d{2,4})?)?/.exec(plainText(text));
  if (!match) return { from: null, to: null, open: false };
  const from = Number(match[1]);
  if (match[3]) {
    const end =
      match[3].length === 2
        ? Math.floor(from / 100) * 100 + Number(match[3])
        : Number(match[3]);
    return { from, to: end, open: false };
  }
  return match[2]
    ? { from, to: null, open: true }
    : { from, to: from, open: false };
}
