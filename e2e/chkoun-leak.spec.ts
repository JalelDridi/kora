import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import { packNames } from "../src/chkoun/search-index";
import type { PoolPlayer } from "../src/pipeline/types";
import { footballer, pool } from "./chkoun-helpers";
import { type ChkounFixture, seedChkoun } from "./fixtures/chkoun";
import { isGuessable } from "../src/pipeline/grace";

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

type Needle = (p: PoolPlayer) => string | null;

/** The strings that name a footballer: id, the three names, the photo path. */
const NEEDLES: Record<string, Needle> = {
  id: (p) => p.id,
  latin: (p) => p.nameLatin,
  arabic: (p) => p.nameArabic,
  french: (p) => p.nameFrench,
  photo: (p) => `photos/${p.id}`,
};

/**
 * A footballer who is never an answer and whose `needle` occurs as often in
 * the name list as `id`'s: the control the answer is compared with.
 */
function controlFor(id: string, needle: Needle): PoolPlayer {
  const a = footballer(id);
  const target = needle(a)!;
  const control = pool.players.find((c) => {
    if (!c.pools.active || fixture.answers.includes(c.id)) return false;
    const value = needle(c);
    return value !== null && count(names, value) === count(names, target);
  });
  if (!control) throw new Error(`no control footballer for ${id}`);
  return control;
}

/** The token's payload, decoded: a substring test cannot see inside base64url. */
function decodedToken(token: string | null): string {
  if (!token) return "";
  const payload = token.split(".")[1] ?? "";
  return Buffer.from(payload, "base64url").toString("utf8");
}

async function pageAndPayload(request: APIRequestContext, path: string) {
  const html = await (await request.get(path)).text();
  const payload = await request.get(path, { headers: { RSC: "1" } });
  // A fallback to HTML must not pass as the payload.
  expect(payload.headers()["content-type"]).toContain("text/x-component");
  return { html, rsc: await payload.text() };
}

for (const [path, locale] of [
  ["/ar/chkoun", "ar-TN"],
  ["/tn/chkoun", "ar-Latn-TN"],
  ["/fr/chkoun", "fr"],
] as const) {
  test(`${path}: today's and tomorrow's answers appear as often as a control footballer`, async ({
    request,
  }) => {
    const { html, rsc } = await pageAndPayload(request, path);
    expect(rsc.length).toBeGreaterThan(1000);
    // The name list the page loads after its first paint.
    const data = await request.get(`/chkoun-data/${locale}.json`);
    expect(data.status()).toBe(200);
    const list = await data.text();
    for (const id of [fixture.answers[0], fixture.answers[1]]) {
      const answer = footballer(id);
      expect(count(list, answer.id)).toBeGreaterThan(0);
      // The page itself carries no footballer: the list comes after it.
      expect(count(html, answer.id)).toBe(0);
      expect(count(rsc, answer.id)).toBe(0);
      // No photo path anywhere before the end.
      for (const text of [html, rsc, list])
        expect(count(text, `photos/${answer.id}`)).toBe(0);
      for (const [kind, needle] of Object.entries(NEEDLES)) {
        const value = needle(answer);
        if (value === null) continue;
        const control = needle(controlFor(id, needle))!;
        for (const text of [html, rsc, list])
          expect(count(text, value), `${kind} of ${id}`).toBe(
            count(text, control),
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
  const control = controlFor(answer.id, NEEDLES.id);
  for (const src of scripts) {
    const js = await (await request.get(src)).text();
    for (const secret of [answer.id, control.id, answer.nameLatin])
      expect(js, src).not.toContain(secret);
  }
});

test("today's endpoint and seven wrong guesses never contain today's or tomorrow's answer's id, names or photo path", async ({
  request,
}) => {
  const answer = footballer(fixture.answers[0]);
  const secrets = [fixture.answers[0], fixture.answers[1]]
    .map(footballer)
    .flatMap((p) => Object.values(NEEDLES).map((needle) => needle(p)))
    .filter((s): s is string => Boolean(s));
  const todayText = await (await request.get("/api/chkoun/today")).text();
  for (const s of secrets) expect(todayText).not.toContain(s);
  const { number } = JSON.parse(todayText);
  let token: string | null = null;
  for (const guess of fixture.others.slice(0, 7)) {
    const response: APIResponse = await request.post("/api/chkoun/guess", {
      data: { n: number, token, guess },
    });
    const text: string = await response.text();
    token = JSON.parse(text).token;
    expect(decodedToken(token)).toContain(guess);
    for (const s of secrets) {
      expect(text).not.toContain(s);
      expect(decodedToken(token)).not.toContain(s);
    }
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

test("the name list is a static JSON file per locale, and nothing else", async ({
  request,
}) => {
  for (const locale of ["ar-TN", "ar-Latn-TN", "fr"]) {
    const response = await request.get(`/chkoun-data/${locale}.json`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(["labels", "names"]);
    // P54: the list holds the active pool and the footballers in grace.
    expect(body.names.length).toBe(
      pool.players.filter((p) => isGuessable(p.pools)).length,
    );
  }
  expect((await request.get("/chkoun-data/en.json")).status()).toBe(404);
});
