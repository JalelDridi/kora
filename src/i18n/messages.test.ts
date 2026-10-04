import { describe, expect, it } from "vitest";
import arLatnTN from "../../messages/ar-Latn-TN.json";
import arTN from "../../messages/ar-TN.json";
import fr from "../../messages/fr.json";
import { locales, type Locale } from "./locales";

type Tree = { [key: string]: string | Tree };

const messages: Record<Locale, Tree> = {
  "ar-TN": arTN,
  "ar-Latn-TN": arLatnTN,
  fr,
};

function flatten(tree: Tree, path = ""): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>(
    (flat, [key, value]) => {
      const full = path ? `${path}.${key}` : key;
      return typeof value === "string"
        ? { ...flat, [full]: value }
        : { ...flat, ...flatten(value, full) };
    },
    {},
  );
}

describe("messages", () => {
  it("define the same keys in every locale", () => {
    const reference = Object.keys(flatten(messages["ar-TN"])).sort();
    expect(reference.length).toBeGreaterThan(0);
    for (const locale of locales) {
      expect(Object.keys(flatten(messages[locale])).sort()).toEqual(reference);
    }
  });

  it("leave no string empty", () => {
    for (const locale of locales) {
      for (const [key, value] of Object.entries(flatten(messages[locale]))) {
        expect(value.trim(), `${locale} ${key}`).not.toBe("");
      }
    }
  });

  it("use Western digits only (design §5)", () => {
    for (const locale of locales) {
      for (const [key, value] of Object.entries(flatten(messages[locale]))) {
        expect(value, `${locale} ${key}`).not.toMatch(/[٠-٩۰-۹]/);
      }
    }
  });
});
