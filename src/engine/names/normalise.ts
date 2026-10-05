// Folding a name or a query into comparable tokens (name-search research §3,
// rules R13, R17 to R20). Pure; the game page runs it on every keystroke.

const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\uFEFF]/g;
const TASHKEEL = /[\u064B-\u065F\u0670\u0640]/g;

const ARABIC_FOLDS: Record<string, string> = {
  أ: "ا",
  إ: "ا",
  آ: "ا",
  ٱ: "ا",
  ى: "ي",
  ة: "ه",
  ؤ: "و",
  ئ: "ي",
  ء: "",
  ڨ: "ق",
  گ: "ق",
  ی: "ي",
  ک: "ك",
  چ: "ج",
  ڤ: "ف",
  پ: "ب",
};
const ARABIC_FOLD = new RegExp(`[${Object.keys(ARABIC_FOLDS).join("")}]`, "g");

/** Latin articles dropped as whole tokens: "el", "al", "es", "en". */
const DROPPED = new Set(["el", "al", "es", "en"]);

const SEPARATORS = /[\s\-‐‑–—'’ʼ`´.,()/_]+/u;

/** One string folded: invisible marks, tashkeel, hamza forms, case, accents. */
export function fold(s: string): string {
  return s
    .normalize("NFKC")
    .replace(INVISIBLE, "")
    .replace(TASHKEEL, "")
    .replace(ARABIC_FOLD, (c) => ARABIC_FOLDS[c])
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .normalize("NFC");
}

/** The folded tokens of a name or a query. */
export function normalise(s: string): string[] {
  return fold(s)
    .split(SEPARATORS)
    .filter((t) => t !== "" && !DROPPED.has(t));
}

/** True when the token is written in Arabic script. */
export function isArabic(token: string): boolean {
  return /[\u0600-\u06FF]/.test(token);
}

/** A token starting with the article ال, which may or may not be typed (R13). */
export function hasArticle(token: string): boolean {
  return token.startsWith("ال") && token.length > 3;
}
