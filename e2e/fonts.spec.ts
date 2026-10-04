import { expect, test, type Page } from "@playwright/test";
import { localeInfo, locales } from "../src/i18n/locales";

// Chrome serialises unicode-range as "U+0-FF, …" for the Latin subset and
// "U+600-6FF, …" for Arabic.
const isLatin = (range: string) => /U\+0+-0*FF\b/i.test(range);
const isArabic = (range: string) => /U\+0*600-0*6FF\b/i.test(range);

// Faces fetched from the server. next/font's "… Fallback" faces are local
// system fonts (no download), so they are left out.
async function loadedFaces(page: Page) {
  return page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts]
      .filter((f) => f.status === "loaded" && !/Fallback/.test(f.family))
      .map((f) => ({
        family: f.family,
        weight: f.weight,
        range: f.unicodeRange,
      }));
  });
}

for (const locale of locales) {
  const { prefix } = localeInfo[locale];
  test(`${prefix} preloads one font file, the Latin face`, async ({ page }) => {
    await page.goto(prefix);
    await expect(page.locator('link[rel="preload"][as="font"]')).toHaveCount(1);
  });
}

test("/ar sets Latin fragments in Inter and Arabic in Plex", async ({
  page,
}) => {
  await page.goto("/ar", { waitUntil: "networkidle" });
  const faces = await loadedFaces(page);
  const plex = faces.filter((f) => /Plex/i.test(f.family));
  expect(plex.filter((f) => isLatin(f.range))).toEqual([]);
  expect(plex.some((f) => isArabic(f.range))).toBe(true);
  expect(faces.some((f) => /Inter/i.test(f.family) && isLatin(f.range))).toBe(
    true,
  );
});

for (const prefix of ["/tn", "/fr"]) {
  test(`${prefix} downloads one Arabic weight, for the switcher's label`, async ({
    page,
  }) => {
    await page.goto(prefix, { waitUntil: "networkidle" });
    const plex = (await loadedFaces(page)).filter((f) =>
      /Plex/i.test(f.family),
    );
    expect(plex.map((f) => f.weight)).toEqual(["600"]);
  });
}
