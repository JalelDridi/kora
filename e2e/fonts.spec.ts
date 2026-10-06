import { expect, test, type Page } from "@playwright/test";
import { localeInfo, locales } from "../src/i18n/locales";
import { seedChkoun } from "./fixtures/chkoun";

// Some tests open the game page, which asks the server for today's puzzle
// and has it remember the answer: seed first, like the other specs.
test.beforeAll(async () => {
  await seedChkoun();
});

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
  // /ar preloads its Arabic body and bold faces too, so their late arrival
  // cannot reflow the page (CI measured CLS 0.37 on /ar/chkoun from the
  // Arabic font swap); /tn and /fr preload only Inter (they need one Arabic
  // weight, for the switcher's label).
  for (const path of ["", "/chkoun", "/sources"]) {
    test(`${prefix}${path} preloads ${locale === "ar-TN" ? "Inter and the Arabic 400 and 700 faces" : "one font file, the Latin face"}`, async ({
      page,
    }) => {
      await page.goto(`${prefix}${path}`);
      const hrefs = await page
        .locator('link[rel="preload"][as="font"]')
        .evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
      const arabic = hrefs.filter((h) => h.startsWith("/fonts/plex-arabic-"));
      expect(hrefs.length - arabic.length).toBe(1);
      expect(arabic.sort()).toEqual(
        locale === "ar-TN"
          ? [
              "/fonts/plex-arabic-400-v1.woff2",
              "/fonts/plex-arabic-700-v1.woff2",
            ]
          : [],
      );
    });
  }
}

test("the preloaded Arabic faces are the ones the page uses, cached for a year", async ({
  page,
  request,
}) => {
  await page.goto("/ar/chkoun", { waitUntil: "networkidle" });
  const used = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts]
      .filter((f) => /Plex/.test(f.family) && f.status === "loaded")
      .map((f) => f.weight)
      .sort();
  });
  expect(used).toEqual(expect.arrayContaining(["400", "700"]));
  for (const weight of [400, 600, 700]) {
    const response = await request.get(`/fonts/plex-arabic-${weight}-v1.woff2`);
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("immutable");
  }
});

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
