import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import arLatnTN from "../messages/ar-Latn-TN.json";
import arTN from "../messages/ar-TN.json";
import fr from "../messages/fr.json";
import { localeInfo, locales } from "../src/i18n/locales";
import {
  guess,
  noSidewaysScroll,
  ready,
  shot,
  skipHelp,
} from "./chkoun-helpers";
import { type ChkounFixture, seedChkoun } from "./fixtures/chkoun";

// Yesterday's footballer (mobile polish M7) on the built server against the
// seeded calendar (Redis off): yesterday's answer is fixture.yesterday,
// today's is fixture.answers[0]. Each test has its own browser context, so
// its own storage.

const messages = { "ar-TN": arTN, "ar-Latn-TN": arLatnTN, fr };
const fill = (s: string, values: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k]));

let fixture: ChkounFixture;
test.beforeAll(async () => {
  fixture = await seedChkoun();
});
test.beforeEach(async ({ page }) => skipHelp(page));

const axe = async (page: Page) =>
  (await new AxeBuilder({ page }).analyze()).violations;

/** Catches the text the share button hands the system sheet. */
async function catchShare(page: Page) {
  await page.addInitScript(() => {
    const probe = window as unknown as { shared?: string };
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: { text: string }) => {
        probe.shared = data.text;
      },
    });
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => true,
    });
  });
}
const shared = (page: Page) =>
  page.evaluate(() => (window as unknown as { shared?: string }).shared);

/** Resolves once every animation on the page (the tiles' flip) has ended. */
const still = (page: Page) =>
  page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished)),
  );

const stored = (page: Page, key: string) =>
  page.evaluate((k) => localStorage.getItem(k), key);

for (const locale of locales) {
  const { prefix } = localeInfo[locale];
  const m = messages[locale];
  const t = m.chkoun;
  const slug = prefix.slice(1);
  const url = `${prefix}/chkoun/yesterday`;

  test(`${prefix}/chkoun: after today's result, a link opens yesterday's footballer; a win there leaves the streak and today's game unchanged; the share says yesterday`, async ({
    page,
  }) => {
    await catchShare(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`${prefix}/chkoun`);
    await ready(page);
    // No link while today's game is under way.
    await expect(page.locator("[data-yesterday-link]")).toHaveCount(0);
    await guess(page, fixture.others[0]);
    await guess(page, fixture.answers[0]);
    await expect(page.locator("#chkoun-result")).toBeVisible();

    const statsButton = page
      .locator("body > div header")
      .first()
      .getByRole("button", { name: m.header.stats });
    const dialog = page.getByRole("dialog", { name: m.header.stats });
    const record = async () => {
      await statsButton.click();
      await expect(dialog).toBeVisible();
      const text = await dialog.locator("dl").first().innerText();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      return text;
    };
    const before = await record();
    const todayGame = await stored(page, "kora.chkoun.v1.game");
    const todayStats = await stored(page, "kora.chkoun.v1.stats");
    expect(todayStats).not.toBeNull();

    const link = page.getByRole("link", { name: t.yesterday.link });
    await link.scrollIntoViewIfNeeded();
    await expect(link).toBeVisible();
    await page.screenshot({ path: shot(7, slug, 360, "result-link") });
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${url}$`));
    await expect(
      page.getByRole("heading", { level: 2, name: t.yesterday.title }),
    ).toBeVisible();
    await expect(page.getByText(t.yesterday.note)).toBeVisible();
    await ready(page);
    // A fresh game of its own: today's rows are not here.
    await expect(page.locator("[data-guess]")).toHaveCount(0);
    for (const width of [320, 360, 412]) {
      await page.setViewportSize({ width, height: 800 });
      expect(await noSidewaysScroll(page)).toBe(0);
      await page.screenshot({ path: shot(7, slug, width, "yesterday-fresh") });
    }
    await page.setViewportSize({ width: 360, height: 800 });

    await guess(page, fixture.others[1]);
    await still(page);
    await page.screenshot({ path: shot(7, slug, 360, "yesterday-playing") });
    await guess(page, fixture.yesterday);
    await expect(
      page.getByRole("heading", { name: fill(t.result.won, { n: 2 }) }),
    ).toBeVisible();
    await expect(page.locator("#chkoun-result")).toBeFocused();
    await still(page);
    for (const width of [320, 360, 412]) {
      await page.setViewportSize({ width, height: 800 });
      expect(await noSidewaysScroll(page)).toBe(0);
      await page.screenshot({
        path: shot(7, slug, width, "yesterday-won"),
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 360, height: 800 });

    // The record and today's game are as they were; yesterday's is apart.
    expect(await record()).toBe(before);
    expect(await stored(page, "kora.chkoun.v1.game")).toBe(todayGame);
    expect(await stored(page, "kora.chkoun.v1.stats")).toBe(todayStats);
    expect(
      JSON.parse((await stored(page, "kora.chkoun.v1.past"))!),
    ).toMatchObject({ status: "won" });

    // The share marks the day and carries no streak.
    await page.getByRole("button", { name: t.share.button }).click();
    await expect.poll(() => shared(page)).toBeTruthy();
    const lines = (await shared(page))!.split("\n");
    expect(lines[1]).toContain(t.share.yesterday);
    expect(lines[1]).toContain(" · 2/8 · ");
    expect(lines.some((l) => l.startsWith(`${t.stats.streak}:`))).toBe(false);

    // Back to today's result.
    await page.getByRole("link", { name: t.yesterday.back }).click();
    await expect(page).toHaveURL(new RegExp(`${prefix}/chkoun$`));
    await expect(
      page.getByRole("heading", { name: fill(t.result.won, { n: 2 }) }),
    ).toBeVisible();
    await expect(
      page.locator(`[data-guess="${fixture.answers[0]}"]`),
    ).toHaveCount(1);
  });

  test(`${url}: a reload brings yesterday's guesses back; today's page stays fresh`, async ({
    page,
  }) => {
    await page.goto(url);
    await ready(page);
    await guess(page, fixture.others[0]);
    await page.reload();
    await expect(
      page.locator(`[data-guess="${fixture.others[0]}"]`),
    ).toHaveCount(1);
    await page.goto(`${prefix}/chkoun`);
    await ready(page);
    await expect(page.locator("[data-guess]")).toHaveCount(0);
    expect(await stored(page, "kora.chkoun.v1.game")).toBeNull();
  });

  test(`${url}: the page is noindex and not in the sitemap`, async ({
    page,
    request,
  }) => {
    await page.goto(url);
    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      new RegExp(`${url}$`),
    );
    await expect(page).toHaveTitle(t.yesterday.meta.title);
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).not.toContain("/chkoun/yesterday");
  });

  test(`${url}: axe finds nothing on yesterday's playing and finished states`, async ({
    page,
  }) => {
    await page.goto(url);
    await ready(page);
    expect(await axe(page)).toEqual([]);
    await guess(page, fixture.others[0]);
    await page.getByRole("combobox").fill("ab");
    expect(await axe(page)).toEqual([]);
    await guess(page, fixture.yesterday);
    await expect(page.locator("#chkoun-result")).toBeVisible();
    expect(await axe(page)).toEqual([]);
  });

  test(`${url}: the state is reserved once under the title, the shell and the live game put the search at the same height, nothing shifts`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.addInitScript(() => {
      const w = window as unknown as { cls: number };
      w.cls = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as {
          value: number;
          hadRecentInput: boolean;
        }[])
          if (!e.hadRecentInput) w.cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.route("**/api/chkoun/today", async (r) => {
      await new Promise((f) => setTimeout(f, 1500));
      await r.continue();
    });
    await page.goto(url);
    const shell = (await page.locator("#chkoun-shell-search").boundingBox())!;
    await ready(page);
    const live = (await page.getByRole("combobox").boundingBox())!;
    expect(Math.abs(live.y - shell.y)).toBeLessThanOrEqual(1);
    // Between the back link and the search's label: the state slot (48 px)
    // and the search block's own top padding only; it was about 104 px.
    const back = (await page.locator("[data-today-link]").boundingBox())!;
    const label = (await page
      .locator(".chkoun-live label")
      .first()
      .boundingBox())!;
    expect(label.y - (back.y + back.height)).toBeLessThanOrEqual(64);
    // Below 0.01: a sub-pixel font shift (0.0005 on GitHub's Chromium) is
    // not a visible shift.
    expect(
      await page.evaluate(() => (window as unknown as { cls: number }).cls),
    ).toBeLessThan(0.01);
  });

  test(`${url}: at 320 px no sideways scroll`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(url);
    await ready(page);
    expect(await noSidewaysScroll(page)).toBe(0);
    await guess(page, fixture.others[0]);
    expect(await noSidewaysScroll(page)).toBe(0);
    await guess(page, fixture.yesterday);
    await expect(page.locator("#chkoun-result")).toBeVisible();
    expect(await noSidewaysScroll(page)).toBe(0);
  });
}

test("a day with no row for yesterday says yesterday's footballer is not there", async ({
  page,
}) => {
  await page.route("**/api/chkoun/today", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    delete body.yesterday;
    await route.fulfill({ response, json: body });
  });
  await page.goto("/fr/chkoun/yesterday");
  await expect(page.getByText(fr.chkoun.yesterday.closed)).toBeVisible();
  await expect(page.getByRole("combobox")).toBeDisabled();
});

test("today's result offers no link on puzzle 1 (no yesterday)", async ({
  page,
}) => {
  await page.route("**/api/chkoun/today", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    delete body.yesterday;
    await route.fulfill({ response, json: body });
  });
  await page.goto("/fr/chkoun");
  await ready(page);
  await guess(page, fixture.answers[0]);
  await expect(page.locator("#chkoun-result")).toBeVisible();
  await expect(page.locator("[data-yesterday-link]")).toHaveCount(0);
});
