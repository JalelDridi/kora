import { beforeAll, describe, expect, it } from "vitest";
import { FakeKv } from "@/chkoun/kv.ts";
import { FORMATION } from "@/engine/season/draft.ts";
import { handleDraft } from "./draft.ts";
import type { SeasonDeps } from "./draft.ts";
import { TEST_SEED, testData } from "./test-data.ts";
import { draftKeys, signDraft } from "./token.ts";
import type { CandidateView, SpinView } from "./views.ts";

const data = testData;
const seed = TEST_SEED;
const now = new Date("2026-10-20T10:00:00Z");
const deps: SeasonDeps = {
  now,
  data,
  kv: null,
  env: "test",
  seed,
  secureCookie: false,
};

type Body = {
  token: string;
  status: string;
  spin: SpinView;
  squad: CandidateView[];
  respinLeft: boolean;
  error?: string;
};
const post = async (body: unknown, d: SeasonDeps = deps) => {
  const r = await handleDraft(d, JSON.stringify(body), { ip: "1.2.3.4" });
  return { ...r, body: r.body as Body };
};
const first = (r: { body: Body }) => r.body.spin.candidates[0].id;

let draftToken: string;
let draftPick: string;
beforeAll(async () => {
  const r = await post({ action: "start" });
  draftToken = r.body.token;
  draftPick = first(r);
});

describe("POST /api/season/draft", () => {
  it("start returns slot 0, a goalkeeper spin, up to 5 candidates with ratings and inputs", async () => {
    const r = await handleDraft(deps, JSON.stringify({ action: "start" }), {
      ip: null,
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      status: "drafting",
      respinLeft: true,
      spin: { slot: 0, line: "goalkeeper" },
      squad: [],
    });
    const spin = r.body.spin as SpinView;
    expect(spin.candidates.length).toBeGreaterThan(0);
    expect(spin.candidates.length).toBeLessThanOrEqual(5);
    for (const c of spin.candidates) {
      expect(c.rating).toEqual(expect.any(Number));
      expect(c.inputs.line).toBe("goalkeeper");
      expect(c.names.nameLatin).toBe(c.id.toUpperCase());
      expect(c.doubt).toBe(false);
    }
    expect(spin.club.id).toMatch(/^club-[ab]$/);
    expect(typeof spin.widened).toBe("boolean");
  });

  it("eleven picks complete the draft; the squad follows the formation", async () => {
    let r = await post({ action: "start" });
    for (let k = 0; k < 11; k++)
      r = await post({ action: "pick", token: r.body.token, pick: first(r) });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("complete");
    expect(r.body.spin).toBeUndefined();
    expect(r.body.squad.map((c) => c.inputs.line)).toEqual([...FORMATION]);
    expect(new Set(r.body.squad.map((c) => c.id)).size).toBe(11);
  });

  it("a re-spin moves the current slot and is used up", async () => {
    const start = await post({ action: "start" });
    const r = await post({ action: "respin", token: start.body.token });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      status: "drafting",
      respinLeft: false,
      spin: { slot: 0, line: "goalkeeper" },
    });
  });

  it("a pick not offered is refused", async () => {
    const r = await post({
      action: "pick",
      token: draftToken,
      pick: "not-offered",
    });
    expect(r.status).toBe(422);
    expect(r.body).toEqual({ error: "refused" });
    // A real footballer of another line, at the goalkeeper's slot.
    const defender = [...data.people.values()].find(
      (p) => p.line === "defender" && data.combos.has(p.id),
    );
    expect(defender).toBeDefined();
    const other = await post({
      action: "pick",
      token: draftToken,
      pick: defender!.id,
    });
    expect(other.status).toBe(422);
    expect(other.body).toEqual({ error: "refused" });
  });

  it("a second re-spin is refused", async () => {
    const once = await post({ action: "respin", token: draftToken });
    expect(once.status).toBe(200);
    const twice = await post({ action: "respin", token: once.body.token });
    expect(twice.status).toBe(422);
    expect(twice.body).toEqual({ error: "refused" });
  });

  it("a forged token is refused", async () => {
    const at = (i: number) => (draftToken.at(i) === "A" ? "B" : "A");
    const forged = draftToken.slice(0, -2) + at(-2) + at(-1);
    const r = await post({ action: "pick", token: forged, pick: draftPick });
    expect(r.status).toBe(403);
  });

  it("a token older than 24 hours is refused", async () => {
    const later = { ...deps, now: new Date(now.getTime() + 86_400_001) };
    const r = await post(
      { action: "pick", token: draftToken, pick: draftPick },
      later,
    );
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: "expired" });
    const inTime = { ...deps, now: new Date(now.getTime() + 86_400_000) };
    expect(
      (
        await post(
          { action: "pick", token: draftToken, pick: draftPick },
          inTime,
        )
      ).status,
    ).toBe(200);
  });

  it("starts are limited to 80 per 10 minutes with Redis on; picks are not counted", async () => {
    const kv = new FakeKv();
    kv.nowMs = now.getTime();
    const d = { ...deps, kv };
    for (let k = 0; k < 80; k++)
      expect((await post({ action: "start" }, d)).status).toBe(200);
    const refused = await post({ action: "start" }, d);
    expect(refused.status).toBe(429);
    expect(refused.body).toMatchObject({ error: "tooMany" });
    expect(refused.headers?.["Retry-After"]).toMatch(/^\d+$/);
    const before = kv.commands.length;
    expect(
      (await post({ action: "pick", token: draftToken, pick: draftPick }, d))
        .status,
    ).toBe(200);
    expect(kv.commands.length).toBe(before);
    expect(
      kv.commands.every((c) => c.startsWith("incrEx kora:test:season:rl:")),
    ).toBe(true);
  });

  it("with Redis off there is no limit", async () => {
    for (let k = 0; k < 81; k++)
      expect((await post({ action: "start" })).status).toBe(200);
  });

  it("a body over 2 KB or not JSON is refused", async () => {
    const bad = async (raw: string) =>
      (await handleDraft(deps, raw, { ip: null })).status;
    expect(await bad("{")).toBe(400);
    expect(
      await bad(JSON.stringify({ action: "start", pad: "x".repeat(2100) })),
    ).toBe(400);
    expect(await bad(JSON.stringify({ action: "dance" }))).toBe(400);
    expect(
      await bad(JSON.stringify({ action: "pick", token: draftToken })),
    ).toBe(400);
  });

  it("a token carrying more than 11 picks is refused (400), with no Redis command", async () => {
    const kv = new FakeKv();
    const picks = Array.from({ length: 12 }, (_, i) => `f-${i}`);
    const token = signDraft(
      { id: "twelve", picks, respin: null, t: now.getTime() },
      draftKeys(seed).sign,
    );
    const r = await post(
      { action: "pick", token, pick: draftPick },
      { ...deps, kv },
    );
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "refused" });
    expect(kv.commands).toEqual([]);
  });
});
