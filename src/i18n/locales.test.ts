import { describe, expect, it } from "vitest";
import { defaultLocale, isLocale, localeInfo, locales } from "./locales";

describe("locales", () => {
  it("offers Derja in Arabic script, Derja in Arabizi, then French", () => {
    expect(locales).toEqual(["ar-TN", "ar-Latn-TN", "fr"]);
  });

  it("defaults to Derja in Arabic script (decision D2)", () => {
    expect(defaultLocale).toBe("ar-TN");
  });

  it("uses language tags the platform accepts as written", () => {
    for (const locale of locales) {
      expect(Intl.getCanonicalLocales(locale)).toEqual([locale]);
    }
  });

  it("lays out Arabic script right to left and the others left to right", () => {
    expect(localeInfo["ar-TN"].dir).toBe("rtl");
    expect(localeInfo["ar-Latn-TN"].dir).toBe("ltr");
    expect(localeInfo.fr.dir).toBe("ltr");
  });

  it("gives each locale a short URL prefix", () => {
    expect(locales.map((locale) => localeInfo[locale].prefix)).toEqual([
      "/ar",
      "/tn",
      "/fr",
    ]);
  });

  it("formats numbers with Western digits in every locale (design §5)", () => {
    for (const locale of locales) {
      const format = new Intl.NumberFormat(localeInfo[locale].intl);
      expect(format.format(30)).toBe("30");
    }
  });

  it("recognises its own locales and nothing else", () => {
    expect(isLocale("ar-TN")).toBe(true);
    expect(isLocale("fr")).toBe(true);
    expect(isLocale("tn")).toBe(false);
    expect(isLocale("en")).toBe(false);
  });
});
