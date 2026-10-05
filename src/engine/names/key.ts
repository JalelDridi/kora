// The consonant skeleton both scripts share (name-search research §3):
// "mejbri" and "المجبري" both give MJBR. Rules R1 to R16.

import { hasArticle, isArabic } from "./normalise.ts";

// Longest first: digraphs before single letters.
const LATIN_RULES: [RegExp, string][] = [
  [/^(ch|sh)/, "C"],
  [/^kh/, "X"],
  [/^gh/, "G"],
  [/^dh/, "D"],
  [/^th/, "T"],
  [/^dj/, "J"],
  [/^ph/, "F"],
  [/^gu(?=[ei])/, "K"],
  [/^qu/, "K"],
  [/^c(?=[eiy])/, "S"],
  [/^ou/, ""],
];

const LATIN_LETTERS: Record<string, string> = {
  "3": "",
  "2": "",
  "7": "H",
  "5": "X",
  "9": "K",
  "8": "G",
  "6": "T",
  a: "",
  e: "",
  i: "",
  o: "",
  u: "",
  y: "",
  w: "",
  b: "B",
  c: "K",
  d: "D",
  f: "F",
  g: "K",
  h: "H",
  j: "J",
  k: "K",
  l: "L",
  m: "M",
  n: "N",
  p: "B",
  q: "K",
  r: "R",
  s: "S",
  t: "T",
  v: "F",
  x: "KS",
  z: "Z",
};

const ARABIC_LETTERS: Record<string, string> = {
  ب: "B",
  ت: "T",
  ط: "T",
  ث: "T",
  ج: "J",
  ح: "H",
  ه: "H",
  خ: "X",
  د: "D",
  ذ: "D",
  ض: "D",
  ظ: "D",
  ر: "R",
  ز: "Z",
  س: "S",
  ص: "S",
  ش: "C",
  غ: "G",
  ف: "F",
  ق: "K",
  ك: "K",
  ل: "L",
  م: "M",
  ن: "N",
  ا: "",
  و: "",
  ي: "",
  ع: "",
};

function collapse(s: string): string {
  return s.replace(/(.)\1+/g, "$1");
}

function latinKey(token: string): string {
  let out = "";
  let rest = token;
  while (rest.length > 0) {
    const rule = LATIN_RULES.find(([re]) => re.test(rest));
    if (rule) {
      const [re, value] = rule;
      out += value;
      rest = rest.replace(re, "");
      continue;
    }
    out += LATIN_LETTERS[rest[0]] ?? "";
    rest = rest.slice(1);
  }
  return collapse(out);
}

function arabicKey(token: string): string {
  // A final ه (often a folded ة) is silent.
  const body = token.endsWith("ه") ? token.slice(0, -1) : token;
  let out = "";
  for (const c of body) out += ARABIC_LETTERS[c] ?? "";
  return collapse(out);
}

/**
 * One key per token; two when an Arabic token starts with ال (with the
 * article and without it, R13).
 */
export function key(token: string): string[] {
  if (!isArabic(token)) return [latinKey(token)];
  if (hasArticle(token)) {
    const withArticle = arabicKey(token);
    const without = arabicKey(token.slice(2));
    return withArticle === without ? [without] : [without, withArticle];
  }
  return [arabicKey(token)];
}
