import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { localeInfo, locales } from "./i18n/locales";
import {
  alternateOpenGraphLocales,
  openGraphLocale,
  shareImageMaxBytes,
  shareImagePath,
  shareImageSize,
} from "./share";

describe("share images", () => {
  it("live under /og with the locale prefix and a version", () => {
    expect(locales.map((l) => shareImagePath(localeInfo[l].prefix))).toEqual([
      "/og/ar-v1.png",
      "/og/tn-v1.png",
      "/og/fr-v1.png",
    ]);
  });

  // The PNGs are committed (rendered by `pnpm images`): this catches a
  // missing, resized or bloated file before Facebook or WhatsApp does.
  for (const locale of locales) {
    const path = shareImagePath(localeInfo[locale].prefix);
    it(`${path} is a 1200×630 PNG under 250 KB`, () => {
      const file = readFileSync(new URL(`../public${path}`, import.meta.url));
      expect(file.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect({
        width: file.readUInt32BE(16),
        height: file.readUInt32BE(20),
      }).toEqual(shareImageSize);
      expect(file.length).toBeLessThanOrEqual(shareImageMaxBytes);
    });
  }
});

describe("Open Graph locales", () => {
  it("use ar_AR for both Derja scripts and fr_FR for French (H7)", () => {
    expect(openGraphLocale).toEqual({
      "ar-TN": "ar_AR",
      "ar-Latn-TN": "ar_AR",
      fr: "fr_FR",
    });
  });

  it("list each other locale once as an alternate", () => {
    expect(alternateOpenGraphLocales("ar-TN")).toEqual(["fr_FR"]);
    expect(alternateOpenGraphLocales("ar-Latn-TN")).toEqual(["fr_FR"]);
    expect(alternateOpenGraphLocales("fr")).toEqual(["ar_AR"]);
  });
});
