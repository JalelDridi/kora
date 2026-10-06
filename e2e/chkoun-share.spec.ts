import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
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
