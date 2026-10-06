import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { shownCountryCodes } from "@/chkoun/labels";
import type { Pool } from "@/pipeline/types.ts";
import arLatnTN from "../../messages/countries/ar-Latn-TN.json";
import arTN from "../../messages/countries/ar-TN.json";

// Country names in Derja are Jalel's (D-S2-12): the files in
// messages/countries hold one name per code the game can show. French needs
// no file: it comes from Intl.DisplayNames. Until he writes them, the files
// carry the French names as placeholders (docs/strings-for-jalel.md, blocking).

const pool = JSON.parse(
  readFileSync(new URL("../../data/pool.json", import.meta.url), "utf8"),
) as Pool;

const files: Record<string, Record<string, string>> = {
  "ar-TN": arTN,
  "ar-Latn-TN": arLatnTN,
};

describe("country names", () => {
  const codes = shownCountryCodes(pool);

  it("are needed for some countries (the list Jalel fills in)", () => {
    expect(codes.length).toBeGreaterThan(10);
    expect(codes).toContain("TN");
  });

  for (const [locale, names] of Object.entries(files)) {
    it(`every club country and birth country of an active footballer has a name in ${locale}`, () => {
      for (const code of codes)
        expect(names[code]?.trim(), `${locale} ${code}`).toBeTruthy();
    });

    it(`${locale} uses Western digits and no unknown code`, () => {
      for (const [code, name] of Object.entries(names)) {
        expect(code).toMatch(/^[A-Z]{2}$/);
        expect(name).not.toMatch(/[٠-٩۰-۹]/);
      }
    });
  }

  it("both Derja files name the same codes", () => {
    expect(Object.keys(arTN).sort()).toEqual(Object.keys(arLatnTN).sort());
  });
});
