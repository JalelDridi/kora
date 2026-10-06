import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import arLatnTN from "../messages/ar-Latn-TN.json";
import arTN from "../messages/ar-TN.json";
import fr from "../messages/fr.json";
import { localName } from "../src/chkoun/labels";
import { nextMidnight } from "../src/engine/chkoun/day";
import { localeInfo, locales } from "../src/i18n/locales";
import { footballer, guess, noSidewaysScroll, ready } from "./chkoun-helpers";
import { type ChkounFixture, seedChkoun } from "./fixtures/chkoun";

// The Chkoun? page on the built server against the seeded calendar (Redis
// off): today's answer is fixture.answers[0], fixture.others are wrong
// guesses. Each test has its own browser context, so its own storage.

const messages = { "ar-TN": arTN, "ar-Latn-TN": arLatnTN, fr };
const fill = (s: string, values: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k]));

let fixture: ChkounFixture;
test.beforeAll(async () => {
  fixture = await seedChkoun();
});

const axe = async (page: Page) =>
  (await new AxeBuilder({ page }).analyze()).violations;

for (const locale of locales) {
  const { prefix } = localeInfo[locale];
  const t = messages[locale].chkoun;
  const url = `${prefix}/chkoun`;

  test(`${url} plays to a win in three guesses`, async ({ page }) => {
    await page.goto(url);
    await ready(page);
    await guess(page, fixture.others[0]);
    await guess(page, fixture.others[1]);
    await guess(page, fixture.answers[0]);
    await expect(
      page.getByRole("heading", { name: fill(t.result.won, { n: 3 }) }),
    ).toBeVisible();
    await expect(page.getByRole("combobox")).toHaveCount(0);
    const win = page.locator(`[data-guess="${fixture.answers[0]}"] li`);
    await expect(win).toHaveCount(6);
    for (const colour of await win.evaluateAll((els) =>
      els.map((e) => e.getAttribute("data-colour")),
    ))
      expect(colour).toBe("green");
  });

  test(`${url} plays to a loss in eight`, async ({ page }) => {
    await page.goto(url);
    await ready(page);
    for (const id of fixture.others.slice(0, 8)) await guess(page, id);
    const answer = footballer(fixture.answers[0]);
    await expect(
      page.getByRole("heading", {
        name: fill(t.result.lost, { name: localName(answer, locale) }),
      }),
    ).toBeVisible();
    await expect(page.locator("[data-guess]")).toHaveCount(8);
  });

  test(`${url}: every tile has a text label and a screen-reader word, not only a colour`, async ({
    page,
  }) => {
    await page.goto(url);
    await ready(page);
    await guess(page, fixture.others[0]);
    await guess(page, fixture.others[1]);
    const words = Object.values({
      same: t.legend.same,
      close: t.legend.close,
      different: t.legend.different,
      unknown: t.legend.unknown,
    });
    const headers = Object.values(t.tiles).slice(0, 6);
    const tiles = page.locator("[data-guess] li");
    await expect(tiles).toHaveCount(12);
    for (const text of await tiles.allTextContents()) {
      expect(
        words.some((w) => text.includes(w)),
        text,
      ).toBe(true);
      expect(
        headers.some((h) => text.includes(h)),
        text,
      ).toBe(true);
    }
    // Every colour but "?" shows a mark too; arrows have a name.
    for (const tile of await tiles.all()) {
      const colour = await tile.getAttribute("data-colour");
      const visible = (await tile.innerText()).trim();
      expect(visible.length, `${colour} tile shows text`).toBeGreaterThan(0);
    }
    const arrows = page.locator("[data-guess] [role=img]");
    for (const arrow of await arrows.all())
      expect([
        t.tiles.older,
        t.tiles.younger,
        t.tiles.moreCaps,
        t.tiles.fewerCaps,
      ]).toContain(await arrow.getAttribute("aria-label"));
    // The legend names the four colours in words.
    for (const w of words)
      await expect(page.getByText(w).first()).toBeAttached();
  });

  test(`${url}: the tile row follows the page's direction`, async ({
    page,
  }) => {
    await page.goto(url);
    await ready(page);
    await guess(page, fixture.others[0]);
    const row = page.locator(`[data-guess="${fixture.others[0]}"]`);
    const club = await row.locator('[data-column="club"]').boundingBox();
    const gov = await row.locator('[data-column="governorate"]').boundingBox();
    if (localeInfo[locale].dir === "rtl")
      expect(club!.x).toBeGreaterThan(gov!.x);
    else expect(club!.x).toBeLessThan(gov!.x);
  });

  test(`${url}: a reload restores today's guesses`, async ({ page }) => {
    await page.goto(url);
    await ready(page);
    await guess(page, fixture.others[0]);
    await guess(page, fixture.others[1]);
    await page.reload();
    await ready(page);
    await expect(page.locator("[data-guess]")).toHaveCount(2);
    await expect(page.getByText(fill(t.guessCount, { n: 3 }))).toBeVisible();
  });

  test(`${url}: axe finds nothing on the empty, playing and finished states`, async ({
    page,
  }) => {
    await page.goto(url);
    await ready(page);
    expect(await axe(page)).toEqual([]);
    await guess(page, fixture.others[0]);
    await page.getByRole("combobox").fill("ab");
    expect(await axe(page)).toEqual([]);
    await guess(page, fixture.answers[0]);
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
    expect(await axe(page)).toEqual([]);
  });

  for (const width of [320, 360]) {
    test(`${url}: no sideways scrolling at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 740 });
      await page.goto(url);
      await ready(page);
      expect(await noSidewaysScroll(page)).toBe(0);
      for (const id of fixture.others.slice(0, 3)) await guess(page, id);
      expect(await noSidewaysScroll(page)).toBe(0);
      await guess(page, fixture.answers[0]);
      expect(await noSidewaysScroll(page)).toBe(0);
    });
  }
}

test("suggestions accept Arabic, Arabizi and French spellings", async ({
  page,
}) => {
  await page.goto("/fr/chkoun");
  await ready(page);
  const box = page.getByRole("combobox");
  for (const query of ["مجبري", "mejbri", "Hannibal"]) {
    await box.fill(query);
    await expect(
      page.getByRole("option").filter({ hasText: "Hannibal Mejbri" }),
    ).toHaveCount(1);
  }
  await box.fill("zzqqxx");
  await expect(page.getByText(fr.chkoun.search.none)).toBeVisible();
});

test("the search is a combobox: arrows move, Enter guesses, Escape closes", async ({
  page,
}) => {
  await page.goto("/tn/chkoun");
  await ready(page);
  const box = page.getByRole("combobox");
  await box.fill(footballer(fixture.others[0]).nameLatin);
  await expect(box).toHaveAttribute("aria-expanded", "true");
  const first = await box.getAttribute("aria-activedescendant");
  await box.press("ArrowDown");
  const options = await page.getByRole("option").count();
  if (options > 1)
    expect(await box.getAttribute("aria-activedescendant")).not.toBe(first);
  await box.press("ArrowUp");
  expect(await box.getAttribute("aria-activedescendant")).toBe(first);
  await box.press("Escape");
  await expect(box).toHaveAttribute("aria-expanded", "false");
  await box.press("ArrowDown");
  await box.press("ArrowUp");
  await box.press("Enter");
  await expect(page.locator("[data-guess]")).toHaveCount(1);
  await expect(box).toBeFocused();
});

test("at midnight the page moves to the new puzzle", async ({ page }) => {
  // The browser's clock is moved to 10 s before today's Tunis midnight. The
  // server keeps the real time, so its next answer is played by the test:
  // tomorrow's number, as the real server will say at midnight.
  const endsAt = nextMidnight(fixture.today);
  await page.clock.install({ time: new Date(endsAt.getTime() - 10_000) });
  let calls = 0;
  await page.route("**/api/chkoun/today", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    calls++;
    if (calls > 1 && body.status === "open") body.number += 1;
    await route.fulfill({ response, json: body });
  });
  await page.goto("/fr/chkoun");
  await ready(page);
  await guess(page, fixture.others[0]);
  await page.clock.fastForward(15_000);
  await expect(page.getByText(fr.chkoun.error.newDay)).toBeVisible();
  await expect(page.locator("[data-guess]")).toHaveCount(0);
  expect(calls).toBeGreaterThan(1);
});

test("with reduced motion, tiles do not flip", async ({ browser }) => {
  for (const reducedMotion of ["reduce", "no-preference"] as const) {
    const context = await browser.newContext({ reducedMotion });
    const page = await context.newPage();
    await page.goto("/fr/chkoun");
    await ready(page);
    await guess(page, fixture.others[0]);
    const name = await page
      .locator("[data-guess] li")
      .first()
      .evaluate((e) => getComputedStyle(e).animationName);
    expect(name).toBe(reducedMotion === "reduce" ? "none" : "kora-flip");
    await context.close();
  }
});

test("with JavaScript off, the rules and the noscript message show", async ({
  browser,
  request,
}) => {
  // Chromium with scripts disabled by Playwright still parses <noscript> as
  // text, so the message is checked in the served HTML.
  const html = await (await request.get("/ar/chkoun")).text();
  const noscript = /<noscript>([\s\S]*?)<\/noscript>/.exec(html)?.[1];
  expect(noscript).toContain(arTN.chkoun.noscript);
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/ar/chkoun");
  await expect(page.getByText(arTN.chkoun.rules)).toBeVisible();
  await context.close();
});

test("the page stays usable when today cannot be read", async ({ page }) => {
  await page.route("**/api/chkoun/today", (route) => route.abort());
  await page.goto("/fr/chkoun");
  await expect(
    page.getByRole("alert").filter({ hasText: fr.chkoun.error.network }),
  ).toBeVisible();
  await page.unroute("**/api/chkoun/today");
  await page.getByRole("button", { name: fr.chkoun.error.retry }).click();
  await ready(page);
});

test("a closed day says so", async ({ page }) => {
  await page.route("**/api/chkoun/today", (route) =>
    route.fulfill({ json: { status: "closed" } }),
  );
  await page.goto("/tn/chkoun");
  await expect(page.getByText(arLatnTN.chkoun.error.closed)).toBeVisible();
  expect(await new AxeBuilder({ page }).analyze()).toMatchObject({
    violations: [],
  });
});

test("before the first puzzle, the page counts down", async ({ page }) => {
  const startsAt = new Date(Date.now() + 3 * 3600_000).toISOString();
  await page.route("**/api/chkoun/today", (route) =>
    route.fulfill({ json: { status: "soon", startsAt } }),
  );
  await page.goto("/fr/chkoun");
  await expect(page.getByText(/Le premier joueur arrive dans/)).toContainText(
    /\d:\d\d:\d\d/,
  );
});

test("the game page is reachable but kept out of search engines until live", async ({
  page,
}) => {
  const { getGame } = await import("../src/games");
  await page.goto("/ar/chkoun");
  const robots = page.locator('head meta[name="robots"]');
  if (getGame("chkoun").live) await expect(robots).toHaveCount(0);
  else await expect(robots).toHaveAttribute("content", /noindex/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/ar\/chkoun$/,
  );
  for (const l of locales)
    await expect(
      page.locator(`link[rel="alternate"][hreflang="${l}"]`),
    ).toHaveAttribute("href", new RegExp(`${localeInfo[l].prefix}/chkoun$`));
});

test("without an analytics key, a played game sends nothing to PostHog", async ({
  page,
}) => {
  const outside: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith("http://localhost")) outside.push(r.url());
  });
  await page.goto("/fr/chkoun");
  await ready(page);
  await page.getByRole("combobox").fill("zzqqxx");
  await guess(page, fixture.others[0]);
  await guess(page, fixture.answers[0]);
  await page.waitForLoadState("networkidle");
  expect(outside).toEqual([]);
});
