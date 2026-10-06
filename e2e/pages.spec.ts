import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import arLatnTN from "../messages/ar-Latn-TN.json";
import arTN from "../messages/ar-TN.json";
import fr from "../messages/fr.json";
import { localeInfo, locales } from "../src/i18n/locales";
import { photoCredits } from "../src/sources";
import { footballer, pool } from "./chkoun-helpers";
import { type ChkounFixture, seedChkoun } from "./fixtures/chkoun";

// The Sources page and the privacy draft (plan Task 14), and the footer that
// links to them from every page.

const messages = { "ar-TN": arTN, "ar-Latn-TN": arLatnTN, fr };

// Seeded before any page asks the server for today's puzzle.
let fixture: ChkounFixture;
test.beforeAll(async () => {
  fixture = await seedChkoun();
});

for (const locale of locales) {
  const { prefix, dir } = localeInfo[locale];
  const m = messages[locale];

  for (const [route, title] of [
    ["/sources", m.sources.title],
    ["/privacy", m.privacy.title],
  ] as const) {
    const url = `${prefix}${route}`;

    test(`${url} exists with its title, canonical and language alternates`, async ({
      page,
    }) => {
      const response = await page.goto(url);
      expect(response?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("dir", dir);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        new RegExp(`${url}$`),
      );
      for (const other of locales)
        await expect(
          page.locator(`link[rel="alternate"][hreflang="${other}"]`),
        ).toHaveAttribute(
          "href",
          new RegExp(`${localeInfo[other].prefix}${route}$`),
        );
      await expect(page.locator('head meta[name="robots"]')).toHaveCount(0);
    });

    test(`${url} passes axe and fits 320 px without sideways scrolling`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto(url);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
    });
  }

  test(`${prefix}/privacy says it is a draft, on top`, async ({ page }) => {
    await page.goto(`${prefix}/privacy`);
    const note = page.getByRole("note");
    await expect(note).toHaveText(m.privacy.draft);
    const noteBox = await note.boundingBox();
    const h1Box = await page.getByRole("heading", { level: 1 }).boundingBox();
    expect(noteBox!.y).toBeLessThan(h1Box!.y);
  });

  for (const path of ["", "/chkoun", "/sources", "/nope"]) {
    test(`${prefix}${path} ends with the unofficial line and links to Sources and privacy`, async ({
      page,
    }) => {
      await page.goto(`${prefix}${path}`);
      const footer = page.getByRole("contentinfo");
      await expect(footer.getByText(m.footer.unofficial)).toBeVisible();
      await expect(
        footer.getByRole("link", { name: m.footer.sources }),
      ).toHaveAttribute("href", `${prefix}/sources`);
      await expect(
        footer.getByRole("link", { name: m.footer.privacy }),
      ).toHaveAttribute("href", `${prefix}/privacy`);
    });
  }
}

test("/fr/sources credits every copied photo, one row each, changes 'none'", async ({
  page,
}) => {
  await page.goto("/fr/sources");
  const credits = photoCredits(pool);
  const rows = page.locator("tr[data-footballer]");
  await expect(rows).toHaveCount(credits.length);
  if (credits.length === 0)
    await expect(page.getByText(fr.sources.photos.empty)).toBeVisible();
  for (const c of credits.slice(0, 20)) {
    const row = page.locator(`tr[data-footballer="${c.id}"]`);
    await expect(row.getByRole("link", { name: c.file })).toHaveAttribute(
      "href",
      c.sourceUrl,
    );
    await expect(row).toContainText(fr.sources.photos.none);
  }
});

test("the photo of a played answer has a row on /sources", async ({ page }) => {
  const answer = footballer(fixture.answers[0]);
  test.skip(
    !answer.photo?.path,
    "today's answer has no copied photo in the committed pool yet",
  );
  await page.goto("/fr/sources");
  await expect(page.locator(`tr[data-footballer="${answer.id}"]`)).toHaveCount(
    1,
  );
});

test("the Sources page names the data sources and their licences", async ({
  page,
}) => {
  await page.goto("/fr/sources");
  // The data section alone: the photo table links licences too.
  const data = page.getByRole("region", { name: fr.sources.data.title });
  for (const name of [
    "Wikidata",
    "Wikipedia (en)",
    "Wikipédia (fr)",
    "martj42/international_results",
    "CC0 1.0",
    "CC BY-SA 4.0",
  ])
    await expect(data.getByRole("link", { name, exact: true })).toBeVisible();
  // The photo table: one row per copied photo, each with its licence,
  // linked whenever the licence has a URL.
  const credits = photoCredits(pool);
  const rows = page.locator("tr[data-footballer]");
  await expect(rows).toHaveCount(credits.length);
  for (const c of credits) {
    const cell = page.locator(`tr[data-footballer="${c.id}"] td`).nth(1);
    await expect(cell).toHaveText(c.licence);
    if (c.licenceUrl)
      await expect(cell.getByRole("link")).toHaveAttribute(
        "href",
        c.licenceUrl,
      );
  }
});
