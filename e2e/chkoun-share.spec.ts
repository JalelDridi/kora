import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import arLatnTN from "../messages/ar-Latn-TN.json";
import arTN from "../messages/ar-TN.json";
import fr from "../messages/fr.json";
import { localName } from "../src/chkoun/labels";
import { footballer, guess, ready } from "./chkoun-helpers";
import { type ChkounFixture, seedChkoun } from "./fixtures/chkoun";

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
