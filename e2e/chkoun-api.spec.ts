import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { Pool } from "../src/pipeline/types";
import { type ChkounFixture, seedChkoun } from "./fixtures/chkoun";

// The game's API on the built server, Redis off (E2E_ENV): a scripted game
// to a loss, the answer only in the 8th response, and no cookie.

const pool = JSON.parse(readFileSync("data/pool.json", "utf8")) as Pool;
let fixture: ChkounFixture;
test.beforeAll(async () => {
  fixture = await seedChkoun();
});

test("today is open and names no footballer", async ({ request }) => {
  const response = await request.get("/api/chkoun/today");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  expect(response.headers()["set-cookie"]).toBeUndefined();
  const text = await response.text();
  expect(JSON.parse(text)).toMatchObject({
    status: "open",
    day: fixture.today,
    store: "device",
  });
  expect(text).not.toContain(fixture.answers[0]);
});

test("a scripted game to a loss: the card only in the 8th response, no cookie", async ({
  request,
}) => {
  const today = await (await request.get("/api/chkoun/today")).json();
  const answer = pool.players.find((p) => p.id === fixture.answers[0])!;
  let token: string | null = null;
  for (const [i, guess] of fixture.others.slice(0, 8).entries()) {
    const response = await request.post("/api/chkoun/guess", {
      data: { n: today.number, token, guess },
    });
    expect(response.status()).toBe(200);
    expect(response.headers()["set-cookie"]).toBeUndefined();
    const text = await response.text();
    const body = JSON.parse(text);
    token = body.token;
    if (i < 7) {
      expect(body.status).toBe("playing");
      for (const secret of [answer.id, answer.nameLatin])
        expect(text).not.toContain(secret);
    } else {
      expect(body).toMatchObject({
        status: "lost",
        store: "device",
        card: { id: answer.id },
      });
    }
  }
});

test("a forged token is refused", async ({ request }) => {
  const today = await (await request.get("/api/chkoun/today")).json();
  const response = await request.post("/api/chkoun/guess", {
    data: { n: today.number, token: "v1.e30.AAAA", guess: fixture.others[0] },
  });
  expect(response.status()).toBe(403);
});
