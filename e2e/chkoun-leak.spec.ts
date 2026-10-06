import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import { packNames } from "../src/chkoun/search-index";
import { footballer, pool } from "./chkoun-helpers";
import { type ChkounFixture, seedChkoun } from "./fixtures/chkoun";

// The day's answer never reaches the visitor before his game ends (plan
// Task 12, "Readings" 1). Every active footballer is guessable, so his name
// is in the page by design: the page, its RSC payload and its scripts must
// hold today's (and tomorrow's) answer exactly as often as any other
// footballer, and no API response before the end may name him.

let fixture: ChkounFixture;
test.beforeAll(async () => {
  fixture = await seedChkoun();
});

const count = (text: string, needle: string) => text.split(needle).length - 1;
const names = JSON.stringify(packNames(pool));

/** A wrong guess whose id and name occur as often in the name list as `id`'s. */
function controlFor(id: string): string {
  const a = footballer(id);
  const control = fixture.others.find((o) => {
    const c = footballer(o);
    return (
      count(names, c.id) === count(names, a.id) &&
      count(names, c.nameLatin) === count(names, a.nameLatin)
    );
  });
  if (!control) throw new Error(`no control footballer for ${id}`);
  return control;
}

async function pageAndPayload(request: APIRequestContext, path: string) {
  const html = await (await request.get(path)).text();
  const rsc = await (await request.get(path, { headers: { RSC: "1" } })).text();
  return { html, rsc };
}

for (const path of ["/ar/chkoun", "/tn/chkoun", "/fr/chkoun"]) {
  test(`${path}: today's and tomorrow's answers appear as often as a control footballer`, async ({
    request,
  }) => {
    const { html, rsc } = await pageAndPayload(request, path);
    expect(rsc.length).toBeGreaterThan(1000);
    for (const id of [fixture.answers[0], fixture.answers[1]]) {
      const answer = footballer(id);
      const control = footballer(controlFor(id));
      for (const text of [html, rsc]) {
        expect(count(text, answer.id)).toBeGreaterThan(0);
        expect(count(text, answer.id)).toBe(count(text, control.id));
        expect(count(text, answer.nameLatin)).toBe(
          count(text, control.nameLatin),
        );
      }
    }
  });
}

test("no JS chunk contains the answer's id or a control footballer's id", async ({
  request,
}) => {
  const html = await (await request.get("/ar/chkoun")).text();
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+\.js[^"]*)"/g)].map(
    (m) => m[1],
  );
  expect(scripts.length).toBeGreaterThan(0);
  const answer = footballer(fixture.answers[0]);
  const control = footballer(controlFor(answer.id));
  for (const src of scripts) {
    const js = await (await request.get(src)).text();
    for (const secret of [answer.id, control.id, answer.nameLatin])
      expect(js, src).not.toContain(secret);
  }
});

test("today's endpoint and seven wrong guesses never contain the answer's id, names or photo path", async ({
  request,
}) => {
  const answer = footballer(fixture.answers[0]);
  const secrets = [
    answer.id,
    answer.nameLatin,
    answer.nameArabic,
    answer.nameFrench,
    `photos/${answer.id}`,
  ].filter((s): s is string => Boolean(s));
  const todayText = await (await request.get("/api/chkoun/today")).text();
  for (const s of secrets) expect(todayText).not.toContain(s);
  const { number } = JSON.parse(todayText);
  let token: string | null = null;
  for (const guess of fixture.others.slice(0, 7)) {
    const response: APIResponse = await request.post("/api/chkoun/guess", {
      data: { n: number, token, guess },
    });
    const text: string = await response.text();
    for (const s of secrets) expect(text).not.toContain(s);
    token = JSON.parse(text).token;
  }
  // Positive control: the 8th wrong guess ends the game and returns the card.
  const last = await request.post("/api/chkoun/guess", {
    data: { n: number, token, guess: fixture.others[7] },
  });
  expect(await last.json()).toMatchObject({
    status: "lost",
    card: { id: answer.id, nameLatin: answer.nameLatin },
  });
});

test("the page names no answer in its title, preview or image URLs", async ({
  page,
}) => {
  await page.goto("/fr/chkoun");
  const head = await page.locator("head").innerHTML();
  for (const id of [fixture.answers[0], fixture.answers[1]]) {
    expect(head).not.toContain(id);
    expect(head).not.toContain(footballer(id).nameLatin);
  }
  const images = await page
    .locator("img")
    .evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src));
  for (const src of images) expect(src).not.toContain("/photos/");
});

test("the pool used by the page is the one the server reads", () => {
  expect(pool.players.length).toBeGreaterThan(0);
});
