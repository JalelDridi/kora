import { beforeAll, describe, expect, it } from "vitest";
import type { SeasonDeps } from "./draft.ts";
import { handlePlay } from "./play.ts";
import { decodeXi, handleReplay } from "./replay.ts";
import { draftToken, TEST_SEED, testData as data } from "./test-data.ts";

const deps: SeasonDeps = {
  now: new Date("2026-10-07T10:00:00Z"),
  data,
  kv: null,
  env: "local",
  seed: TEST_SEED,
  secureCookie: false,
};
const d = { now: deps.now, data };

let played: Awaited<ReturnType<typeof handlePlay>>;
let CODE: string;
let q: { d: string | null; xi: string | null };
beforeAll(async () => {
  const complete = await draftToken(deps, 11);
  played = await handlePlay(deps, JSON.stringify({ token: complete }), {
    cookie: null,
    ip: null,
  });
  CODE = played.body.code as string;
  q = { d: "2026-10-07", xi: CODE };
});

describe("GET /api/season/replay", () => {
  it("a shared code replays the same season as the play endpoint gave", () => {
    const r = handleReplay(d, q);
    expect(r.status).toBe(200);
    expect(r.body.season).toEqual(played.body.season);
    expect(r.body.squad).toEqual(played.body.squad);
    expect(r.body.clubs).toEqual(played.body.clubs);
    expect(r.body).toMatchObject({ day: "2026-10-07", code: CODE });
  });

  it("a code with a wrong line, a repeat, an unknown footballer or 10 slots is refused (400)", () => {
    const c = CODE.split("~");
    for (const bad of [
      [c[1], ...c.slice(1)],
      [c[1], c[1], ...c.slice(2)],
      ["nobody_0", ...c.slice(1)],
      c.slice(1),
      [`${c[0]}.x`, ...c.slice(1)],
      [...c, c[10]],
    ])
      expect(handleReplay(d, { ...q, xi: bad.join("~") }).status).toBe(400);
    expect(handleReplay(d, { ...q, xi: null }).status).toBe(400);
    expect(decodeXi(data, `${c[0]}.x~${c.slice(1).join("~")}`)).toBeNull();
  });

  it("a day not written YYYY-MM-DD is refused (400)", () => {
    for (const bad of [null, "2026-10-7", "20261007", "2026-13-01", "x"])
      expect(handleReplay(d, { ...q, d: bad }).status).toBe(400);
  });

  it("a future day is not found (404); a past day replays (200)", () =>
    expect([
      handleReplay(d, { ...q, d: "2026-10-08" }).status,
      handleReplay(d, { ...q, d: "2026-10-01" }).status,
    ]).toEqual([404, 200]));

  it("the answer is public and cached a day at the CDN", () =>
    expect(handleReplay(d, q).headers?.["Cache-Control"]).toBe(
      "public, s-maxage=86400, stale-while-revalidate=3600",
    ));
});
