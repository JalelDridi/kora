import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import arLatnTN from "../messages/ar-Latn-TN.json";
import arTN from "../messages/ar-TN.json";
import fr from "../messages/fr.json";
import { localName } from "../src/chkoun/labels";
import { firstLetter, letterFor } from "../src/engine/chkoun/hint";
import { localeInfo, locales } from "../src/i18n/locales";
import {
  footballer,
  guess,
  noSidewaysScroll,
  ready,
  shot,
  skipHelp,
} from "./chkoun-helpers";
import { type ChkounFixture, seedChkoun } from "./fixtures/chkoun";

// The game pages open with the help already seen (src/chkoun/help-seen.ts).
test.beforeEach(async ({ page }) => skipHelp(page));

// The end of a game (plan Task 13): the footballer's card with its photo
// credit or a silhouette, the share fallbacks, and the record.

let fixture: ChkounFixture;
test.beforeAll(async () => {
  fixture = await seedChkoun();
});

const photo = {
  path: "/icons/icon-192.png",
  author: "Jane Doe",
  licence: "CC BY-SA 4.0",
  licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Example.jpg",
};

async function win(page: Page, wrong = 1) {
  for (const id of fixture.others.slice(0, wrong)) await guess(page, id);
  await guess(page, fixture.answers[0]);
}

test("a lost game shows the card with the silhouette and the facts credit", async ({
  page,
}) => {
  await page.goto("/fr/chkoun");
  await ready(page);
  for (const id of fixture.others.slice(0, 8)) await guess(page, id);
  const answer = footballer(fixture.answers[0]);
  const card = page.getByRole("article", { name: localName(answer, "fr") });
  await expect(card).toBeVisible();
  if (!answer.photo?.path)
    await expect(
      card.getByRole("img", { name: fr.chkoun.card.noPhoto }),
    ).toBeVisible();
  await expect(card.getByText(fr.credit.facts)).toBeVisible();
  await expect(
    card.getByRole("link", { name: fr.credit.sources }),
  ).toHaveAttribute("href", "/fr/sources");
  await expect(card.getByText(String(answer.caps)).first()).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("the card shows a credit whenever a photo shows, and the photo loads only after the end", async ({
  page,
}) => {
  const photoRequests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes(photo.path) || r.url().includes("/photos/"))
      photoRequests.push(r.url());
  });
  await page.route("**/api/chkoun/guess", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    if (body.card) body.card.photo = photo;
    await route.fulfill({ response, json: body });
  });
  await page.goto("/fr/chkoun");
  await ready(page);
  await guess(page, fixture.others[0]);
  expect(photoRequests).toEqual([]);
  await guess(page, fixture.answers[0]);
  const answer = footballer(fixture.answers[0]);
  const card = page.getByRole("article", { name: localName(answer, "fr") });
  await expect(
    card.getByRole("img", { name: localName(answer, "fr") }),
  ).toHaveAttribute("src", photo.path);
  await expect(card.getByRole("link", { name: photo.author })).toHaveAttribute(
    "href",
    photo.sourceUrl,
  );
  await expect(card.getByRole("link", { name: photo.licence })).toHaveAttribute(
    "href",
    photo.licenceUrl,
  );
});

test("a reload after the end shows the same result and card", async ({
  page,
}) => {
  await page.goto("/tn/chkoun");
  await ready(page);
  await win(page);
  await page.reload();
  await expect(page.locator("#chkoun-result")).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(1);
});

type Probe = { shared?: string; copied?: string };

// Each fallback in turn (plan Task 13): the stubs replace what the browser
// offers before the page runs.
async function stub(page: Page, share: boolean, clipboard: boolean) {
  await page.addInitScript(
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

test("Share opens the system sheet with a spoiler-free text", async ({
  page,
}) => {
  await stub(page, true, true);
  await page.goto("/ar/chkoun");
  await ready(page);
  await win(page);
  await page.getByRole("button", { name: arTN.chkoun.share.button }).click();
  const { shared, copied } = await probe(page);
  expect(copied).toBeUndefined();
  const lines = shared!.split("\n");
  expect(lines[0]).toBe(arTN.chkoun.share.header);
  expect(lines[1]).toMatch(/^‎#\d+ · 2\/8‎$/);
  expect(lines.filter((l) => /^‎[🟩🟨⬛⬜]{6}$/u.test(l))).toHaveLength(2);
  expect(lines.at(-1)).toMatch(/^‎https?:\/\/[^/]+\/ar\/chkoun$/);
  const answer = footballer(fixture.answers[0]);
  for (const secret of [answer.nameLatin, answer.nameArabic, answer.id])
    if (secret) expect(shared).not.toContain(secret);
});

test("without a share sheet, Share copies the text", async ({ page }) => {
  await stub(page, false, true);
  await page.goto("/fr/chkoun");
  await ready(page);
  await win(page);
  await page.getByRole("button", { name: fr.chkoun.share.button }).click();
  await expect(page.getByText(fr.chkoun.share.copied)).toBeVisible();
  const { copied } = await probe(page);
  expect(copied).toMatch(/^C'est qui|Kora/);
  expect(copied!.split("\n").at(-1)).toMatch(/\/fr\/chkoun$/);
});

test("with neither, Share offers a WhatsApp link and a long-press box", async ({
  page,
}) => {
  await stub(page, false, false);
  await page.goto("/tn/chkoun");
  await ready(page);
  await win(page);
  await page
    .getByRole("button", { name: arLatnTN.chkoun.share.button })
    .click();
  const box = page.getByRole("textbox", {
    name: arLatnTN.chkoun.share.longPress,
  });
  await expect(box).toBeVisible();
  const text = await box.inputValue();
  expect(text.split("\n").at(-1)).toMatch(/\/tn\/chkoun$/);
  const whatsapp = page.getByRole("link", {
    name: arLatnTN.chkoun.share.whatsapp,
  });
  const href = (await whatsapp.getAttribute("href"))!;
  expect(href.startsWith("https://wa.me/?text=")).toBe(true);
  expect(decodeURIComponent(href.slice("https://wa.me/?text=".length))).toBe(
    text,
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

const record = (page: Page, label: string) =>
  page
    .locator("#chkoun-stats ~ dl > div")
    .filter({ has: page.getByRole("term").getByText(label, { exact: true }) })
    .locator("dd");

test("the streak is kept on the device, by puzzle number, and survives a reload", async ({
  page,
  request,
}) => {
  const { number } = await (await request.get("/api/chkoun/today")).json();
  await page.addInitScript((n) => {
    if (!localStorage.getItem("kora.chkoun.v1.stats"))
      localStorage.setItem(
        "kora.chkoun.v1.stats",
        JSON.stringify({
          last: n - 1,
          lastSolved: true,
          streak: 4,
          best: 4,
          played: 6,
          won: 5,
          dist: [0, 1, 2, 1, 1, 0, 0, 0],
        }),
      );
  }, number);
  await page.goto("/fr/chkoun");
  await ready(page);
  await win(page);
  await expect(record(page, fr.chkoun.stats.streak)).toHaveText("5");
  await expect(record(page, fr.chkoun.stats.best)).toHaveText("5");
  await expect(record(page, fr.chkoun.stats.played)).toHaveText("7");
  await expect(record(page, fr.chkoun.stats.winRate)).toHaveText("86%");
  await expect(page.locator("#chkoun-stats ~ [data-store]")).toHaveText(
    fr.chkoun.stats.onDevice,
  );
  await page.reload();
  await expect(record(page, fr.chkoun.stats.streak)).toHaveText("5");
  await expect(record(page, fr.chkoun.stats.played)).toHaveText("7");
});

test("the server's record replaces the device's when the server kept the game", async ({
  page,
}) => {
  const server = {
    last: 0,
    lastSolved: true,
    streak: 9,
    best: 12,
    played: 30,
    won: 27,
    dist: [1, 2, 3, 4, 5, 6, 3, 3],
  };
  await page.route("**/api/chkoun/guess", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    if (body.status !== "playing") {
      server.last = (
        body.token
          ? JSON.parse(
              Buffer.from(body.token.split(".")[1], "base64url").toString(),
            ).n
          : 0
      ) as number;
      body.stats = server;
      body.store = "server";
    }
    await route.fulfill({ response, json: body });
  });
  await page.goto("/fr/chkoun");
  await ready(page);
  await win(page);
  await expect(record(page, fr.chkoun.stats.streak)).toHaveText("9");
  await expect(record(page, fr.chkoun.stats.best)).toHaveText("12");
  await expect(page.locator("#chkoun-stats ~ [data-store]")).toHaveText(
    fr.chkoun.stats.onServer,
  );
});

const messages = { "ar-TN": arTN, "ar-Latn-TN": arLatnTN, fr };
/** The dialog has finished rising in, so axe reads its final colours. */
const settled = (dialog: Locator) =>
  dialog.evaluate((d) => Promise.all(d.getAnimations().map((a) => a.finished)));
const fill = (s: string, values: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k]));

// The record at any time (mobile polish M3): the header's stats button.
for (const locale of locales) {
  const m = messages[locale];
  const { prefix } = localeInfo[locale];
  const slug = prefix.slice(1);

  test(`${prefix}/chkoun the stats button opens the record before, during and after a game, with today's bar marked`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`${prefix}/chkoun`);
    await ready(page);
    const button = page
      .locator("body > div header")
      .first()
      .getByRole("button", { name: m.header.stats });
    const dialog = page.getByRole("dialog", { name: m.header.stats });
    const shots = async (state: string) => {
      for (const width of [320, 360, 412]) {
        await page.setViewportSize({ width, height: 800 });
        expect(await noSidewaysScroll(page)).toBe(0);
        await page.screenshot({ path: shot(3, slug, width, state) });
      }
      await page.setViewportSize({ width: 360, height: 800 });
    };

    // Before any guess: no game yet on this device.
    await button.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(m.chkoun.stats.empty)).toBeVisible();
    await settled(dialog);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await shots("stats-empty");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    // During: one wrong guess, still nothing counted.
    await guess(page, fixture.others[0]);
    await button.click();
    await expect(dialog.getByText(m.chkoun.stats.empty)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    // After a win in 2: the record, and the bar of 2 marked as today's.
    await guess(page, fixture.answers[0]);
    await expect(page.locator("#chkoun-result")).toBeVisible();
    await button.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(m.chkoun.stats.empty)).toHaveCount(0);
    await expect(
      dialog.getByRole("heading", { name: m.chkoun.stats.distribution }),
    ).toBeVisible();
    await expect(dialog.locator("[data-bar]")).toHaveCount(8);
    const today = dialog.locator('[data-bar="2"][data-today]');
    await expect(today).toBeVisible();
    await expect(today).toHaveAttribute("aria-current", "true");
    await expect(today).toContainText(
      fill(m.chkoun.stats.bar, { n: 2, count: 1 }),
    );
    await expect(dialog.locator("[data-today]")).toHaveCount(1);
    await expect(dialog.locator('[data-bar="5"]')).toContainText(
      fill(m.chkoun.stats.bar, { n: 5, count: 0 }),
    );
    // Western digits only, in every locale.
    expect(await dialog.innerText()).not.toMatch(
      /[\u0660-\u0669\u06f0-\u06f9]/,
    );
    await settled(dialog);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await shots("stats-won");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    // The record under the result shows the same chart.
    await expect(
      page.locator("#chkoun-stats-distribution ~ ol [data-today]"),
    ).toHaveAttribute("data-bar", "2");
  });
}

// The first letter after the 5th guess (mobile polish M8): the line under
// the guess counter, in the page's name form, and 💡 on a hinted win.
for (const locale of locales) {
  const m = messages[locale];
  const { prefix } = localeInfo[locale];
  const slug = prefix.slice(1);

  test(`${prefix}/chkoun after five wrong guesses the first letter shows; a win then marks the share with 💡`, async ({
    page,
  }) => {
    await stub(page, false, true);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`${prefix}/chkoun`);
    await ready(page);
    const answer = footballer(fixture.answers[0]);
    const letter = letterFor(
      {
        latin: firstLetter(answer.nameLatin)!,
        arabic: firstLetter(answer.nameArabic),
        french: firstLetter(answer.nameFrench),
      },
      locale,
    );
    const text = fill(m.chkoun.hint.label, { letter });
    const line = page.getByTestId("chkoun-hint");
    await expect(line).toHaveAttribute("role", "status");

    for (const id of fixture.others.slice(0, 4)) await guess(page, id);
    await expect(line).toHaveText("");
    await expect(page.getByText(text)).toHaveCount(0);
    await guess(page, fixture.others[4]);
    await expect(line).toHaveText(text);
    // One letter: never more of the name.
    expect([...letter]).toHaveLength(1);
    expect(await page.locator("body").innerText()).not.toContain(
      localName(answer, locale),
    );
    expect(await noSidewaysScroll(page)).toBe(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    for (const width of [320, 360, 412]) {
      await page.setViewportSize({ width, height: 800 });
      expect(await noSidewaysScroll(page)).toBe(0);
      await expect(line).toBeInViewport();
      await page.screenshot({ path: shot(8, slug, width, "hint") });
    }
    await page.setViewportSize({ width: 360, height: 800 });

    // A reload keeps the line.
    await page.reload();
    await ready(page);
    await expect(line).toHaveText(text);

    // A win on guess 6 is a hinted win: 💡 ends the score line.
    await guess(page, fixture.answers[0]);
    await expect(page.locator("#chkoun-result")).toBeVisible();
    await expect(page.getByText(text)).toHaveCount(0);
    await page.getByRole("button", { name: m.chkoun.share.button }).click();
    await expect(page.getByText(m.chkoun.share.copied)).toBeVisible();
    const { copied } = await probe(page);
    const lines = copied!.split("\n");
    expect(lines[1]).toMatch(/^‎?#\d+ · 6\/8 · 💡‎?$/u);
    expect(lines.filter((l) => /^‎[🟩🟨⬛⬜]{6}$/u.test(l))).toHaveLength(6);
    for (const width of [320, 360, 412]) {
      await page.setViewportSize({ width, height: 800 });
      expect(await noSidewaysScroll(page)).toBe(0);
      await page.screenshot({ path: shot(8, slug, width, "hinted-win") });
    }
  });
}

test("a win before the hint has no 💡, and the hint never shows in the first four guesses", async ({
  page,
}) => {
  await stub(page, false, true);
  const bodies: Record<string, unknown>[] = [];
  page.on("response", async (r) => {
    if (r.url().endsWith("/api/chkoun/guess"))
      bodies.push((await r.json()) as Record<string, unknown>);
  });
  await page.goto("/fr/chkoun");
  await ready(page);
  await win(page, 4);
  await expect(page.locator("#chkoun-result")).toBeVisible();
  await expect.poll(() => bodies.length).toBe(5);
  expect(bodies.every((b) => b.hint === undefined)).toBe(true);
  await page.getByRole("button", { name: fr.chkoun.share.button }).click();
  await expect(page.getByText(fr.chkoun.share.copied)).toBeVisible();
  const { copied } = await probe(page);
  expect(copied!.split("\n")[1]).toMatch(/^#\d+ · 5\/8$/);
});
