import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import arLatnTN from "../messages/ar-Latn-TN.json";
import arTN from "../messages/ar-TN.json";
import fr from "../messages/fr.json";
import { puzzleNumber } from "../src/engine/chkoun/day";
import { nextStats } from "../src/engine/chkoun/stats";
import { launchGames, liveRoute } from "../src/games";
import { localeInfo, locales, type Locale } from "../src/i18n/locales";
import { site } from "../src/site";
import {
  guess,
  noSidewaysScroll,
  ready,
  shot,
  skipHelp,
} from "./chkoun-helpers";
import { type ChkounFixture, seedChkoun } from "./fixtures/chkoun";

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

// The full switcher: at the foot of the hub and of a game page; the small
// language menu sits in their headers.
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

// Mobile polish M6: the brand first, and each live card's line about today,
// read from the device (src/chkoun/hub-state.ts). Chkoun? plays against the
// seeded calendar (Redis off), so the device keeps the record.

const fill = (s: string, values: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k]));
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let fixture: ChkounFixture;
test.beforeAll(async () => {
  fixture = await seedChkoun();
});

const card = (page: Page, name: string) =>
  page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name }) });

async function winChkoun(page: Page, prefix: string, locale: Locale) {
  await page.goto(`${prefix}/chkoun`);
  await ready(page);
  await guess(page, fixture.others[0]);
  await guess(page, fixture.others[1]);
  await guess(page, fixture.answers[0]);
  await expect(
    page.getByRole("heading", {
      name: fill(messages[locale].chkoun.result.won, { n: 3 }),
    }),
  ).toBeVisible();
}

async function playSeason(page: Page, prefix: string, locale: Locale) {
  const t = messages[locale].season;
  await page.goto(`${prefix}/season`);
  const picks = page.getByRole("button", { name: new RegExp(escape(t.pick)) });
  for (let slot = 0; slot < 11; slot++) {
    await expect(page.getByText(fill(t.slot, { n: slot + 1 }))).toBeVisible();
    await picks.first().click();
  }
  await page.getByRole("button", { name: t.play }).click();
  await expect(page.locator("[data-record]")).toBeVisible();
  // The record the device kept for the hub.
  return page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("kora.season.v1.last") ?? "null") as {
        w: number;
        d: number;
        l: number;
      },
  );
}

for (const locale of locales) {
  const { prefix } = localeInfo[locale];
  const strings = messages[locale];
  const slug = prefix.slice(1);

  test(`${prefix}: the brand comes before the language menu, in DOM and on screen`, async ({
    page,
  }) => {
    await page.goto(prefix);
    const brand = page.getByRole("banner").getByRole("heading", {
      level: 1,
      name: site.name,
    });
    const menu = page.getByRole("banner").locator("summary");
    await expect(brand).toBeVisible();
    await expect(menu).toBeVisible();
    const before = await brand.evaluate(
      (b, m) =>
        !!(b.compareDocumentPosition(m!) & Node.DOCUMENT_POSITION_FOLLOWING),
      await menu.elementHandle(),
    );
    expect(before).toBe(true);
    const b = (await brand.boundingBox())!;
    const m = (await menu.boundingBox())!;
    // The start of the line is the left in /tn and /fr, the right in /ar.
    if (localeInfo[locale].dir === "rtl") expect(b.x).toBeGreaterThan(m.x);
    else expect(b.x).toBeLessThan(m.x);
  });

  test(`${prefix}: a fresh visitor reads "not yet" on both live cards, with today's number`, async ({
    page,
  }) => {
    await page.goto(prefix);
    const n = puzzleNumber(fixture.today);
    await expect(card(page, strings.games.chkoun.name)).toContainText(
      fill(strings.hub.state.notYet, { n }),
    );
    await expect(card(page, strings.games.season.name)).toContainText(
      strings.hub.state.seasonNotYet,
    );
  });

  test(`${prefix}: after a won Chkoun? and a played season, the cards say so`, async ({
    page,
  }) => {
    await winChkoun(page, prefix, locale);
    const record = await playSeason(page, prefix, locale);
    await page.goto(prefix);
    const chkoun = card(page, strings.games.chkoun.name);
    await expect(chkoun).toContainText(
      fill(strings.hub.state.won, {
        n: puzzleNumber(fixture.today),
        score: "3/8",
      }),
    );
    await expect(chkoun).toContainText(
      fill(strings.hub.state.streak, { n: 1 }),
    );
    await expect(card(page, strings.games.season.name)).toContainText(
      fill(strings.hub.state.seasonPlayed, record),
    );
    // The record reads left to right inside an Arabic line.
    await expect(
      card(page, strings.games.season.name).locator("bdi[dir=ltr]"),
    ).toHaveText(`${record.w}-${record.d}-${record.l}`);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    for (const width of [320, 360, 375, 412, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      expect(await noSidewaysScroll(page)).toBe(0);
      await page.screenshot({ path: shot(6, slug, width, "hub-played") });
    }
  });

  test(`${prefix}: the second card starts on the first screen at 360×800`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(prefix);
    await expect(page.locator("[data-hub-state]")).toHaveCount(2);
    const second = (await page.getByRole("article").nth(1).boundingBox())!;
    expect(second.y).toBeLessThanOrEqual(800);
    for (const width of [320, 360, 375, 412, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.screenshot({ path: shot(6, slug, width, "hub-fresh") });
    }
  });
}

test("a storage that refuses reads as not yet and throws nothing", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("refused", "SecurityError");
      },
    }),
  );
  await page.goto("/ar");
  await expect(card(page, arTN.games.chkoun.name)).toContainText(
    fill(arTN.hub.state.notYet, { n: puzzleNumber(fixture.today) }),
  );
  await expect(card(page, arTN.games.season.name)).toContainText(
    arTN.hub.state.seasonNotYet,
  );
  expect(errors).toEqual([]);
});

test("/ar: the two-line state (a win and its streak) fills its reserved box and moves no card", async ({
  page,
  browser,
}) => {
  const n = puzzleNumber(fixture.today);
  const stats = nextStats(
    nextStats(null, { n: n - 1, solved: true, guesses: 4 }),
    {
      n,
      solved: true,
      guesses: 3,
    },
  );
  await page.addInitScript(
    ({ n, stats }) => {
      localStorage.setItem(
        "kora.chkoun.v1.game",
        JSON.stringify({
          n,
          token: "t",
          rows: [{}, {}, {}],
          status: "won",
          card: null,
        }),
      );
      localStorage.setItem("kora.chkoun.v1.stats", JSON.stringify(stats));
      const w = window as unknown as { cls: number };
      w.cls = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as {
          value: number;
          hadRecentInput: boolean;
        }[])
          if (!e.hadRecentInput) w.cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    },
    { n, stats },
  );
  const viewport = { width: 360, height: 800 };

  // Before: the server's HTML alone (no script, so no line in the box).
  const bare = await browser.newContext({ javaScriptEnabled: false, viewport });
  const shell = await bare.newPage();
  await shell.goto("/ar");
  await expect(shell.locator("[data-hub-state]")).toHaveCount(0);
  const before = (await shell.getByRole("article").nth(1).boundingBox())!;
  await bare.close();

  // After: the line and the streak in the Chkoun? card.
  await page.setViewportSize(viewport);
  await page.goto("/ar");
  const chkoun = card(page, arTN.games.chkoun.name);
  await expect(chkoun).toContainText(
    fill(arTN.hub.state.won, { n, score: "3/8" }),
  );
  await expect(chkoun).toContainText(fill(arTN.hub.state.streak, { n: 2 }));
  const after = (await page.getByRole("article").nth(1).boundingBox())!;
  expect(after.y).toBe(before.y);
  await page.waitForTimeout(500);
  const cls = await page.evaluate(
    () => (window as unknown as { cls: number }).cls,
  );
  expect(cls).toBeLessThan(0.001);
});
