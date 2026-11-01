// The automatic short label of a club that data/curated/club-short.json does
// not list yet (mobile polish fix round, after the branch review §1.1), so a
// club new with the nightly pool never prints a word too wide for its tile.
// The curated label always wins; data:check lists the clubs that use this
// one as a warning, so the nightly job's log shows which labels to curate.
// No imports, like grace.ts: the game page, the 30–0 page and data:check
// (run by node) all read it.
//
// The rules (Claude's call, recorded in the fix round report):
// - at most two words, each of at most 6 Latin or 8 Arabic letters: the name
//   as it is. The club tile holds 66 px of 14 px bold at 375 px, with slack
//   for other renderers (fix round 2): "Hammamet" (77.6 px) and "Gabèsien"
//   (63.8 px) do not fit with slack, so 8 Latin letters is too many without
//   a person checking the word (the curated file's limit is 7 since fix
//   round 2: Jalel picks narrow words); 8 Arabic letters fit;
// - an Arabic name: its first word that names the club (not نادي, فريق, كرة
//   القدم, الرياضي…), when there is one, cut to 8 letters if longer, never
//   between a lam and the alef that follows it (they are drawn as one sign);
//   a first word of at most 4 letters ("أم صلال", "سان دييغو") keeps the
//   next word when it fits; "بالحمامات" (in Hammamet) loses its "ب";
// - a Latin name: the initials of its words (split at spaces, hyphens and
//   slashes, "d'" and "l'" dropped; "R.F.C." and "FC" give all their
//   letters), up to 4 capitals. Connecting words (de, du, el, al, the…) and
//   numbers (1961) are left out when two initials remain without them.
//   FC, AS, Club and Sportif are kept, as fans write them (CSHL, EST, USM);
// - a single long Latin word: its first 5 letters and a dot.

/** The longest Latin word printed without a person checking it. */
const LATIN_WORD = 6;
/** The longest Arabic word (Arabic letters are narrower). */
const ARABIC_WORD = 8;
const CAPITALS = 4;

const CONNECTORS = new Set([
  "de",
  "du",
  "des",
  "la",
  "le",
  "les",
  "el",
  "al",
  "of",
  "the",
  "and",
  "et",
  "y",
  "da",
  "do",
  "di",
]);
/** "Club", "team", "football", "sporting": they name no club. */
const ARABIC_CLUB = new Set([
  "نادي",
  "النادي",
  "فريق",
  "الفريق",
  "كرة",
  "لكرة",
  "القدم",
  "الرياضي",
  "الرياضية",
]);
/** A first word this short ("أم", "سان", "نفط") takes the next one with it. */
const ARABIC_SHORT = 4;
const ARABIC = /\p{Script=Arabic}/u;
const LAM = "ل";
const ALEFS = new Set(["ا", "أ", "إ", "آ"]);

/** An abbreviation written with dots: "R.F.C.", "F.C". */
const DOTTED = /^(?:\p{L}\.)+\p{L}?\.?$/u;
/** An abbreviation in capitals: "FC", "SCC". */
const ACRONYM = /^\p{Lu}{2,3}$/u;

const length = (word: string) => [...word].length;

/** The first `n` letters of a word, never splitting a mark or a lam-alef. */
function cut(word: string, n: number): string {
  const chars = [...word];
  let end = Math.min(n, chars.length);
  while (
    end > 1 &&
    end < chars.length &&
    (/\p{M}/u.test(chars[end]) ||
      (chars[end - 1] === LAM && ALEFS.has(chars[end])))
  )
    end -= 1;
  return chars.slice(0, end).join("");
}

export function autoShort(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const arabic = ARABIC.test(name);
  const word = arabic ? ARABIC_WORD : LATIN_WORD;
  if (words.length <= 2 && words.every((w) => length(w) <= word)) return name;
  if (arabic) {
    const telling = words.filter((w) => !ARABIC_CLUB.has(w));
    // "بالحمامات" (in Hammamet) is the town's name: "الحمامات".
    const [first, second] = (telling.length > 0 ? telling : words).map((w) =>
      w.startsWith("بال") && length(w) > 4 ? w.slice(1) : w,
    );
    if (length(first) <= ARABIC_SHORT && second && length(second) <= word)
      return `${first} ${second}`;
    return length(first) <= word ? first : cut(first, word);
  }
  const tokens = name
    .split(/[\s\-/]+/)
    .map((t) => t.replace(/^[dl]['’]/i, ""))
    .filter((t) => /[\p{L}\p{N}]/u.test(t));
  const significant = tokens.filter(
    (t) => !CONNECTORS.has(t.toLowerCase()) && !/^\p{N}+$/u.test(t),
  );
  const kept = significant.length >= 2 ? significant : tokens;
  // "R.F.C." and "FC" give all their letters; any other word its first one.
  const initials = kept.flatMap((t) =>
    DOTTED.test(t) || ACRONYM.test(t)
      ? (t.match(/\p{L}/gu) ?? [])
      : [t.match(/[\p{L}\p{N}]/u)![0]],
  );
  if (initials.length >= 2)
    return initials.slice(0, CAPITALS).join("").toUpperCase();
  return `${cut(kept[0] ?? name, LATIN_WORD - 1)}.`;
}
