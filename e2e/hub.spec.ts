import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import arLatnTN from "../messages/ar-Latn-TN.json";
import arTN from "../messages/ar-TN.json";
import fr from "../messages/fr.json";
import { launchGames, liveRoute } from "../src/games";
import { localeInfo, locales } from "../src/i18n/locales";
import { skipHelp } from "./chkoun-helpers";

// The game pages open with the help already seen (src/chkoun/help-seen.ts).
test.beforeEach(async ({ page }) => skipHelp(page));

const messages = { "ar-TN": arTN, "ar-Latn-TN": arLatnTN, fr };

for (const locale of locales) {
  const { prefix } = localeInfo[locale];
  const strings = messages[locale];

  test(`${prefix} shows the three launch games; a live one opens in the same language, the others say soon`, async ({
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
      const route = liveRoute(game);
      if (route) {
        await expect(
          card.getByRole("link", { name: strings.games[game.id].name }),
        ).toHaveAttribute("href", `${prefix}${route}`);
        await expect(
          card.getByText(strings.hub.play, { exact: true }),
        ).toBeVisible();
        await expect(card.getByText(strings.hub.soon)).toHaveCount(0);
      } else {
        await expect(card.getByText(strings.hub.soon)).toBeVisible();
        await expect(card.getByRole("link")).toHaveCount(0);
      }
    }
  });

  test(`${prefix} has no detectable accessibility violations`, async ({
    page,
  }) => {
    await page.goto(prefix);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  for (const { width, height, fontSize } of [
    { width: 320, height: 640, fontSize: 16 },
    { width: 320, height: 640, fontSize: 21 },
    { width: 360, height: 740, fontSize: 16 },
    { width: 360, height: 740, fontSize: 21 },
  ]) {
    test(`${prefix} fits ${width} px with a ${fontSize} px default font, no sideways scrolling`, async ({
      page,
    }) => {
      // 21 px ≈ 130 % of the default: the closest headless stand-in for a
      // large Android font setting (the real WebView is checked by hand).
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Page.setFontSizes", {
        fontSizes: { standard: fontSize },
      });
      await page.setViewportSize({ width, height });
      await page.goto(prefix);
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
    });
  }

  test(`${prefix} follows the visitor's default font size`, async ({
    page,
  }) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: 20 } });
    await page.goto(prefix);
    await expect(page.locator("html")).toHaveCSS("font-size", "21.25px");
  });

  test(`${prefix} does not prefetch the other languages`, async ({ page }) => {
    const others: string[] = locales
      .filter((l) => l !== locale)
      .map((l) => localeInfo[l].prefix);
    const prefetched: string[] = [];
    page.on("request", (r) => {
      if (others.includes(new URL(r.url()).pathname)) prefetched.push(r.url());
    });
    await page.goto(prefix, { waitUntil: "networkidle" });
    expect(prefetched).toEqual([]);
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

for (const locale of locales) {
  const { prefix } = localeInfo[locale];
  const strings = messages[locale];

  test(`the 30–0 card links to ${prefix}/season and the page is indexed`, async ({
    page,
    request,
  }) => {
    await page.goto(prefix);
    await expect(
      page.getByRole("link", { name: strings.games.season.name }),
    ).toHaveAttribute("href", `${prefix}/season`);

    const response = await request.get(`${prefix}/season`);
    expect(response.status()).toBe(200);
    expect(await response.text()).not.toContain(
      '<meta name="robots" content="noindex',
    );

    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toMatch(new RegExp(`<loc>[^<]*${prefix}/season</loc>`));
  });
}

// The full switcher: at the top of the hub, at the foot of a game page.
for (const path of ["", "/chkoun"]) {
  test(`the language switcher on /ar${path} changes language and direction`, async ({
    page,
  }) => {
    await page.goto(`/ar${path}`);
    // Its name follows the page's language; the links stay the same.
    const switcher = () =>
      page.getByRole("navigation").filter({
        has: page.getByRole("link", { name: localeInfo.fr.label }),
      });
    await expect(
      switcher().getByRole("link", { name: localeInfo["ar-TN"].label }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("navigation", { name: arTN.hub.language }),
    ).toHaveCount(1);

    await switcher().getByRole("link", { name: localeInfo.fr.label }).click();
    await expect(page).toHaveURL(new RegExp(`/fr${path}$`));
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");

    await switcher()
      .getByRole("link", { name: localeInfo["ar-Latn-TN"].label })
      .click();
    await expect(page).toHaveURL(new RegExp(`/tn${path}$`));
    await expect(page.locator("html")).toHaveAttribute("lang", "ar-Latn-TN");

    await switcher()
      .getByRole("link", { name: localeInfo["ar-TN"].label })
      .click();
    await expect(page).toHaveURL(new RegExp(`/ar${path}$`));
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });
}

test("outside Vercel the page asks for no analytics script", async ({
  page,
}) => {
  const requested: string[] = [];
  page.on("request", (request) => requested.push(request.url()));
  await page.goto("/ar");
  await page.waitForLoadState("networkidle");
  expect(requested.filter((url) => url.includes("/_vercel/"))).toEqual([]);
});
