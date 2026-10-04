import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import arLatnTN from "../messages/ar-Latn-TN.json";
import arTN from "../messages/ar-TN.json";
import fr from "../messages/fr.json";
import { launchGames } from "../src/games";
import { localeInfo, locales } from "../src/i18n/locales";

const messages = { "ar-TN": arTN, "ar-Latn-TN": arLatnTN, fr };

for (const locale of locales) {
  const { prefix } = localeInfo[locale];
  const strings = messages[locale];

  test(`${prefix} shows the three launch games, each marked as coming soon`, async ({
    page,
  }) => {
    await page.goto(prefix);
    await expect(page.getByText(strings.hub.tagline)).toBeVisible();

    const cards = page.getByRole("article");
    await expect(cards).toHaveCount(launchGames.length);

    for (const [index, game] of launchGames.entries()) {
      const card = cards.nth(index);
      await expect(
        card.getByRole("heading", { name: strings.games[game.id].name }),
      ).toBeVisible();
      await expect(card.getByText(strings.games[game.id].pitch)).toBeVisible();
      await expect(card.getByText(strings.badges[game.badge])).toBeVisible();
      await expect(card.getByText(strings.hub.soon)).toBeVisible();
    }
  });

  test(`${prefix} has no detectable accessibility violations`, async ({
    page,
  }) => {
    await page.goto(prefix);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test(`${prefix} fits a small phone without sideways scrolling`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(prefix);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
}

test("/ar keeps 30–0 left to right and Arabic names right to left (P7)", async ({
  page,
}) => {
  await page.goto("/ar");
  const cards = page.getByRole("article");

  const season = cards.filter({
    has: page.getByRole("heading", { name: arTN.games.season.name }),
  });
  await expect(season.getByRole("heading").locator("bdi")).toHaveCSS(
    "direction",
    "ltr",
  );

  const chkoun = cards.filter({
    has: page.getByRole("heading", { name: arTN.games.chkoun.name }),
  });
  await expect(chkoun.getByRole("heading").locator("bdi")).toHaveCSS(
    "direction",
    "rtl",
  );
});

test("the language switcher changes language and direction", async ({
  page,
}) => {
  await page.goto("/ar");
  const switcher = page.getByRole("navigation", {
    name: arTN.hub.language,
  });
  await expect(
    switcher.getByRole("link", { name: localeInfo["ar-TN"].label }),
  ).toHaveAttribute("aria-current", "true");

  await switcher.getByRole("link", { name: localeInfo.fr.label }).click();
  await expect(page).toHaveURL(/\/fr$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");

  await page
    .getByRole("link", { name: localeInfo["ar-Latn-TN"].label })
    .click();
  await expect(page).toHaveURL(/\/tn$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "ar-Latn-TN");

  await page.getByRole("link", { name: localeInfo["ar-TN"].label }).click();
  await expect(page).toHaveURL(/\/ar$/);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});

test("outside Vercel the page asks for no analytics script", async ({
  page,
}) => {
  const requested: string[] = [];
  page.on("request", (request) => requested.push(request.url()));
  await page.goto("/ar");
  await page.waitForLoadState("networkidle");
  expect(requested.filter((url) => url.includes("/_vercel/"))).toEqual([]);
});
