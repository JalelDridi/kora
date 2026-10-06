// The spoiler-free share text (N6, D-S2-10, plan Task 13). Pure.
//
// Rows always read club to governorate, left to right, in every language
// and every app (N6): each grid row starts with a left-to-right mark, so a
// right-to-left chat bubble cannot mirror it. In Arabic script the score
// line is wrapped in marks too, so "#12 · 4/8" is never reordered, and the
// link sits alone on the last line after a mark (D-S2-10). No footballer,
// club or flag ever appears.

/** U+200E LEFT-TO-RIGHT MARK. */
export const LRM = "‎";

export const MAX_GUESSES = 8;

/** g green, a amber, x grey, u unknown ("?"), per N6. */
export const SHARE_EMOJI: Record<string, string> = {
  g: "🟩",
  a: "🟨",
  x: "⬛",
  u: "⬜",
};

export type ShareInput = {
  /** "ar-TN", "ar-Latn-TN" or "fr": only Arabic script gets the extra marks. */
  locale: string;
  /** The game's name as the share text says it. */
  header: string;
  number: number;
  /** Guesses used; shown only for a win (a loss reads X/8). */
  guesses: number;
  solved: boolean;
  /** One six-letter colour key per guess, club to governorate. */
  grid: string[];
  /** The streak after this game; no line when it is 0 or unknown. */
  streak: number | null;
  streakLabel: string;
  /** The game in the sharer's language, absolute (Q4.1). */
  url: string;
};

export function shareText(input: ShareInput): string {
  const rtl = input.locale === "ar-TN";
  const score = `#${input.number} · ${input.solved ? input.guesses : "X"}/${MAX_GUESSES}`;
  const rows = input.grid.map(
    (key) =>
      LRM +
      [...key].map((letter) => SHARE_EMOJI[letter] ?? SHARE_EMOJI.u).join(""),
  );
  const lines = [
    input.header,
    rtl ? `${LRM}${score}${LRM}` : score,
    "",
    ...rows,
    "",
  ];
  if (input.streak !== null && input.streak > 0)
    lines.push(`${input.streakLabel}: ${input.streak}`);
  lines.push(rtl ? `${LRM}${input.url}` : input.url);
  return lines.join("\n");
}
