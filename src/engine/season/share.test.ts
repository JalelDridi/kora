import { describe, expect, it } from "vitest";
import { seasonShareText, shareUrl } from "./share.ts";

// Exact strings, byte for byte (plan Task 11). "‎" below is the
// left-to-right mark U+200E, written as ${M}.
const M = "‎";
const U = "https://kora-tn.vercel.app/ar/season/r/2026-10-07/a_0~b_1";

const input = {
  header: "Kora · 30–0",
  w: 28,
  d: 2,
  l: 0,
  points: 86,
  pointsLabel: "نقطة",
  rating: 91.2,
  ratingLabel: "تقييم",
  url: U,
};

describe("seasonShareText", () => {
  it("ar: header, LRM-wrapped record and points, rating, LRM then the link alone on the last line", () => {
    expect(seasonShareText(input)).toBe(
      [
        "Kora · 30–0",
        `${M}28-2-0 · 86 نقطة${M}`,
        `${M}تقييم 91.2${M}`,
        `${M}${U}`,
      ].join("\n"),
    );
  });

  it("a perfect season reads 30-0-0", () =>
    expect(
      seasonShareText({ ...input, w: 30, d: 0, l: 0, points: 90 }),
    ).toContain("30-0-0 · 90"));

  it("Western digits only, and nothing but the inputs in the text", () => {
    const text = seasonShareText(input);
    expect(text).not.toMatch(/[٠-٩۰-۹]/);
    expect(text.split("\n")).toHaveLength(4);
  });

  it("a whole rating keeps its decimal, as the result shows it", () =>
    expect(seasonShareText({ ...input, rating: 80 })).toContain(
      `${M}تقييم 80.0${M}`,
    ));

  it("fr and Arabizi read the same, marks included (they are invisible)", () => {
    const text = seasonShareText({
      ...input,
      header: "Kora · 30–0",
      pointsLabel: "pts",
      ratingLabel: "Note",
      url: "https://kora-tn.vercel.app/fr/season/r/2026-10-07/a_0~b_1",
    });
    expect(text.split("\n")[1]).toBe(`${M}28-2-0 · 86 pts${M}`);
    expect(text.split("\n").at(-1)).toMatch(/^‎https:\/\/[^\n]+$/);
  });
});

describe("shareUrl", () => {
  it("shareUrl puts the day and the code under the sharer's locale", () =>
    expect(
      shareUrl("https://kora-tn.vercel.app", "/tn", "2026-10-07", "a_0~b_1"),
    ).toBe("https://kora-tn.vercel.app/tn/season/r/2026-10-07/a_0~b_1"));
});
