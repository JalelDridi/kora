import { beforeAll, describe, expect, it } from "vitest";
import { FakeKv } from "@/chkoun/kv.ts";
import type { Kv } from "@/chkoun/kv.ts";
import { drafted } from "@/engine/season/draft.ts";
import {
  canonicalXi,
  rateXi,
  simulateSeason,
} from "@/engine/season/simulate.ts";
import type { SeasonDeps } from "./draft.ts";
import { handlePlay } from "./play.ts";
import { boardKey, playedKey } from "./store.ts";
import { draftToken, TEST_SEED, testData as data } from "./test-data.ts";
import { draftKeys, readDraft } from "./token.ts";

const now = new Date("2026-10-07T10:00:00Z");
const deps: SeasonDeps = {
  now,
  data,
  kv: null,
  env: "local",
  seed: TEST_SEED,
  secureCookie: false,
};
const keys = draftKeys(TEST_SEED);
const ctx = { data, key: keys.spin };
const ctx0: { cookie: string | null; ip: string | null } = {
  cookie: null,
  ip: null,
};
const ID = "0b7c1d2e-3f40-4a5b-8c6d-7e8f90a1b2c3";

const failingKv: Kv = new Proxy({} as Kv, {
  get: () => () => Promise.reject(new Error("Redis is down")),
});
const fakeKv = () => {
  const kv = new FakeKv();
  kv.nowMs = now.getTime();
  return kv;
};
const play = (token: string, d: SeasonDeps = deps, c = ctx0) =>
  handlePlay(d, JSON.stringify({ token }), c);

let complete: string, partial: string, other: string;
let expected: unknown;
beforeAll(async () => {
  complete = await draftToken(deps, 11);
  partial = await draftToken(deps, 10);
  other = await draftToken(deps, 11, 1);
  const state = readDraft(complete, keys.sign)!;
  expected = simulateSeason({
    day: "2026-10-07",
    xi: rateXi(data, drafted(ctx, state)!),
    table: data.table,
  });
});

describe("POST /api/season/play", () => {
  it("a complete draft is simulated with the day's seed and the squad's ratings", async () => {
    const r = await play(complete);
    expect(r.status).toBe(200);
    expect(r.body.season).toEqual(expected);
    expect(r.body).toMatchObject({ day: "2026-10-07" });
    const squad = r.body.squad as { id: string }[];
    expect(squad.map((c) => c.id).sort()).toEqual(
      [...readDraft(complete, keys.sign)!.picks].sort(),
    );
    expect((r.body.code as string).split("~")).toHaveLength(11);
    const clubs = r.body.clubs as Record<string, { nameLatin: string }>;
    expect(clubs["club-a"].nameLatin).toBe("Club A");
    expect(r.headers?.["Cache-Control"]).toBeUndefined(); // toResponse's private default
  });

  it("the answer's code is the canonical code of the rated squad", async () => {
    const r = await play(complete);
    const state = readDraft(complete, keys.sign)!;
    expect(r.body.code).toBe(canonicalXi(rateXi(data, drafted(ctx, state)!)));
  });

  it("an incomplete draft is refused (422); a forged one (403)", async () => {
    expect((await play(partial)).status).toBe(422);
    const at = (i: number) => (complete.at(i) === "A" ? "B" : "A");
    expect((await play(complete.slice(0, -2) + at(-2) + at(-1))).status).toBe(
      403,
    );
    expect((await handlePlay(deps, "{", ctx0)).status).toBe(400);
    expect((await handlePlay(deps, "{}", ctx0)).status).toBe(400);
  });

  it("a draft older than 24 hours is refused (409 expired)", async () => {
    const later = { ...deps, now: new Date(now.getTime() + 86_400_001) };
    const r = await play(complete, later);
    expect([r.status, r.body]).toEqual([409, { error: "expired" }]);
  });

  it("the server never reads a record from the body: extra fields are ignored", async () => {
    const r = await handlePlay(
      deps,
      JSON.stringify({ token: complete, season: { w: 30 } }),
      ctx0,
    );
    expect(r.body.season).toEqual(expected);
  });

  it("the same draft token cannot be played twice", async () => {
    const kv = fakeKv();
    await play(complete, { ...deps, kv });
    const again = await play(complete, { ...deps, kv });
    expect([again.status, again.body]).toEqual([
      409,
      { error: "already-played" },
    ]);
    const id = readDraft(complete, keys.sign)!.id;
    expect(kv.ttl(playedKey("local", id))).toBe(86_400);
  });

  it("with Redis on: the first season of the day is recorded, enters the board and sets the cookie", async () => {
    const kv = fakeKv();
    const r = await play(complete, { ...deps, kv });
    expect(r.body).toMatchObject({
      store: "server",
      board: { counted: true, rank: 0 },
    });
    expect(r.setCookie?.options.path).toBe("/api");
    expect(await kv.ztop(boardKey("local", "2026-10-07"), 5)).toEqual([
      { member: r.body.code, score: expect.any(Number) },
    ]);
  });

  it("a known visitor gets no new cookie", async () => {
    const kv = fakeKv();
    const r = await play(
      complete,
      { ...deps, kv },
      { cookie: `kora_v=${ID}`, ip: null },
    );
    expect(r.body.store).toBe("server");
    expect(r.setCookie).toBeUndefined();
  });

  it("a second season the same day is not recorded (counted: false)", async () => {
    const kv = fakeKv();
    const cookie = `kora_v=${ID}`;
    await play(complete, { ...deps, kv }, { cookie, ip: null });
    const again = await play(other, { ...deps, kv }, { cookie, ip: null });
    expect(again.status).toBe(200);
    expect(again.body.board).toEqual({ counted: false, rank: null });
    expect(await kv.ztop(boardKey("local", "2026-10-07"), 5)).toHaveLength(1);
  });

  it("with Redis off: store device, no cookie, board not counted", async () => {
    const r = await play(complete);
    expect(r.body).toMatchObject({
      store: "device",
      board: { counted: false, rank: null },
    });
    expect(r.setCookie).toBeUndefined();
  });

  it("with Redis failing: the season still returns", async () => {
    const r = await play(
      complete,
      { ...deps, kv: failingKv },
      { cookie: null, ip: "1.2.3.4" },
    );
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      store: "device",
      board: { counted: false, rank: null },
      season: expected,
    });
    expect(r.setCookie).toBeUndefined();
    const half = fakeKv();
    half.failOn.add("hsetnxEx");
    const h = await play(complete, { ...deps, kv: half });
    expect(h.body).toMatchObject({
      store: "device",
      board: { counted: false },
    });
    expect(h.setCookie).toBeUndefined();
  });

  it("plays count in the season rate limit", async () => {
    const kv = fakeKv();
    const d = { ...deps, kv };
    const c = { cookie: null, ip: "1.2.3.4" };
    for (let k = 0; k < 80; k++)
      expect((await play(complete, d, c)).status).toBe(k === 0 ? 200 : 409);
    const refused = await play(complete, d, c);
    expect(refused.status).toBe(429);
    expect(refused.headers?.["Retry-After"]).toMatch(/^\d+$/);
  });
});
