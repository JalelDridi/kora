// Ranking footballers for a typed query (name-search research §3).
// Scores, lower is better:
//   0      a folded name token starts with the query
//   0.5    a name's key (from any token on) starts with the query's key; a
//          one-letter key must equal a whole token's key
//   0.8    every query token starts a name token, in order; one extra query
//          token (or "ben <father>") may be left over when at least two match
//   1 + d  the query's key is within d edits of the start of a name's key
//          (d ≤ 1, or ≤ 2 when the key has 7 letters or more)
// Ties go to the more famous footballer, then to the id.

import { key } from "./key.ts";
import { hasArticle, normalise } from "./normalise.ts";

export type NameSource = {
  id: string;
  nameLatin: string;
  nameArabic: string | null;
  nameFrench: string | null;
  aliases: string[];
  fame: number;
};

/**
 * What the search needs about one footballer, and nothing else: its folded
 * name tokens (one list per name), the keys of every suffix of each name, and
 * a fame for ties.
 */
export type SearchEntry = {
  id: string;
  tokens: string[][];
  keys: string[];
  fame: number;
};

/** Every combination of the per-token keys, concatenated. */
function combinations(tokenKeys: string[][]): string[] {
  let out = [""];
  for (const options of tokenKeys) {
    const next: string[] = [];
    for (const prefix of out)
      for (const k of options) next.push(collapseJoin(prefix, k));
    out = next;
  }
  return out;
}

/** Joining two keys collapses a doubled letter at the seam, like key() does. */
function collapseJoin(a: string, b: string): string {
  if (a !== "" && b !== "" && a[a.length - 1] === b[0]) return a + b.slice(1);
  return a + b;
}

function nameKeys(tokens: string[]): string[] {
  const tokenKeys = tokens.map(key);
  const keys = new Set<string>();
  for (let i = 0; i < tokens.length; i++)
    for (const k of combinations(tokenKeys.slice(i))) if (k !== "") keys.add(k);
  return [...keys];
}

/** Raw tokens, plus each Arabic token without its article. */
function rawTokens(tokens: string[]): string[] {
  return tokens.flatMap((t) => (hasArticle(t) ? [t, t.slice(2)] : [t]));
}

export function buildEntries(names: NameSource[]): SearchEntry[] {
  return names.map((n) => {
    const all = [n.nameLatin, n.nameArabic, n.nameFrench, ...n.aliases]
      .filter((s): s is string => typeof s === "string" && s.trim() !== "")
      .map(normalise)
      .filter((t) => t.length > 0);
    const unique = [...new Map(all.map((t) => [t.join(" "), t])).values()];
    const keys = new Set<string>();
    for (const t of unique) for (const k of nameKeys(t)) keys.add(k);
    return { id: n.id, tokens: unique, keys: [...keys], fame: n.fame };
  });
}

const rowA = new Int32Array(64);
const rowB = new Int32Array(64);

/**
 * Levenshtein distance between `a` and the first `a.length` letters of `b`,
 * giving up (Infinity) above `max`. Allocation-free: it runs for every key on
 * every keystroke.
 */
function prefixDistance(a: string, b: string, max: number): number {
  const n = Math.min(a.length, b.length);
  if (a.length > 63 || a.length - n > max) return Infinity;
  let prev = rowA;
  let cur = rowB;
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let best = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      let v = prev[j - 1] + cost;
      if (prev[j] + 1 < v) v = prev[j] + 1;
      if (cur[j - 1] + 1 < v) v = cur[j - 1] + 1;
      cur[j] = v;
      if (v < best) best = v;
    }
    if (best > max) return Infinity;
    const swap = prev;
    prev = cur;
    cur = swap;
  }
  return prev[n] > max ? Infinity : prev[n];
}

type Query = {
  raw: string;
  tokens: string[];
  tokenKeys: string[][];
  keys: string[];
};

function prepare(query: string): Query | null {
  const tokens = normalise(query);
  const letters = tokens.join("");
  if ([...letters].length < 2) return null;
  const tokenKeys = tokens.map(key);
  return {
    raw: letters,
    tokens,
    tokenKeys,
    keys: combinations(tokenKeys).filter((k) => k !== ""),
  };
}

const tokenKeyCache = new WeakMap<string[], string[][]>();
function keysOf(tokens: string[]): string[][] {
  let cached = tokenKeyCache.get(tokens);
  if (!cached) {
    cached = tokens.map(key);
    tokenKeyCache.set(tokens, cached);
  }
  return cached;
}

/** Does query token `q` start name token `t` (raw, or by key)? */
function startsToken(
  q: string,
  qKeys: string[],
  t: string,
  tKeys: string[],
): boolean {
  if (t.startsWith(q)) return true;
  if (hasArticle(t) && t.slice(2).startsWith(q)) return true;
  return qKeys.some((qk) => qk !== "" && tKeys.some((tk) => tk.startsWith(qk)));
}

const PATRONYMIC = new Set(["ben", "bin", "ibn", "بن", "ابن"]);

/** Query tokens matched in order against a name's tokens, with one unit skipped at most. */
function inOrder(q: Query, tokens: string[]): boolean {
  if (q.tokens.length < 2) return false;
  const tKeys = keysOf(tokens);
  const tryFrom = (skipAt: number, skipLength: number): boolean => {
    let j = 0;
    let matched = 0;
    for (let i = 0; i < q.tokens.length; i++) {
      if (i >= skipAt && i < skipAt + skipLength) continue;
      while (
        j < tokens.length &&
        !startsToken(q.tokens[i], q.tokenKeys[i], tokens[j], tKeys[j])
      )
        j++;
      if (j === tokens.length) return false;
      j++;
      matched++;
    }
    return skipLength === 0 || matched >= 2;
  };
  if (tryFrom(-1, 0)) return true;
  for (let i = 0; i < q.tokens.length; i++) {
    if (tryFrom(i, 1)) return true;
    if (PATRONYMIC.has(q.tokens[i]) && tryFrom(i, 2)) return true;
  }
  return false;
}

const rawCache = new WeakMap<SearchEntry, string[]>();
function rawOf(entry: SearchEntry): string[] {
  let cached = rawCache.get(entry);
  if (!cached) {
    cached = entry.tokens.flatMap(rawTokens);
    rawCache.set(entry, cached);
  }
  return cached;
}

/** Scores 0 and 0.5; Infinity when neither applies. */
function prefixScore(q: Query, entry: SearchEntry): number {
  if (q.tokens.length === 1 && rawOf(entry).some((t) => t.startsWith(q.raw)))
    return 0;
  for (const qk of q.keys) {
    if (qk.length === 1) {
      if (entry.tokens.some((t) => keysOf(t).some((ks) => ks.includes(qk))))
        return 0.5;
    } else if (entry.keys.some((k) => k.startsWith(qk))) return 0.5;
  }
  return Infinity;
}

/** Score 1 + d; Infinity when no key is close enough. */
function fuzzyScore(q: Query, entry: SearchEntry): number {
  let best = Infinity;
  for (const qk of q.keys) {
    if (qk.length < 3) continue;
    const max = qk.length >= 7 ? 2 : 1;
    for (const k of entry.keys) {
      const d = prefixDistance(qk, k, max);
      if (d < best) best = d;
      if (best === 0) break;
    }
  }
  return best === Infinity ? Infinity : 1 + best;
}

/** The ids of the best `limit` footballers for `query`; none for under two letters. */
export function match(
  entries: SearchEntry[],
  query: string,
  limit = 5,
): string[] {
  const q = prepare(query);
  if (q === null) return [];
  // Each pass only runs while the better passes found fewer than `limit`
  // footballers: a worse score can never climb above them.
  const scores = new Map<SearchEntry, number>();
  const passes: ((e: SearchEntry) => number)[] = [
    (e) => prefixScore(q, e),
    (e) => (e.tokens.some((t) => inOrder(q, t)) ? 0.8 : Infinity),
    (e) => fuzzyScore(q, e),
  ];
  for (const pass of passes) {
    if (scores.size >= limit) break;
    for (const e of entries) {
      if (scores.has(e)) continue;
      const s = pass(e);
      if (s !== Infinity) scores.set(e, s);
    }
  }
  const scored = [...scores].map(([e, s]) => ({ id: e.id, s, fame: e.fame }));
  scored.sort(
    (a, b) =>
      a.s - b.s || b.fame - a.fame || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return scored.slice(0, limit).map((x) => x.id);
}
