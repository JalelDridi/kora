import { describe, expect, it } from "vitest";
import { firstLetter, hinted, HINT_AFTER, letterFor } from "./hint.ts";

describe("the first-letter hint", () => {
  it("is the first letter as written, Latin in capitals", () => {
    expect(firstLetter("ellyes Skhiri")).toBe("E");
    expect(firstLetter("  إلياس السخيري")).toBe("إ");
    expect(firstLetter("Éric")).toBe("É");
    expect(firstLetter(null)).toBeNull();
    expect(firstLetter("  ")).toBeNull();
  });
  it("a win after the 5th guess is a hinted win", () => {
    expect(HINT_AFTER).toBe(5);
    expect([5, 6, 8].map((k) => hinted(true, k))).toEqual([false, true, true]);
    expect(hinted(false, 8)).toBe(false);
  });
  it("is never more than one letter, whatever the name", () => {
    for (const name of [
      "Ellyes Skhiri",
      "إلياس السخيري",
      "Ïssam Jebali",
      "Œdipe",
      "ß",
      "x",
      "عبد الله",
    ])
      expect([...firstLetter(name)!]).toHaveLength(1);
  });
  it("each page shows its own name form's letter, the Latin one where it has none", () => {
    const hint = { latin: "E", arabic: "إ", french: "É" };
    expect(letterFor(hint, "ar-TN")).toBe("إ");
    expect(letterFor(hint, "fr")).toBe("É");
    expect(letterFor(hint, "ar-Latn-TN")).toBe("E");
    const latinOnly = { latin: "E", arabic: null, french: null };
    expect(letterFor(latinOnly, "ar-TN")).toBe("E");
    expect(letterFor(latinOnly, "fr")).toBe("E");
  });
});
