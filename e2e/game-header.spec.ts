import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import arLatnTN from "../messages/ar-Latn-TN.json";
import arTN from "../messages/ar-TN.json";
import fr from "../messages/fr.json";
import { localeInfo, locales } from "../src/i18n/locales";
import { noSidewaysScroll, ready, skipHelp } from "./chkoun-helpers";
import { seedChkoun } from "./fixtures/chkoun";

// The compact game header (mobile polish Task 1, M1): one line with the way
// back, the game's name, "?", the record and a small language menu, so the
// game itself starts on a phone's first screen.

const messages = { "ar-TN": arTN, "ar-Latn-TN": arLatnTN, fr };
test.beforeAll(async () => void (await seedChkoun()));
test.beforeEach(async ({ page }) => skipHelp(page));

for (const locale of locales) {
  const { prefix } = localeInfo[locale];
  const m = messages[locale];
  for (const [game, path] of [
    ["chkoun", "/chkoun"],
    ["season", "/season"],
  ] as const) {
    test(`${prefix}${path}: one header line, back, name, ?, stats, a small language menu`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto(`${prefix}${path}`);
      const header = page.locator("body > div header").first();
      expect((await header.boundingBox())!.height).toBeLessThanOrEqual(56);
      await expect(
        header.getByRole("link", { name: m.notFound.home }),
      ).toHaveAttribute("href", prefix);
      await expect(header.getByRole("heading", { level: 1 })).toHaveText(
        m.games[game].name,
      );
      await expect(
        header.getByRole("button", { name: m.header.help }),
      ).toBeVisible();
      await expect(
        header.getByRole("button", { name: m.header.stats }),
      ).toBeVisible();
      await header.locator("summary").click();
      const other = locales.find((l) => l !== locale)!;
      await expect(
        header.getByRole("link", { name: localeInfo[other].label }),
      ).toHaveAttribute("href", `${localeInfo[other].prefix}${path}`);
      // The full switcher is still on the page, at its foot.
      await expect(
        page.getByRole("navigation", { name: m.hub.language }),
      ).toHaveCount(1);
      expect(await noSidewaysScroll(page)).toBe(0);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    });
  }
  test(`${prefix}/chkoun: the back arrow points to the start of the line`, async ({
    page,
  }) => {
    // Tailwind's rtl: variant also matches :lang(ar), so /tn (ar-Latn-TN,
    // left to right) once got a mirrored arrow.
    await page.goto(`${prefix}/chkoun`);
    const arrow = page
      .locator("body > div header")
      .first()
      .getByRole("link", { name: m.notFound.home })
      .locator("svg");
    await expect(arrow).toHaveCSS(
      "scale",
      localeInfo[locale].dir === "rtl" ? "-1 1" : "none",
    );
  });
  test(`${prefix}/chkoun: the search is in the first 60% of a 360×800 screen`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`${prefix}/chkoun`);
    await ready(page);
    const box = (await page.getByRole("combobox").boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(480);
  });
}
