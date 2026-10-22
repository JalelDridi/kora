import { describe, expect, it } from "vitest";
import arLatnTN from "../../messages/ar-Latn-TN.json";
import arTN from "../../messages/ar-TN.json";
import fr from "../../messages/fr.json";
import { format } from "@/chkoun/labels";
import { FORMATION } from "@/engine/season/draft";
import { RATING } from "@/engine/season/rating";
import { capsBandText, decadeLabel, ratingBand, SLOT_LINES } from "./labels";

type Messages = typeof fr;

/** A next-intl-like t() over one locale's `season` strings. */
const tFor =
  (m: Messages) =>
  (key: string, values?: Record<string, number>): string => {
    const text = key
      .split(".")
      .reduce<unknown>(
        (node, part) => (node as Record<string, unknown>)[part],
        m.season,
      );
    if (typeof text !== "string") throw new Error(`no string ${key}`);
    return format(text, values ?? {});
  };

describe("decadeLabel", () => {
  it("decades keep Western digits in every locale", () => {
    for (const m of [fr, arTN, arLatnTN] as Messages[]) {
      expect(decadeLabel(1990, tFor(m))).toMatch(/1990/);
      expect(decadeLabel(2020, tFor(m))).not.toMatch(/[٠-٩۰-۹]/);
    }
  });
});

describe("ratingBand", () => {
  it("rating bands: 69 → 60, 70 → 70, 99 → 90", () =>
    expect([60, 69, 70, 89, 90, 99].map(ratingBand)).toEqual([
      "60",
      "60",
      "70",
      "80",
      "90",
      "90",
    ]));
});

describe("SLOT_LINES", () => {
  it("is the engine's formation, copied so the browser imports no engine code", () =>
    expect(SLOT_LINES).toEqual(FORMATION));
});

describe("capsBandText", () => {
  it("names the band of every midpoint the rating uses (D-S3-6)", () =>
    expect(RATING.bandCaps.map(capsBandText)).toEqual([
      "0",
      "1-9",
      "10-29",
      "30-59",
      "60+",
    ]));
});
