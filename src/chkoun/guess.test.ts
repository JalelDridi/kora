import { beforeEach, describe, expect, it } from "vitest";
import { addDays, puzzleNumber, tunisDay } from "@/engine/chkoun/day.ts";
import { footballer } from "@/pipeline/__fixtures__/calendar-pool.ts";
import type { Pool, PoolPlayer } from "@/pipeline/types.ts";
import { buildFootballers } from "./attributes.ts";
import { handleGuess, MAX_BODY_BYTES } from "./guess.ts";
import type { GameDeps, Puzzle } from "./guess.ts";
import { FakeKv } from "./kv.ts";
import { pastTokenKey, signToken, tokenKey } from "./token.ts";

// A test seed and fixed test footballers; never the real seed or calendar.
const seed = "test-seed-not-the-real-one";
const firstDay = "2026-10-05";
const noon = new Date("2026-10-19T11:00:00Z");
const ip = "203.0.113.7";
const visitor = "4b5c0f3e-2d1a-4c8e-9f7b-1a2b3c4d5e6f";

const answer: PoolPlayer = {
  ...footballer("ellyes-skhiri", "A"),
  nameLatin: "Ellyes Skhiri",
  nameArabic: "إلياس السخيري",
  nameFrench: "Ellyes Skhiri",
  position: "midfielder",
  birthDate: "1995-05-10",
  caps: 70,
  photo: {
    file: "File:Skhiri.jpg",
    thumbUrl: "https://upload.wikimedia.org/skhiri.jpg",
    width: 330,
    height: 400,
    licence: "CC BY-SA 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    author: "A photographer",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Skhiri.jpg",
    attributionRequired: true,
    path: "/photos/ellyes-skhiri.jpg",
  },
  wiki: { en: "Ellyes_Skhiri", fr: "Ellyes_Skhiri", ar: null },
};
const others = Array.from({ length: 9 }, (_, i) => ({
  ...footballer(`wrong-footballer-${i}`, "B"),
  nameLatin: `Wrong Footballer ${i}`,
  position: "forward" as const,
}));
const legend = {
  ...footballer("a-legend", "A"),
  pools: { active: false, legend: true },
};
const pool: Pool = {
  version: 1,
  players: [answer, ...others, legend],
  clubs: [],
  honours: [],
  flags: [],
  dropped: [],
};
const footballers = buildFootballers(pool, [
  {
    id: "sfax",
    nameLatin: "Sfax",
    nameArabic: "صفاقس",
    nameFrench: "Sfax",
    region: "centre_east",
  },
]);

const todayPuzzle = async (now: Date): Promise<Puzzle> => {
  const day = tunisDay(now);
  return {
    day,
    number: puzzleNumber(day, firstDay),
    playerId: answer.id,
  };
};

let kv: FakeKv;
beforeEach(() => {
  kv = new FakeKv();
});

const deps = (over: Partial<GameDeps> = {}): GameDeps => ({
  now: noon,
  puzzle: todayPuzzle,
  footballers,
  kv: null,
  seed,
  env: "test",
  firstDay,
  secureCookie: true,
  ...over,
});

/** As in production: yesterday's number is played (mobile polish M7). */
const wired = (over: Partial<GameDeps> = {}): GameDeps =>
  deps({
    pastPuzzle: async (day) => ({
      day,
      number: puzzleNumber(day, firstDay),
      playerId: answer.id,
    }),
    ...over,
  });

const n = puzzleNumber("2026-10-19", firstDay);
const post = (
  d: GameDeps,
  body: { n?: number; token?: string | null; guess: string },
  cookie: string | null = null,
) =>
  handleGuess(d, JSON.stringify({ n, token: null, ...body }), { cookie, ip });

/** Plays the given guesses in order; returns every response. */
async function play(d: GameDeps, ids: string[], cookie: string | null = null) {
  let token: string | null = null;
  const out = [];
  for (const guess of ids) {
    const r = await post(d, { token, guess }, cookie);
    out.push(r);
    token = (r.body.token as string | undefined) ?? token;
  }
  return out;
}

const wrong = others.map((o) => o.id);
const leaks = (value: unknown) => {
  const text = JSON.stringify(value);
  return [
    answer.id,
    answer.nameLatin,
    answer.nameArabic!,
    "photos/ellyes-skhiri",
    "Skhiri",
  ].filter((s) => text.includes(s));
};

describe("handleGuess", () => {
  it("a first guess returns one tile row, a token, status playing, and no answer", async () => {
    const r = await post(deps(), { guess: wrong[0] });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      guesses: 1,
      status: "playing",
      store: "device",
    });
    expect(typeof r.body.token).toBe("string");
    expect(Object.keys(r.body.row as object)).toEqual([
      "club",
      "country",
      "position",
      "age",
      "caps",
      "governorate",
    ]);
    expect(r.body.card).toBeUndefined();
    expect(leaks(r.body)).toEqual([]);
  });

  it("every response before the end has no answer id, name, photo path or card", async () => {
    for (const d of [deps(), deps({ kv })]) {
      const responses = await play(d, wrong.slice(0, 7));
      expect(responses.map((r) => r.body.status)).toEqual(
        Array(7).fill("playing"),
      );
      for (const r of responses) {
        expect(leaks(r)).toEqual([]);
        expect(r.body.card).toBeUndefined();
        expect(r.setCookie).toBeUndefined();
      }
    }
  });

  it("the right guess returns status won and the card", async () => {
    const [, r] = await play(deps(), [wrong[0], answer.id]);
    expect(r.body).toMatchObject({
      guesses: 2,
      status: "won",
      card: {
        id: answer.id,
        nameLatin: "Ellyes Skhiri",
        photo: { path: "/photos/ellyes-skhiri.jpg" },
      },
    });
    const row = r.body.row as Record<string, { colour: string }>;
    expect(Object.values(row).map((t) => t.colour)).toEqual(
      Array(6).fill("green"),
    );
  });

  it("the 8th wrong guess returns status lost and the card", async () => {
    const responses = await play(deps(), wrong.slice(0, 8));
    expect(responses[7].body).toMatchObject({
      guesses: 8,
      status: "lost",
      card: { id: answer.id },
    });
  });

  it("a 9th guess, a repeated guess, a footballer outside the active pool, or a guess after the end is refused (422)", async () => {
    const key = tokenKey(seed);
    const eight = signToken({ n, d: "2026-10-19", g: wrong.slice(0, 8) }, key);
    expect(
      (await post(deps(), { token: eight, guess: wrong[8] })).body,
    ).toEqual({ error: "finished" });
    const one = signToken({ n, d: "2026-10-19", g: [wrong[0]] }, key);
    const repeated = await post(deps(), { token: one, guess: wrong[0] });
    expect(repeated).toMatchObject({
      status: 422,
      body: { error: "repeated" },
    });
    for (const outside of ["a-legend", "nobody-at-all"])
      expect(await post(deps(), { guess: outside })).toMatchObject({
        status: 422,
        body: { error: "unknown" },
      });
    const won = signToken({ n, d: "2026-10-19", g: [answer.id] }, key);
    expect(await post(deps(), { token: won, guess: wrong[1] })).toMatchObject({
      status: 422,
      body: { error: "finished" },
    });
  });

  it("a forged token is refused (403)", async () => {
    const forged = signToken(
      { n, d: "2026-10-19", g: [] },
      tokenKey("another-test-seed"),
    );
    expect(await post(deps(), { token: forged, guess: wrong[0] })).toEqual({
      status: 403,
      body: { error: "forbidden" },
    });
    expect(
      (await post(deps(), { token: "v1.e30.AAAA", guess: wrong[0] })).status,
    ).toBe(403);
  });

  it("a token from yesterday is refused with newDay and today's number (409)", async () => {
    const yesterday = signToken(
      { n: n - 1, d: "2026-10-18", g: [wrong[0]] },
      tokenKey(seed),
    );
    for (const d of [deps(), wired()])
      for (const body of [
        { n: n - 1, token: yesterday, guess: wrong[1] },
        { n, token: yesterday, guess: wrong[1] },
      ])
        expect(await post(d, body)).toEqual({
          status: 409,
          body: { error: "newDay", number: n },
        });
  });

  it("day boundary: a token for 19 Oct posted at 22:59:59 UTC is accepted; at 23:00:00 UTC it gets 409", async () => {
    const token = signToken(
      { n, d: "2026-10-19", g: [wrong[0]] },
      tokenKey(seed),
    );
    // Also with yesterday's game wired, as in production: at midnight the
    // game's number is yesterday's, and its token still gets newDay.
    for (const make of [deps, wired]) {
      const late = await post(
        make({ now: new Date("2026-10-19T22:59:59.999Z") }),
        { token, guess: wrong[1] },
      );
      expect(late.status).toBe(200);
      const midnight = await post(
        make({ now: new Date("2026-10-19T23:00:00.000Z") }),
        { token, guess: wrong[1] },
      );
      expect(midnight).toEqual({
        status: 409,
        body: { error: "newDay", number: n + 1 },
      });
    }
  });

  it('with Redis off: the game is playable, the response says store "device", no cookie is set, no rate limit', async () => {
    for (let i = 0; i < 100; i++)
      expect((await post(deps(), { guess: wrong[0] })).status).toBe(200);
    const responses = await play(deps(), wrong.slice(0, 8));
    const last = responses[7];
    expect(last.body).toMatchObject({ status: "lost", store: "device" });
    expect(last.body.stats).toBeUndefined();
    expect(last.setCookie).toBeUndefined();
  });

  it('with Redis on: the finishing response sets the visitor cookie when absent, records once and returns server stats with store "server"', async () => {
    const [, r] = await play(deps({ kv }), [wrong[0], answer.id]);
    expect(r.body).toMatchObject({
      status: "won",
      store: "server",
      stats: { streak: 1, played: 1, won: 1 },
    });
    expect(r.setCookie?.name).toBe("kora_v");
    expect(r.setCookie?.options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/api",
    });
    const id = r.setCookie!.value;
    const stored = await kv.hgetall("kora:test:chkoun:r:2026-10-19");
    expect(Object.keys(stored)).toEqual([id]);
    expect(JSON.parse(stored[id])).toEqual({
      s: 1,
      k: 2,
      grid: [expect.stringMatching(/^[gaxu]{6}$/), "gggggg"],
    });
    // The stored grid holds colours only, no footballer.
    expect(stored[id]).not.toContain("wrong-footballer");
  });

  it("with Redis on and a visitor cookie, the game is recorded under that id and no cookie is set", async () => {
    const responses = await play(
      deps({ kv }),
      wrong.slice(0, 8),
      `kora_v=${visitor}`,
    );
    expect(responses[7].setCookie).toBeUndefined();
    expect(responses[7].body).toMatchObject({
      status: "lost",
      store: "server",
      stats: { streak: 0, played: 1, won: 0 },
    });
    expect(
      Object.keys(await kv.hgetall("kora:test:chkoun:r:2026-10-19")),
    ).toEqual([visitor]);
  });

  it('with Redis on but failing: the game goes on with store "device"', async () => {
    kv.failing = true;
    const responses = await play(deps({ kv }), [wrong[0], answer.id]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(responses[1].body).toMatchObject({
      status: "won",
      store: "device",
    });
    expect(responses[1].body.stats).toBeUndefined();
    expect(responses[1].setCookie).toBeUndefined();
  });

  it("rate limited: 429 with retry seconds", async () => {
    for (let i = 0; i < 80; i++)
      expect((await post(deps({ kv }), { guess: wrong[0] })).status).toBe(200);
    const r = await post(deps({ kv }), { guess: wrong[0] });
    expect(r.status).toBe(429);
    expect(r.body).toEqual({ error: "tooMany", retryAfter: 600 });
    expect(r.headers).toEqual({ "Retry-After": "600" });
  });

  it("no puzzle (database down, nothing cached): 503 closed", async () => {
    expect(
      await post(deps({ puzzle: async () => null }), { guess: wrong[0] }),
    ).toEqual({ status: 503, body: { error: "closed" } });
  });

  it("body over 2 KB or not JSON: 400", async () => {
    const big = JSON.stringify({
      n,
      token: null,
      guess: wrong[0],
      pad: "x".repeat(MAX_BODY_BYTES),
    });
    for (const raw of [big, "not json", "[]", "null", '{"n":"1"}'])
      expect(await handleGuess(deps(), raw, { cookie: null, ip })).toEqual({
        status: 400,
        body: { error: "badRequest" },
      });
  });

  it("before the first day: 409 soon", async () => {
    expect(
      await post(deps({ now: new Date("2026-10-01T11:00:00Z") }), {
        n: -3,
        guess: wrong[0],
      }),
    ).toEqual({ status: 409, body: { error: "soon" } });
  });

  it("error bodies never carry a footballer", async () => {
    const bodies = [
      await post(deps(), { guess: "a-legend" }),
      await post(deps({ puzzle: async () => null }), { guess: wrong[0] }),
      await post(deps(), { n: 1, guess: wrong[0] }),
    ];
    for (const b of bodies) expect(leaks(b)).toEqual([]);
  });
});

describe("yesterday's footballer (M7)", () => {
  const yesterday = addDays("2026-10-19", -1);
  const past = (over: Partial<GameDeps> = {}) =>
    deps({
      pastPuzzle: async (day) => ({ day, number: n - 1, playerId: answer.id }),
      ...over,
    });
  const postPast = (
    d: GameDeps,
    body: { token?: string | null; guess: string },
  ) =>
    handleGuess(d, JSON.stringify({ n: n - 1, token: null, ...body }), {
      cookie: null,
      ip,
    });

  it("a guess on yesterday's number gets a row and a past token for that day", async () => {
    const r = await postPast(past(), { guess: wrong[0] });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      guesses: 1,
      status: "playing",
      store: "device",
      past: true,
    });
    expect(leaks(r.body)).toEqual([]);
  });

  it("asks for yesterday's day, never today's puzzle", async () => {
    const asked: string[] = [];
    let todayRead = false;
    await postPast(
      past({
        puzzle: async (now) => {
          todayRead = true;
          return todayPuzzle(now);
        },
        pastPuzzle: async (day) => {
          asked.push(day);
          return { day, number: n - 1, playerId: answer.id };
        },
      }),
      { guess: wrong[0] },
    );
    expect(asked).toEqual([yesterday]);
    expect(todayRead).toBe(false);
  });

  it("tokens do not cross: today's on yesterday's number, yesterday's on today's", async () => {
    const today = signToken(
      { n, d: "2026-10-19", g: [wrong[0]] },
      tokenKey(seed),
    );
    expect(
      (await postPast(past(), { token: today, guess: wrong[1] })).status,
    ).toBe(403);
    const old = signToken(
      { n: n - 1, d: yesterday, g: [wrong[0]] },
      pastTokenKey(seed),
    );
    expect((await post(past(), { token: old, guess: wrong[1] })).status).toBe(
      403,
    );
  });

  it("a today token on yesterday's number is 409 only when it is that day's own game; tampered or forged, 403", async () => {
    // Yesterday's own game under today's key: the day turned mid-game.
    const crossed = signToken(
      { n: n - 1, d: yesterday, g: [wrong[0]] },
      tokenKey(seed),
    );
    expect(await postPast(past(), { token: crossed, guess: wrong[1] })).toEqual(
      { status: 409, body: { error: "newDay", number: n } },
    );
    // Another number or day inside a today-key token: refused.
    for (const state of [
      { n, d: yesterday, g: [wrong[0]] },
      { n: n - 1, d: "2026-10-19", g: [wrong[0]] },
    ])
      expect(
        (
          await postPast(past(), {
            token: signToken(state, tokenKey(seed)),
            guess: wrong[1],
          })
        ).status,
      ).toBe(403);
    // Signed by neither key: refused.
    const forged = signToken(
      { n: n - 1, d: yesterday, g: [wrong[0]] },
      tokenKey("another-test-seed"),
    );
    expect(
      (await postPast(past(), { token: forged, guess: wrong[1] })).status,
    ).toBe(403);
  });

  it("a past token from the day before yesterday is refused as a new day", async () => {
    const older = signToken(
      { n: n - 2, d: addDays(yesterday, -1), g: [wrong[0]] },
      pastTokenKey(seed),
    );
    expect(
      (await postPast(past(), { token: older, guess: wrong[1] })).status,
    ).toBe(409);
  });

  it("a finished past game gives the card and records nothing: no stats, no cookie, no result key", async () => {
    let token: string | null = null;
    let last: Awaited<ReturnType<typeof handleGuess>> | undefined;
    for (const guess of [wrong[0], answer.id]) {
      last = await postPast(past({ kv }), { token, guess });
      token = last.body.token as string;
    }
    const out = last!;
    expect(out.body).toMatchObject({
      status: "won",
      store: "device",
      past: true,
    });
    expect(out.body.card).toMatchObject({ id: answer.id });
    expect(out.body.stats).toBeUndefined();
    expect(out.setCookie).toBeUndefined();
    expect(out.setCookies).toBeUndefined();
    expect(
      [...kv.entries.keys()].filter((k) => /:chkoun:(r|s):/.test(k)),
    ).toEqual([]);
  });

  it("yesterday's guesses share today's rate limit", async () => {
    const tight = past({ kv });
    let last = 0;
    for (let i = 0; i < 200 && last !== 429; i++)
      last = (await postPast(tight, { guess: wrong[i % wrong.length] })).status;
    expect(last).toBe(429);
    expect((await post(tight, { guess: wrong[0] })).status).toBe(429);
  });

  it("two days back, or before puzzle 1, is refused as a new day", async () => {
    expect(
      (
        await handleGuess(
          past(),
          JSON.stringify({ n: n - 2, token: null, guess: wrong[0] }),
          { cookie: null, ip },
        )
      ).status,
    ).toBe(409);
    const early = deps({
      now: new Date("2026-10-05T11:00:00Z"),
      pastPuzzle: async () => null,
    });
    expect(
      (
        await handleGuess(
          early,
          JSON.stringify({ n: 0, token: null, guess: wrong[0] }),
          { cookie: null, ip },
        )
      ).status,
    ).toBe(409);
  });

  it("no row for yesterday is closed (503), never a reserve", async () =>
    expect(
      (
        await postPast(past({ pastPuzzle: async () => null }), {
          guess: wrong[0],
        })
      ).status,
    ).toBe(503));

  it("without a past reader, yesterday's number is a new day (409)", async () =>
    expect((await postPast(deps(), { guess: wrong[0] })).status).toBe(409));
});
