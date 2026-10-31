import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import arLatnTN from "../messages/ar-Latn-TN.json";
import arTN from "../messages/ar-TN.json";
import fr from "../messages/fr.json";
import { localeInfo, locales } from "../src/i18n/locales";
import { noSidewaysScroll, shot, skipHelp } from "./chkoun-helpers";

// The 30–0 draft page on the built server (Redis off: no rate limit, the
// draft lives in its signed token). Each test has its own browser context,
// so its own storage and its own draft.

const messages = { "ar-TN": arTN, "ar-Latn-TN": arLatnTN, fr };
const fill = (s: string, values: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k]));
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const axe = async (page: Page) =>
  (await new AxeBuilder({ page }).analyze()).violations;

// Every test starts with the help already seen, but the first-visit ones.
const FIRST_VISIT = "on a first visit";
test.beforeEach(async ({ page }, info) => {
  if (!info.titlePath.includes(FIRST_VISIT)) await skipHelp(page);
});

for (const locale of locales) {
  const { prefix } = localeInfo[locale];
  const t = messages[locale].season;
  const url = `${prefix}/season`;
  /** Screenshot names use the URL's locale: ar, tn, fr. */
  const slug = prefix.slice(1);
  const pickButtons = (page: Page) =>
    page.getByRole("button", { name: new RegExp(escape(t.pick)) });
  const spinning = async (page: Page, n: number) =>
    expect(page.getByText(fill(t.slot, { n }))).toBeVisible();

  test.describe(FIRST_VISIT, () => {
    test(`${url}: the help opens on the first visit only, traps focus, closes on Escape, reopens from ?`, async ({
      page,
    }) => {
      await page.goto(url);
      const help = page.getByRole("dialog", {
        name: messages[locale].header.help,
      });
      await expect(help).toBeVisible();
      for (const line of [t.help.draft, t.help.respin, t.help.play])
        await expect(help.getByText(line)).toBeVisible();
      for (let i = 0; i < 6; i++) await page.keyboard.press("Tab");
      expect(
        await help.evaluate((d) => d.contains(document.activeElement)),
      ).toBe(true);
      await page.keyboard.press("Escape");
      await expect(help).toBeHidden();
      await page.reload();
      await spinning(page, 1);
      await expect(help).toBeHidden();
      const button = page.getByRole("button", {
        name: messages[locale].header.help,
      });
      await button.click();
      await expect(help).toBeVisible();
      expect(await axe(page)).toEqual([]);
      await help
        .getByRole("button", { name: messages[locale].header.close })
        .click();
      await expect(button).toBeFocused();
    });
  });

  test(`${url}: the rules prose is no longer on the page`, async ({ page }) => {
    await page.goto(url);
    await spinning(page, 1);
    await expect(page.locator("main").getByText(t.rules)).toBeHidden();
  });

  test(`${url} drafts eleven at 320 px`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(url);
    for (let slot = 0; slot < 11; slot++) {
      await spinning(page, slot + 1);
      if (slot === 0) {
        expect(await noSidewaysScroll(page)).toBe(0);
        await page.screenshot({
          path: shot(10, slug, 320, "spinning"),
          fullPage: true,
        });
      }
      await pickButtons(page).first().click();
    }
    await expect(page.getByRole("button", { name: t.play })).toBeEnabled();
    await expect(pickButtons(page)).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: t.squad }).locator("[data-picked]"),
    ).toHaveCount(11);
    expect(await noSidewaysScroll(page)).toBe(0);
    await page.screenshot({
      path: shot(10, slug, 320, "drafted"),
      fullPage: true,
    });
  });

  test(`${url} re-spins once`, async ({ page }) => {
    await page.goto(url);
    await spinning(page, 1);
    await page.getByRole("button", { name: t.respin }).click();
    await expect(page.getByRole("button", { name: t.respin })).toBeDisabled();
    await expect(page.getByText(t.respinUsed)).toBeVisible();
    // Still the first place: a re-spin changes the spin, not the slot.
    await spinning(page, 1);
    await pickButtons(page).first().click();
    await spinning(page, 2);
    await expect(page.getByRole("button", { name: t.respin })).toBeDisabled();
  });

  test(`${url} the pitch reads in the page's direction`, async ({ page }) => {
    await page.goto(url);
    await spinning(page, 1);
    const [a, b] = await Promise.all(
      [0, 1].map((k) =>
        page.locator('[data-line="defender"]').nth(k).boundingBox(),
      ),
    );
    expect(locale === "ar-TN" ? a!.x > b!.x : a!.x < b!.x).toBe(true);
    // Forwards sit above the goalkeeper: the pitch seen from the stands.
    const forward = await page
      .locator('[data-line="forward"]')
      .first()
      .boundingBox();
    const keeper = await page
      .locator('[data-line="goalkeeper"]')
      .first()
      .boundingBox();
    expect(forward!.y).toBeLessThan(keeper!.y);
  });

  test(`${url} a reload keeps the draft`, async ({ page }) => {
    await page.goto(url);
    await spinning(page, 1);
    const name = (
      await page.locator("[data-candidate] [data-name]").first().innerText()
    ).trim();
    await pickButtons(page).first().click();
    await spinning(page, 2);
    await page.reload();
    await spinning(page, 2);
    await expect(page.getByRole("region", { name: t.squad })).toContainText(
      name,
    );
  });

  test(`${url} candidates show a rating of 60 to 99 and the caps input`, async ({
    page,
  }) => {
    await page.goto(url);
    await spinning(page, 1);
    const cards = page.locator("[data-candidate]");
    expect(await cards.count()).toBeGreaterThanOrEqual(1);
    expect(await cards.count()).toBeLessThanOrEqual(5);
    for (const text of await page
      .locator("[data-candidate] [data-rating]")
      .allInnerTexts()) {
      const rating = Number(text.trim());
      expect(rating).toBeGreaterThanOrEqual(60);
      expect(rating).toBeLessThanOrEqual(99);
    }
    for (const card of await cards.all())
      await expect(card.getByText(t.inputs.caps)).toBeVisible();
    // A candidate is a button named after him.
    const first = (
      await cards.first().locator("[data-name]").innerText()
    ).trim();
    await expect(
      cards.first().getByRole("button", { name: new RegExp(escape(first)) }),
    ).toBeVisible();
  });

  test(`${url} axe finds nothing while drafting`, async ({ page }) => {
    await page.goto(url);
    await spinning(page, 1);
    expect(await axe(page)).toEqual([]);
    await pickButtons(page).first().click();
    await spinning(page, 2);
    expect(await axe(page)).toEqual([]);
  });

  test(`${url} with JavaScript off, the rules and the noscript line show`, async ({
    browser,
    request,
  }) => {
    // Chromium with scripts disabled by Playwright still parses <noscript>
    // as text (as in chkoun.spec.ts), so the line is checked in the HTML.
    const html = await (await request.get(url)).text();
    const noscript = /<noscript>([\s\S]*?)<\/noscript>/.exec(html)?.[1];
    expect(noscript).toContain(t.noscript);
    // The rules prose lives only there now: the help dialog explains the game.
    expect(noscript).toContain(t.rules);
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await context.close();
  });

  test(`${url} is indexed now 30–0 is live (P57)`, async ({ page }) => {
    await page.goto(url);
    await expect(page.locator('head meta[name="robots"]')).toHaveCount(0);
    await expect(page).toHaveTitle(t.meta.title);
  });

  /** Drafts eleven (first candidate each time) and plays; the squad code. */
  const playSeason = async (page: Page): Promise<string> => {
    for (let slot = 0; slot < 11; slot++) {
      await spinning(page, slot + 1);
      await pickButtons(page).first().click();
    }
    const answer = page.waitForResponse("**/api/season/play");
    await page.getByRole("button", { name: t.play }).click();
    const { code } = (await (await answer).json()) as { code: string };
    await expect(page.locator("#season-result")).toBeVisible();
    return code;
  };
  const board = (page: Page) =>
    page.getByRole("region", { name: t.board.title });

  test(`${url} with Redis off the board says it is off and the season says saved on this device`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(url);
    await expect(board(page).getByText(t.board.off)).toBeVisible();
    await playSeason(page);
    await expect(page.getByText(t.result.onDevice)).toBeVisible();
    await expect(board(page).getByText(t.board.off)).toBeVisible();
    await expect(board(page).getByRole("list")).toHaveCount(0);
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: width === 320 ? 640 : 800 });
      expect(await noSidewaysScroll(page)).toBe(0);
      await page.screenshot({
        path: shot(12, slug, width, "board-off"),
        fullPage: true,
      });
    }
    expect(await axe(page)).toEqual([]);
  });

  test(`${url} the board lists today's sides in order and marks the visitor's own`, async ({
    page,
  }) => {
    let own = "own-code-not-played-yet";
    const row = (rank: number, code: string, points: number) => ({
      rank,
      code,
      w: 20 + rank,
      d: 3,
      l: 7 - rank,
      points,
      gf: 60,
      ga: 20,
      rating: 88.4 - rank,
      squad: Array.from({ length: 11 }, (_, i) => ({
        id: `Q${rank}${i}`,
        names: {
          nameLatin: `Latin ${rank}-${i + 1}`,
          nameArabic: `عربي ${rank}-${i + 1}`,
          nameFrench: null,
        },
        line: i === 0 ? "goalkeeper" : "defender",
      })),
    });
    await page.route("**/api/season/board", (route) =>
      route.fulfill({
        json: {
          day: "2026-10-22",
          status: "on",
          rows: [row(1, "a-top-side", 75), row(2, own, 70)],
        },
      }),
    );
    // The real play, its code read before the page gets the answer, so the
    // board's fetch after the play already lists the visitor's side.
    await page.route("**/api/season/play", async (route) => {
      const response = await route.fetch();
      const json = (await response.json()) as { code: string };
      own = json.code;
      await route.fulfill({ response, json });
    });
    await page.goto(url);
    const list = board(page).getByRole("list").first();
    await expect(list.locator(":scope > li")).toHaveCount(2);
    await expect(board(page).getByText(t.board.you)).toHaveCount(0);
    expect(await playSeason(page)).toBe(own);
    // A play fetches the board again: the visitor's side is marked in words.
    const items = list.locator(":scope > li");
    await expect(items.nth(1).getByText(t.board.you)).toBeVisible();
    await expect(items.nth(0).getByText(t.board.you)).toHaveCount(0);
    await expect(items.nth(0)).toContainText(fill(t.board.rank, { rank: 1 }));
    await expect(items.nth(1)).toContainText(fill(t.board.rank, { rank: 2 }));
    await expect(items.nth(0)).toContainText(
      fill(t.result.record, { w: 21, d: 3, l: 6 }),
    );
    const details = items.nth(0).locator("details");
    await expect(details).not.toHaveAttribute("open");
    await expect(details.locator("li")).toHaveCount(11);
    const first = locale === "ar-TN" ? "عربي 1-1" : "Latin 1-1";
    await expect(details.getByText(first, { exact: true })).toBeHidden();
    await details.locator("summary").click();
    await expect(details.getByText(first, { exact: true })).toBeVisible();
    expect(await noSidewaysScroll(page)).toBe(0);
    expect(await axe(page)).toEqual([]);
    await board(page).screenshot({
      path: shot(12, slug, 1280, "board-on"),
    });
  });

  test(`${url} draft, re-spin, play, share, at 320 px in three locales, axe clean at each state`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(url);
    // Drafting: the first spin, re-spun once, then eleven picks.
    await spinning(page, 1);
    await page.getByRole("button", { name: t.respin }).click();
    await expect(page.getByRole("button", { name: t.respin })).toBeDisabled();
    await spinning(page, 1);
    expect(await axe(page)).toEqual([]);
    expect(await noSidewaysScroll(page)).toBe(0);
    await page.screenshot({
      path: shot(15, slug, 320, "drafting"),
      fullPage: true,
    });
    for (let slot = 0; slot < 11; slot++) {
      await spinning(page, slot + 1);
      await pickButtons(page).first().click();
    }
    // Complete: eleven drafted, the play button ready.
    await expect(page.getByRole("button", { name: t.play })).toBeEnabled();
    expect(await axe(page)).toEqual([]);
    expect(await noSidewaysScroll(page)).toBe(0);
    await page.screenshot({
      path: shot(15, slug, 320, "complete"),
      fullPage: true,
    });
    // Simulated: the season, then the share (no system sheet: the clipboard).
    await page.getByRole("button", { name: t.play }).click();
    await expect(page.locator("#season-result")).toBeVisible();
    await expect(page.locator("[data-record]")).toBeVisible();
    await page.evaluate(() => {
      const probe = window as unknown as { copied?: string };
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            probe.copied = text;
          },
        },
      });
    });
    await page.getByRole("button", { name: t.share.button }).click();
    await expect(page.getByText(t.share.copied)).toBeVisible();
    const copied = await page.evaluate(
      () => (window as unknown as { copied?: string }).copied,
    );
    expect(copied).toContain(`${prefix}/season/r/`);
    expect(await axe(page)).toEqual([]);
    expect(await noSidewaysScroll(page)).toBe(0);
    await page.screenshot({
      path: shot(15, slug, 320, "simulated"),
      fullPage: true,
    });
  });

  for (const width of [1280, 320]) {
    test(`${url} screenshots at ${width} px: idle, spinning, drafted`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 320 ? 640 : 800 });
      // Idle: the page before the draft endpoint answers.
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => (release = resolve));
      await page.route("**/api/season/draft", async (route) => {
        await held;
        await route.continue();
      });
      await page.goto(url);
      await expect(page.locator('[data-line="goalkeeper"]')).toBeVisible();
      expect(await noSidewaysScroll(page)).toBe(0);
      await page.screenshot({
        path: shot(10, slug, width, "idle"),
        fullPage: true,
      });
      release();
      await spinning(page, 1);
      await page.screenshot({
        path: shot(10, slug, width, "spinning"),
        fullPage: true,
      });
      for (let slot = 0; slot < 11; slot++) {
        await spinning(page, slot + 1);
        await pickButtons(page).first().click();
      }
      await expect(page.getByRole("button", { name: t.play })).toBeEnabled();
      expect(await noSidewaysScroll(page)).toBe(0);
      await page.screenshot({
        path: shot(10, slug, width, "drafted"),
        fullPage: true,
      });
    });
  }
}

// No layout shift while drafting: the spin area keeps at least a screen's
// height until the 11th pick, so the first spin's arrival moves nothing the
// visitor can see. At 1280 px the pitch has its own column, so it stays put
// with or without the reservation: there the board's bound below the fold is
// the guard. At 320 px the pitch is below the spin and stays below the fold
// (a spin of five cards is taller than a screen, so it may move further
// down, unseen).
for (const width of [320, 1280]) {
  test(`/ar/season the first spin moves nothing on screen at ${width} px`, async ({
    page,
  }) => {
    const t = arTN.season;
    const height = width === 320 ? 640 : 800;
    await page.setViewportSize({ width, height });
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/season/draft", async (route) => {
      await held;
      await route.continue();
    });
    await page.goto("/ar/season");
    const pitch = page.getByRole("region", { name: t.squad });
    const board = page.getByRole("region", { name: t.board.title });
    await expect(page.locator('[data-line="goalkeeper"]')).toBeVisible();
    const top = async () => ({
      pitch: (await pitch.boundingBox())!.y,
      board: (await board.boundingBox())!.y,
    });
    const idle = await top();
    expect(await axe(page)).toEqual([]);
    release();
    await expect(page.getByText(fill(t.slot, { n: 1 }))).toBeVisible();
    const spun = await top();
    if (width === 1280) {
      expect(spun.pitch).toBe(idle.pitch);
    } else {
      for (const y of [idle.pitch, spun.pitch])
        expect(y).toBeGreaterThanOrEqual(height);
      expect(spun.pitch).toBeGreaterThanOrEqual(idle.pitch);
    }
    for (const y of [idle.board, spun.board])
      expect(y).toBeGreaterThanOrEqual(height);
    expect(await axe(page)).toEqual([]);
  });
}

test("/ar/season a failed start keeps the spin area: the notice shows and the board stays below the fold", async ({
  page,
}) => {
  const t = arTN.season;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route("**/api/season/draft", (route) =>
    route.fulfill({ status: 503, json: { error: "closed" } }),
  );
  await page.goto("/ar/season");
  await expect(page.getByText(t.error.closed)).toBeVisible();
  const board = page.getByRole("region", { name: t.board.title });
  expect((await board.boundingBox())!.y).toBeGreaterThanOrEqual(800);
  expect(await axe(page)).toEqual([]);
});

// Accepted trade-off: the server renders every visit at idle, so a visitor
// whose saved draft is already complete sees the reserved area collapse once
// on mount; the play button then comes straight after the intro.
test("/fr/season a restored complete draft shows the play button with no reserved area", async ({
  page,
}) => {
  const t = fr.season;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/fr/season");
  const pick = page.getByRole("button", { name: new RegExp(escape(t.pick)) });
  for (let slot = 0; slot < 11; slot++) {
    await expect(page.getByText(fill(t.slot, { n: slot + 1 }))).toBeVisible();
    await pick.first().click();
  }
  await expect(page.getByRole("button", { name: t.play })).toBeEnabled();
  await page.reload();
  const play = page.getByRole("button", { name: t.play });
  await expect(play).toBeVisible();
  await expect(play).toBeEnabled();
  const board = page.getByRole("region", { name: t.board.title });
  await expect(board).toBeVisible();
  expect((await board.boundingBox())!.y).toBeLessThan(800);
});
