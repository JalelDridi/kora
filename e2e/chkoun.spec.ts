import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import arLatnTN from "../messages/ar-Latn-TN.json";
import arTN from "../messages/ar-TN.json";
import fr from "../messages/fr.json";
import {
  COLUMNS,
  localName,
  tileText,
  type Labels,
  type TileColumn,
  type TileStrings,
} from "../src/chkoun/labels";
import { nextMidnight } from "../src/engine/chkoun/day";
import { localeInfo, locales } from "../src/i18n/locales";
import {
  footballer,
  guess,
  noSidewaysScroll,
  ready,
  scrolled,
  shot,
  skipHelp,
} from "./chkoun-helpers";
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

// Every test starts with the help already seen, but the first-visit ones.
const FIRST_VISIT = "on a first visit";
test.beforeEach(async ({ page }, info) => {
  if (!info.titlePath.includes(FIRST_VISIT)) await skipHelp(page);
});

/**
 * Every word of every tile and header that sits on more than one line: a
 * break inside a word, or automatic hyphenation (Chromium on Linux has
 * dictionaries). A word too wide for its tile is cut with an ellipsis, never
 * broken.
 */
async function splitWords(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const bad: string[] = [];
    for (const el of document.querySelectorAll(
      "[data-guess] [data-value], [data-tile-headers] [data-head]",
    )) {
      if (getComputedStyle(el).hyphens === "auto")
        bad.push(`hyphens:auto on ${el.textContent}`);
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? "";
        for (const m of text.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(node, m.index!);
          range.setEnd(node, m.index! + m[0].length);
          const lines = new Set(
            [...range.getClientRects()].map((r) => Math.round(r.top)),
          );
          if (lines.size > 1) bad.push(m[0]);
        }
      }
    }
    return bad;
  });
}

/**
 * Every word of a tile value or a header word that does not fit its box: it
 * overflows (the words are never cut, fix round 1) or something still cuts
 * it with an ellipsis.
 */
async function cutWords(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const bad: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(
      "[data-guess] [data-value], [data-guess] [data-value] [data-word], [data-tile-headers] [data-head] [data-word]",
    )) {
      const style = getComputedStyle(el);
      if (style.textOverflow === "ellipsis")
        bad.push(`ellipsis on ${el.textContent}`);
      if (el.scrollWidth > el.clientWidth + 1)
        bad.push(`${el.textContent} (${el.scrollWidth} > ${el.clientWidth})`);
    }
    return bad;
  });
}

/** The day's label tables, as the game page loads them. */
async function gameLabels(page: Page, locale: string): Promise<Labels> {
  const response = await page.request.get(`/chkoun-data/${locale}.json`);
  return ((await response.json()) as { labels: Labels }).labels;
}

const axe = async (page: Page) =>
  (await new AxeBuilder({ page }).analyze()).violations;

for (const locale of locales) {
  const { prefix } = localeInfo[locale];
  const t = messages[locale].chkoun;
  const url = `${prefix}/chkoun`;

  test.describe(FIRST_VISIT, () => {
    test(`${url}: the help opens on the first visit only, traps focus, closes on Escape, reopens from ?`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(url);
      const help = page.getByRole("dialog", {
        name: messages[locale].header.help,
      });
      await expect(help).toBeVisible();
      expect(await noSidewaysScroll(page)).toBe(0);
      await expect(help.locator("[data-example] li")).toHaveCount(6);
      // Focus never leaves the dialog, Tab after Tab.
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press("Tab");
        expect(
          await help.evaluate((d) => d.contains(document.activeElement)),
          `after Tab ${i + 1}`,
        ).toBe(true);
      }
      await page.keyboard.press("Escape");
      await expect(help).toBeHidden();
      await page.reload();
      await ready(page);
      await expect(help).toBeHidden();
      const button = page.getByRole("button", {
        name: messages[locale].header.help,
      });
      await button.click();
      await expect(help).toBeVisible();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await help
        .getByRole("button", { name: messages[locale].header.close })
        .click();
      await expect(button).toBeFocused();
    });
  });

  test(`${url}: the rules prose is no longer on the page`, async ({ page }) => {
    await page.goto(url);
    await ready(page);
    await expect(page.locator("main").getByText(t.rules)).toBeHidden();
  });

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
    // The search that held focus is gone: the result heading takes it.
    await expect(page.locator("#chkoun-result")).toBeFocused();
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
    await expect(page.locator("#chkoun-result")).toBeFocused();
  });

  for (const width of [320, 340, 360]) {
    test(`${url}: at ${width} px the tiles sit 3 by 2, show their column's icon, and break no word`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 740 });
      await page.goto(url);
      await ready(page);
      for (const id of fixture.others.slice(0, 8)) await guess(page, id);
      const row = page.locator("[data-guess]").first();
      const box = async (c: string) =>
        (await row.locator(`[data-column="${c}"]`).boundingBox())!;
      expect((await box("club")).y).toBeCloseTo((await box("position")).y, 0);
      expect((await box("age")).y).toBeGreaterThan((await box("club")).y);
      // Under 375 px each tile shows its column's icon (D-MP-1); the header
      // row is there once, 3 by 2 as well.
      await expect(
        row.locator('[data-column="caps"] [data-icon]'),
      ).toBeVisible();
      await expect(page.locator("[data-tile-headers]")).toHaveCount(1);
      await expect(page.locator("[data-tile-headers]")).toBeVisible();
      expect(await splitWords(page)).toEqual([]);
      expect(await noSidewaysScroll(page)).toBe(0);
    });
  }

  for (const width of [375, 390, 412]) {
    test(`${url}: at ${width} px each guess is one row of six, values at 14 px or more`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(url);
      await ready(page);
      for (const id of fixture.others.slice(0, 3)) await guess(page, id);
      // The tiles flip in: measure them once still.
      await page.waitForFunction(() =>
        document.getAnimations().every((a) => a.playState !== "running"),
      );
      for (const row of await page.locator("[data-guess]").all()) {
        const ys = await row
          .locator("[data-column]")
          .evaluateAll((els) =>
            els.map((e) => Math.round(e.getBoundingClientRect().top)),
          );
        expect(ys).toHaveLength(6);
        expect(new Set(ys).size).toBe(1);
        // Every tile at least 44 px high; no icon inside the tiles here.
        const heights = await row
          .locator("[data-column]")
          .evaluateAll((els) =>
            els.map((e) => e.getBoundingClientRect().height),
          );
        expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
        await expect(row.locator("[data-icon]:visible")).toHaveCount(0);
      }
      const sizes = await page
        .locator("[data-guess] [data-value], [data-tile-headers] [data-head]")
        .evaluateAll((els) =>
          els.map((e) => parseFloat(getComputedStyle(e).fontSize)),
        );
      expect(sizes.length).toBeGreaterThanOrEqual(3 * 6 + 6);
      expect(Math.min(...sizes)).toBeGreaterThanOrEqual(14);
      // The header row once, its columns over the tiles' columns.
      const headers = page.locator("[data-tile-headers]");
      await expect(headers).toHaveCount(1);
      await expect(headers).toBeVisible();
      await expect(headers).toHaveAttribute("aria-hidden", "true");
      const heads = await headers
        .locator("[data-head]")
        .evaluateAll((els) =>
          els.map((e) => Math.round(e.getBoundingClientRect().left)),
        );
      const tiles = await page
        .locator("[data-guess]")
        .first()
        .locator("[data-column]")
        .evaluateAll((els) =>
          els.map((e) => Math.round(e.getBoundingClientRect().left)),
        );
      expect(heads).toEqual(tiles);
      // The tile's title keeps the whole club name, the tile its short label.
      const labels = await gameLabels(page, locale);
      for (const id of fixture.others.slice(0, 3)) {
        const clubId = footballer(id).clubId;
        if (!clubId) continue;
        const tile = page.locator(`[data-guess="${id}"] [data-column="club"]`);
        await expect(tile).toHaveAttribute("title", labels.clubs[clubId]);
        await expect(tile.locator("[data-value]")).toHaveText(
          labels.short[clubId] ?? labels.clubs[clubId],
        );
      }
      expect(await splitWords(page)).toEqual([]);
      expect(await noSidewaysScroll(page)).toBe(0);
    });
  }

  for (const width of [320, 340, 360, 375, 390, 412]) {
    test(`${url}: at ${width} px no tile value or header word is cut or overflows`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(url);
      await ready(page);
      for (const id of fixture.others.slice(0, 8)) await guess(page, id);
      await page.waitForFunction(() =>
        document.getAnimations().every((a) => a.playState !== "running"),
      );
      expect(await cutWords(page)).toEqual([]);
      expect(await splitWords(page)).toEqual([]);
      expect(await noSidewaysScroll(page)).toBe(0);
    });
  }

  // Every value the pool can show (the day's label tables, every country,
  // governorate, line, caps band and age) and every header word, measured in
  // the real tiles with 2 px to spare, so a renderer that draws text up to
  // 2 px wider (GitHub's Chromium against ours) still fits: the columns are
  // sized from the pool's words (fix rounds 1 and 2).
  for (const width of [320, 375, 390, 412]) {
    test(`${url}: at ${width} px every value the pool can show fits its column with 2 px to spare`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(url);
      await ready(page);
      await guess(page, fixture.others[0]);
      const labels = await gameLabels(page, locale);
      const strings: TileStrings = {
        positions: messages[locale].positions,
        positionsShort: messages[locale].positions.short,
        caps: t.caps,
        abroad: t.tiles.abroad,
        noClub: t.tiles.noClub,
      };
      const values: Record<TileColumn, (string | number)[]> = {
        club: Object.keys(labels.clubs),
        country: Object.keys(labels.countries),
        position: ["goalkeeper", "defender", "midfielder", "forward"],
        age: Array.from({ length: 31 }, (_, i) => 15 + i),
        caps: [0, 1, 2, 3, 4],
        governorate: [
          ...Object.keys(labels.governorates).map((g) => `gov:${g}`),
          ...Object.keys(labels.countries).map((c) => `abroad:${c}`),
        ],
      };
      const words = Object.fromEntries(
        COLUMNS.map((column) => [
          column,
          [
            ...new Set(
              values[column].flatMap((value) =>
                tileText(
                  column,
                  { colour: "grey", arrow: null, value },
                  labels,
                  strings,
                ).short.split(/\s+/),
              ),
            ),
          ],
        ]),
      );
      const tooWide = await page.evaluate((words) => {
        const SLACK = 2;
        const bad: string[] = [];
        const row = document.querySelector("[data-guess]")!;
        for (const [column, list] of Object.entries(words)) {
          const tile = row.querySelector<HTMLElement>(
            `[data-column="${column}"]`,
          )!;
          const style = getComputedStyle(tile);
          const room =
            tile.getBoundingClientRect().width -
            parseFloat(style.paddingInlineStart) -
            parseFloat(style.paddingInlineEnd);
          const probe = tile
            .querySelector("[data-value]")!
            .cloneNode(false) as HTMLElement;
          probe.style.cssText =
            "position:absolute;visibility:hidden;max-inline-size:none;white-space:nowrap";
          tile.append(probe);
          for (const word of list) {
            probe.textContent = word;
            const w = probe.getBoundingClientRect().width;
            if (w + SLACK > room)
              bad.push(
                `${column}: ${word} ${w.toFixed(1)} > ${room.toFixed(1)}`,
              );
          }
          probe.remove();
        }
        // The header words, in the header row as drawn.
        for (const head of document.querySelectorAll<HTMLElement>(
          "[data-tile-headers] [data-head]",
        )) {
          const room = head.getBoundingClientRect().width;
          for (const word of head.querySelectorAll<HTMLElement>(
            "[data-word]",
          )) {
            const w = word.scrollWidth;
            if (w + SLACK > room)
              bad.push(`header: ${word.textContent} ${w} > ${room.toFixed(1)}`);
          }
        }
        return bad;
      }, words);
      expect(tooWide).toEqual([]);
    });
  }

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

  // Mobile polish M4 (T-MP-4): the guesses grow towards the thumb. Rows sit
  // above the search; while playing, the search block is pinned to the
  // bottom of the screen and its suggestions open upward.
  for (const width of [320, 360]) {
    test(`${url}: at ${width} px rows sit above the search, the search stays on screen, the newest row is in view`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 740 });
      await page.goto(url);
      await ready(page);
      for (const id of fixture.others.slice(0, 5)) await guess(page, id);
      // The search keeps focus after a guess, rows and all.
      await expect(page.getByRole("combobox")).toBeFocused();
      await scrolled(page);
      const search = (await page.getByRole("combobox").boundingBox())!;
      const rows = page.locator("[data-guess]");
      const last = (await rows.last().boundingBox())!;
      expect(last.y + last.height).toBeLessThanOrEqual(search.y);
      expect(search.y + search.height).toBeLessThanOrEqual(740);
      expect(last.y).toBeGreaterThanOrEqual(0);
      await page.getByRole("combobox").fill("ben");
      await expect(page.getByRole("listbox")).toBeVisible();
      const list = (await page.getByRole("listbox").boundingBox())!;
      expect(list.y + list.height).toBeLessThanOrEqual(search.y + 1);
      expect(list.y).toBeGreaterThanOrEqual(0);
      expect(await noSidewaysScroll(page)).toBe(0);
      expect(await axe(page)).toEqual([]);
    });
  }

  for (const width of [1280, 360]) {
    test(`${url}: the shell and the live game put the search at the same height at ${width} px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.route("**/api/chkoun/today", async (r) => {
        await new Promise((f) => setTimeout(f, 1500));
        await r.continue();
      });
      await page.goto(url);
      const shell = (await page.locator("#chkoun-shell-search").boundingBox())!;
      await ready(page);
      const live = (await page.getByRole("combobox").boundingBox())!;
      expect(Math.abs(live.y - shell.y)).toBeLessThanOrEqual(1);
    });
  }

  test(`${url}: with the keyboard open (360×420), the upward suggestions stay on screen and scroll`, async ({
    page,
  }) => {
    // About what Android leaves of the screen with the keyboard open
    // (interactive-widget=resizes-content).
    await page.setViewportSize({ width: 360, height: 420 });
    await page.goto(url);
    await ready(page);
    for (const id of fixture.others.slice(0, 5)) await guess(page, id);
    await scrolled(page);
    const box = page.getByRole("combobox");
    await box.fill("ben");
    const list = page.getByRole("listbox");
    await expect(list).toBeVisible();
    const options = list.getByRole("option");
    expect(await options.count()).toBeGreaterThan(1);
    const top = (await list.boundingBox())!;
    const search = (await box.boundingBox())!;
    expect(top.y).toBeGreaterThanOrEqual(0);
    expect(top.y + top.height).toBeLessThanOrEqual(search.y + 1);
    // The farthest suggestion is reached by scrolling the list itself.
    const lastOption = options.last();
    await lastOption.scrollIntoViewIfNeeded();
    const far = (await lastOption.boundingBox())!;
    const shown = (await list.boundingBox())!;
    expect(far.y).toBeGreaterThanOrEqual(shown.y - 1);
    expect(far.y + far.height).toBeLessThanOrEqual(shown.y + shown.height + 1);
    // The arrow keys reach it too, and the search stays on screen.
    const count = await options.count();
    for (let i = 1; i < count; i++) await box.press("ArrowDown");
    await expect(lastOption).toHaveAttribute("aria-selected", "true");
    await expect(lastOption).toBeInViewport();
    expect((await box.boundingBox())!.y + search.height).toBeLessThanOrEqual(
      420,
    );
    expect(await noSidewaysScroll(page)).toBe(0);
  });

  test(`${url}: with no row yet, the suggestions open below the search`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(url);
    await ready(page);
    const search = (await page.getByRole("combobox").boundingBox())!;
    await page.getByRole("combobox").fill("ben");
    await expect(page.getByRole("listbox")).toBeVisible();
    const list = (await page.getByRole("listbox").boundingBox())!;
    expect(list.y).toBeGreaterThanOrEqual(search.y + search.height - 1);
  });

  test(`${url}: once finished, the result takes the pinned search's place`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(url);
    await ready(page);
    for (const id of fixture.others.slice(0, 3)) await guess(page, id);
    await guess(page, fixture.answers[0]);
    await expect(page.getByRole("combobox")).toHaveCount(0);
    const rows = page.locator("[data-guess]");
    const result = page.locator("#chkoun-result");
    expect((await rows.last().boundingBox())!.y).toBeLessThan(
      (await result.boundingBox())!.y,
    );
    expect(await noSidewaysScroll(page)).toBe(0);
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

  /** Screenshot names use the URL's locale: ar, tn, fr. */
  const slug = prefix.slice(1);
  test(`${url}: screenshots of the play layout at 320, 360, 375 and 412 px (task 4)`, async ({
    page,
  }) => {
    for (const width of [320, 360, 375, 412]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(url);
      await ready(page);
      await page.screenshot({ path: shot(4, slug, width, "first-screen") });
    }
    await page.setViewportSize({ width: 360, height: 800 });
    for (const id of fixture.others.slice(0, 2)) await guess(page, id);
    await scrolled(page);
    await page.screenshot({ path: shot(4, slug, 360, "two-rows") });
    await guess(page, fixture.others[2]);
    for (const width of [320, 360, 375, 412]) {
      await page.setViewportSize({ width, height: 800 });
      await page.reload();
      await ready(page);
      // As after a guess: the newest row just above the pinned search.
      await page.evaluate(() => {
        const rows = document.querySelectorAll("[data-guess]");
        const newest = rows[rows.length - 1].getBoundingClientRect();
        const search = document.querySelector("[data-pinned]")!;
        window.scrollBy(
          0,
          newest.bottom - search.getBoundingClientRect().top + 8,
        );
      });
      await scrolled(page);
      await page.screenshot({ path: shot(4, slug, width, "three-rows") });
    }
    for (const id of fixture.others.slice(3, 5)) await guess(page, id);
    await page.setViewportSize({ width: 360, height: 800 });
    await scrolled(page);
    await page
      .getByRole("combobox")
      .fill(footballer(fixture.others[5]).nameLatin.slice(0, 3));
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.screenshot({ path: shot(4, slug, 360, "five-rows-typing") });
    await page.getByRole("combobox").fill("");
    await page.getByRole("combobox").blur();
    await page.setViewportSize({ width: 320, height: 740 });
    await scrolled(page);
    await page.screenshot({ path: shot(4, slug, 320, "five-rows") });
  });

  test(`${url}: screenshots of a won game's rows at 320, 360, 375 and 412 px (task 5)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(url);
    await ready(page);
    for (const id of fixture.others.slice(0, 2)) await guess(page, id);
    await guess(page, fixture.answers[0]);
    await expect(page.locator("#chkoun-result")).toBeFocused();
    await page.waitForFunction(() =>
      document.getAnimations().every((a) => a.playState !== "running"),
    );
    for (const width of [320, 360, 375, 412]) {
      await page.setViewportSize({ width, height: 800 });
      await page.locator("[data-tile-headers]").scrollIntoViewIfNeeded();
      await page.evaluate(() => {
        const top = document
          .querySelector("[data-tile-headers]")!
          .getBoundingClientRect().top;
        window.scrollBy(0, top - 72);
      });
      await scrolled(page);
      await page.screenshot({ path: shot(5, slug, width, "rows") });
    }
  });
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

test("each guess is announced, and a name already guessed says so", async ({
  page,
}) => {
  await page.goto("/fr/chkoun");
  await ready(page);
  await guess(page, fixture.others[0]);
  const name = footballer(fixture.others[0]).nameLatin;
  const live = page.locator("p.sr-only[role=status]");
  await expect(live).toContainText(name);
  await expect(live).toContainText(fr.chkoun.tiles.club);
  const box = page.getByRole("combobox");
  await box.fill(name);
  await box.press("Enter");
  await expect(page.getByText(fr.chkoun.search.already).last()).toBeVisible();
  await expect(page.locator("[data-guess]")).toHaveCount(1);
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
    await skipHelp(page);
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

test("the help never opens over a game of today already on the device", async ({
  page,
}) => {
  // skipHelp (beforeEach) lets the first guess through; then the flag is
  // forgotten, and a fresh page without the init script sees today's game.
  await page.goto("/fr/chkoun");
  await ready(page);
  await guess(page, fixture.others[0]);
  await page.evaluate(() => localStorage.removeItem("kora.help.v1"));
  const fresh = await page.context().newPage();
  await fresh.goto("/fr/chkoun");
  await ready(fresh);
  await expect(fresh.locator("[data-guess]")).toHaveCount(1);
  await expect(
    fresh.getByRole("dialog", { name: fr.header.help }),
  ).toBeHidden();
  expect(await fresh.evaluate(() => localStorage.getItem("kora.help.v1"))).toBe(
    null,
  );
});

test.describe(FIRST_VISIT, () => {
  test("with reduced motion, the help appears without animation", async ({
    browser,
  }) => {
    for (const reducedMotion of ["reduce", "no-preference"] as const) {
      const context = await browser.newContext({ reducedMotion });
      const page = await context.newPage();
      await page.goto("/fr/chkoun");
      const help = page.getByRole("dialog", { name: fr.header.help });
      await expect(help).toBeVisible();
      const name = await help.evaluate(
        (d) => getComputedStyle(d).animationName,
      );
      expect(name).toBe(reducedMotion === "reduce" ? "none" : "kora-rise");
      await context.close();
    }
  });
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
  // The rules prose lives only there now: the help dialog explains the game.
  expect(noscript).toContain(arTN.chkoun.rules);
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/ar/chkoun");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
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
