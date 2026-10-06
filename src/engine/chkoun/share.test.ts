import { describe, expect, it } from "vitest";
import { LRM, shareText, type ShareInput } from "./share.ts";

// Exact strings, byte for byte (plan Task 13). "‎" below is written as
// ${M}, the left-to-right mark U+200E.
const M = LRM;

const base: ShareInput = {
  locale: "ar-TN",
  header: "Kora · شكون؟",
  number: 12,
  guesses: 4,
  solved: true,
  grid: ["xxaxax", "axgaxx", "gagaga", "gggggg"],
  streak: 3,
  streakLabel: "السلسلة",
  url: "https://kora-tn.vercel.app/ar/chkoun",
};

describe("shareText", () => {
  it("ar: header, LRM-wrapped score, rows each starting with LRM, streak, LRM then the link alone on the last line", () => {
    expect(shareText(base)).toBe(
      [
        "Kora · شكون؟",
        `${M}#12 · 4/8${M}`,
        "",
        `${M}⬛⬛🟨⬛🟨⬛`,
        `${M}🟨⬛🟩🟨⬛⬛`,
        `${M}🟩🟨🟩🟨🟩🟨`,
        `${M}🟩🟩🟩🟩🟩🟩`,
        "",
        "السلسلة: 3",
        `${M}https://kora-tn.vercel.app/ar/chkoun`,
      ].join("\n"),
    );
  });

  it("tn and fr: same structure, LRM on grid rows only, their own link", () => {
    for (const [locale, header, label, url] of [
      [
        "ar-Latn-TN",
        "Kora · Chkoun?",
        "Série",
        "https://kora-tn.vercel.app/tn/chkoun",
      ],
      [
        "fr",
        "Kora · C'est qui ?",
        "Série",
        "https://kora-tn.vercel.app/fr/chkoun",
      ],
    ]) {
      expect(
        shareText({
          ...base,
          locale,
          header,
          streakLabel: label,
          url,
          grid: ["xaxxxu", "gggggg"],
          guesses: 2,
        }),
      ).toBe(
        [
          header,
          "#12 · 2/8",
          "",
          `${M}⬛🟨⬛⬛⬛⬜`,
          `${M}🟩🟩🟩🟩🟩🟩`,
          "",
          `${label}: 3`,
          url,
        ].join("\n"),
      );
    }
  });

  it("a loss reads X/8 and has no streak line", () => {
    const text = shareText({
      ...base,
      locale: "fr",
      solved: false,
      guesses: 8,
      streak: 0,
      grid: Array(8).fill("xxxxxx"),
    });
    const lines = text.split("\n");
    expect(lines[1]).toBe("#12 · X/8");
    expect(lines).toHaveLength(2 + 1 + 8 + 1 + 1);
    expect(text).not.toContain(base.streakLabel);
  });

  it("emoji per N6: g 🟩, a 🟨, x ⬛, u ⬜", () => {
    const text = shareText({ ...base, grid: ["gaxu"] });
    expect(text).toContain(`${M}🟩🟨⬛⬜`);
  });

  it("holds no footballer name, club or flag: only the inputs' header, label and link", () => {
    const text = shareText(base);
    const allowed = new Set([
      ..."Kora · شكون؟#0123456789/X:السلسلة",
      ..."https://kora-tn.vercel.app/ar/chkoun",
      M,
      "\n",
      " ",
    ]);
    for (const ch of text.replace(/[🟩🟨⬛⬜]/gu, ""))
      expect(allowed.has(ch), JSON.stringify(ch)).toBe(true);
    // No regional-indicator letters (flags).
    expect(text).not.toMatch(/[\u{1F1E6}-\u{1F1FF}]/u);
  });

  it("rows always read club to governorate, whatever the locale", () => {
    for (const locale of ["ar-TN", "ar-Latn-TN", "fr"]) {
      const text = shareText({ ...base, locale, grid: ["gaxuxx"] });
      expect(text).toContain(`${M}🟩🟨⬛⬜⬛⬛`);
    }
  });
});
