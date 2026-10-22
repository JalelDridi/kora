import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import arLatnTN from "../messages/ar-Latn-TN.json";
import arTN from "../messages/ar-TN.json";
import fr from "../messages/fr.json";
import { localeInfo, locales, type Locale } from "../src/i18n/locales";
import { noSidewaysScroll, shot } from "./chkoun-helpers";

// The end of a 30–0 draft (plan Task 11) on the built server, Redis off:
// play gives the season and "saved on this device", the share text carries
// a replay link, the replay page plays the same squad again, and the hall
// keeps the best seasons on the device. Each test has its own context.

const messages = { "ar-TN": arTN, "ar-Latn-TN": arLatnTN, fr };
const fill = (s: string, values: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k]));
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const LRM = "‎";

const axe = async (page: Page) =>
  (await new AxeBuilder({ page }).analyze()).violations;

type Played = { day: string; code: string };

/** Drafts eleven (first candidate each time) and plays the season. */
async function playSeason(page: Page, locale: Locale): Promise<Played> {
  const t = messages[locale].season;
  const pick = page.getByRole("button", { name: new RegExp(escape(t.pick)) });
  for (let slot = 0; slot < 11; slot++) {
    await expect(page.getByText(fill(t.slot, { n: slot + 1 }))).toBeVisible();
    await pick.first().click();
  }
  const answer = page.waitForResponse("**/api/season/play");
  await page.getByRole("button", { name: t.play }).click();
  const body = (await (await answer).json()) as Played;
  await expect(page.locator("#season-result")).toBeVisible();
  return { day: body.day, code: body.code };
}

const record = (page: Page) => page.locator("[data-record]").innerText();

/** Drafts eleven without playing; returns the token kept on the device. */
async function draftEleven(page: Page, locale: Locale): Promise<string> {
  const t = messages[locale].season;
  const pick = page.getByRole("button", { name: new RegExp(escape(t.pick)) });
  for (let slot = 0; slot < 11; slot++) {
    await expect(page.getByText(fill(t.slot, { n: slot + 1 }))).toBeVisible();
    await pick.first().click();
  }
  await expect(page.getByRole("button", { name: t.play })).toBeEnabled();
  return (await keptToken(page))!;
}

const keptToken = (page: Page) =>
  page.evaluate(() => {
    try {
      const v = JSON.parse(
        localStorage.getItem("kora.season.v1.draft") ?? "null",
      );
      return (v?.token as string | undefined) ?? null;
    } catch {
      return null;
    }
  });

test("a play refused as already played starts a new draft and says so", async ({
  page,
}) => {
  const t = fr.season;
  await page.goto("/fr/season");
  const old = await draftEleven(page, "fr");
  await page.route("**/api/season/play", (route) =>
    route.fulfill({ status: 409, json: { error: "already-played" } }),
  );
  await page.getByRole("button", { name: t.play }).click();
  await expect(page.getByText(fill(t.slot, { n: 1 }))).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: t.error.expired }),
  ).toHaveCount(1);
  await expect(page.getByRole("button", { name: t.play })).toHaveCount(0);
  const fresh = await keptToken(page);
  expect(fresh).not.toBeNull();
  expect(fresh).not.toBe(old);
  // The new draft's first spin has focus.
  await expect(page.locator("#season-spin")).toBeFocused();
});

test("when the new draft cannot start either, the start's notice shows, not expired", async ({
  page,
}) => {
  const t = fr.season;
  await page.goto("/fr/season");
  await draftEleven(page, "fr");
  await page.route("**/api/season/play", (route) =>
    route.fulfill({ status: 409, json: { error: "already-played" } }),
  );
  await page.route("**/api/season/draft", (route) =>
    route.fulfill({ status: 503, json: { error: "closed" } }),
  );
  await page.getByRole("button", { name: t.play }).click();
  await expect(page.getByText(t.error.closed)).toBeVisible();
  await expect(page.getByText(t.error.expired)).toHaveCount(0);
  // The dead token is gone from the device and the page.
  expect(await keptToken(page)).toBeNull();
  await expect(page.getByRole("button", { name: t.play })).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: t.squad }).locator("[data-picked]"),
  ).toHaveCount(0);
});

test("play shows the record, 30 matches and the team rating", async ({
  page,
}) => {
  const t = fr.season;
  await page.goto("/fr/season");
  await playSeason(page, "fr");
  const [w, d, l] = (await record(page)).trim().split("-").map(Number);
  expect(w + d + l).toBe(30);
  const matches = page.getByRole("list", { name: t.result.matches });
  await expect(matches.getByRole("listitem")).toHaveCount(30);
  // Each match says its round, where it is played and its outcome in words.
  const first = matches.getByRole("listitem").first();
  await expect(first).toContainText(fill(t.result.round, { n: 1 }));
  await expect(first).toContainText(
    new RegExp(`${escape(t.result.home)}|${escape(t.result.away)}`),
  );
  await expect(first).toContainText(
    new RegExp(
      [t.result.win, t.result.draw, t.result.loss].map(escape).join("|"),
    ),
  );
  await expect(page.getByText(t.result.teamRating)).toBeVisible();
  await expect(page.locator("[data-team-rating]")).toHaveText(/^\d+\.\d$/);
  await expect(page.locator("[data-points]")).toHaveText(String(3 * w + d));
  // Redis is off on the test server: the season stays on the device.
  await expect(page.getByText(t.result.onDevice)).toBeVisible();
  expect(await axe(page)).toEqual([]);
});

type Probe = { shared?: string; copied?: string };

/** What the browser offers, switchable while the page runs. */
async function offer(page: Page, share: boolean, clipboard: boolean) {
  await page.evaluate(
    ({ share, clipboard }) => {
      const probe = window as unknown as Probe;
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: share
          ? async (data: { text: string }) => {
              probe.shared = data.text;
            }
          : undefined,
      });
      Object.defineProperty(navigator, "canShare", {
        configurable: true,
        value: share ? () => true : undefined,
      });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: clipboard
          ? {
              writeText: async (text: string) => {
                probe.copied = text;
              },
            }
          : undefined,
      });
    },
    { share, clipboard },
  );
}

const probe = (page: Page) =>
  page.evaluate(() => {
    const p = window as unknown as Probe;
    return { shared: p.shared, copied: p.copied };
  });

test("the share falls back from the system sheet to copy, WhatsApp, then a long-press box", async ({
  page,
  browser,
}) => {
  const t = arTN.season;
  await page.goto("/ar/season");
  const played = await playSeason(page, "ar-TN");
  const button = page.getByRole("button", { name: t.share.button });

  // 1. The system sheet.
  await offer(page, true, true);
  await button.click();
  const { shared, copied } = await probe(page);
  expect(copied).toBeUndefined();
  const lines = shared!.split("\n");
  expect(lines).toHaveLength(4);
  expect(lines[0]).toBe(t.share.header);
  const shown = (await record(page)).trim();
  expect(lines[1]).toMatch(
    new RegExp(`^${LRM}${escape(shown)} · \\d+ ${t.share.points}${LRM}$`),
  );
  expect(lines[2]).toMatch(new RegExp(`^${LRM}${t.rating} \\d+\\.\\d${LRM}$`));
  const url = lines[3].slice(1);
  expect(lines[3][0]).toBe(LRM);
  expect(url).toMatch(
    new RegExp(
      `^https?://[^/]+/ar/season/r/${played.day}/${escape(played.code)}$`,
    ),
  );
  expect(new URL(url).pathname).not.toContain(".");

  // 2. No sheet: the clipboard.
  await offer(page, false, true);
  await button.click();
  await expect(page.getByText(t.share.copied)).toBeVisible();
  expect((await probe(page)).copied).toBe(shared);

  // 3. Neither: a WhatsApp link and the text in a box to long-press.
  await offer(page, false, false);
  await button.click();
  const box = page.getByRole("textbox", { name: t.share.longPress });
  await expect(box).toHaveValue(shared!);
  const whatsapp = page.getByRole("link", { name: t.share.whatsapp });
  const href = (await whatsapp.getAttribute("href"))!;
  expect(decodeURIComponent(href.slice("https://wa.me/?text=".length))).toBe(
    shared,
  );
  expect(await axe(page)).toEqual([]);

  // The shared link, opened by someone else, replays the same record.
  const other = await browser.newContext();
  const visitor = await other.newPage();
  // The link carries the site's address; the test server is local.
  const response = await visitor.goto(new URL(url).pathname);
  expect(response?.status()).toBe(200);
  expect((await record(visitor)).trim()).toBe(shown);
  await expect(visitor.getByText(t.replay.note)).toBeVisible();
  await other.close();
});

test("the shared link replays the same record", async ({ page, browser }) => {
  const t = fr.season;
  await page.goto("/fr/season");
  const played = await playSeason(page, "fr");
  const shown = (await record(page)).trim();
  const points = await page.locator("[data-points]").innerText();
  const rating = await page.locator("[data-team-rating]").innerText();
  const other = await browser.newContext();
  const visitor = await other.newPage();
  await visitor.goto(`/fr/season/r/${played.day}/${played.code}`);
  expect((await record(visitor)).trim()).toBe(shown);
  await expect(visitor.locator("[data-points]")).toHaveText(points);
  await expect(visitor.locator("[data-team-rating]")).toHaveText(rating);
  await expect(
    visitor.getByRole("list", { name: t.result.matches }).getByRole("listitem"),
  ).toHaveCount(30);
  await expect(visitor.getByText(t.replay.note)).toBeVisible();
  // The replay page is no game: no share button, no play again.
  await expect(
    visitor.getByRole("button", { name: t.share.button }),
  ).toHaveCount(0);
  const own = visitor.getByRole("link", { name: t.replay.draft });
  await expect(own).toHaveAttribute("href", "/fr/season");
  expect(await axe(visitor)).toEqual([]);
  await other.close();
});

test("a broken replay link shows the not-found page", async ({ page }) => {
  for (const path of [
    "/fr/season/r/2026-10-07/nobody_0",
    "/fr/season/r/2026-13-45/nobody_0",
    "/fr/season/r/2999-01-01/nobody_0",
    "/tn/season/r/2026-10-07/" + "a~".repeat(10) + "a",
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    await expect(
      page.getByRole("heading", { level: 1, name: fr.notFound.title }).or(
        page.getByRole("heading", {
          level: 1,
          name: arLatnTN.notFound.title,
        }),
      ),
    ).toBeVisible();
  }
});

test("the hall keeps the best seasons on this device", async ({ page }) => {
  const t = arLatnTN.season;
  await page.goto("/tn/season");
  await playSeason(page, "ar-Latn-TN");
  const hall = page.getByRole("table", { name: t.hall.title });
  await expect(hall.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: t.result.again }).click();
  await expect(page.locator("#season-result")).toHaveCount(0);
  await playSeason(page, "ar-Latn-TN");
  await expect(hall.locator("tbody tr")).toHaveCount(2);
  const points = (
    await hall.locator("tbody tr td[data-hall-points]").allInnerTexts()
  ).map(Number);
  expect(points).toEqual([...points].sort((a, b) => b - a));
  await page.screenshot({
    path: shot(11, "tn", 1280, "hall"),
    fullPage: true,
  });
  await page.reload();
  await expect(hall.locator("tbody tr")).toHaveCount(2);
  // Each kept season opens its replay.
  const link = hall.locator("tbody tr").first().getByRole("link");
  await expect(link).toHaveAttribute(
    "href",
    /^\/tn\/season\/r\/\d{4}-\d{2}-\d{2}\/[^.]+$/,
  );
});

test("the replay page is noindex", async ({ page }) => {
  await page.goto("/fr/season");
  const played = await playSeason(page, "fr");
  const shown = (await record(page)).trim();
  await page.goto(`/fr/season/r/${played.day}/${played.code}`);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  await expect(page).toHaveTitle(`${shown} · 30–0 · Kora`);
});

for (const locale of locales) {
  const { prefix } = localeInfo[locale];
  const slug = prefix.slice(1);
  for (const width of [1280, 320]) {
    test(`${prefix}/season result and replay at ${width} px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 320 ? 640 : 800 });
      await page.goto(`${prefix}/season`);
      const played = await playSeason(page, locale);
      expect(await noSidewaysScroll(page)).toBe(0);
      await page.screenshot({
        path: shot(11, slug, width, "result"),
        fullPage: true,
      });
      await page.goto(`${prefix}/season/r/${played.day}/${played.code}`);
      await expect(page.locator("[data-record]")).toBeVisible();
      expect(await noSidewaysScroll(page)).toBe(0);
      await page.screenshot({
        path: shot(11, slug, width, "replay"),
        fullPage: true,
      });
    });
  }
}
