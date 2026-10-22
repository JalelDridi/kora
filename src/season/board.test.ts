import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakeKv } from "@/chkoun/kv.ts";
import {
  boardScore,
  canonicalXi,
  rateXi,
  simulateSeason,
} from "@/engine/season/simulate.ts";
import type { Season } from "@/engine/season/simulate.ts";
import { BOARD_SHOWN, handleBoard } from "./board.ts";
import type { BoardRow } from "./board.ts";
import type { SeasonDeps } from "./draft.ts";
import { handlePlay } from "./play.ts";
import { decodeXi } from "./replay.ts";
import { boardKey } from "./store.ts";
import { draftToken, TEST_SEED, testData as data } from "./test-data.ts";

const now = new Date("2026-10-07T10:00:00Z");
const day = "2026-10-07";
const seasonDeps: SeasonDeps = {
  now,
  data,
  kv: null,
  env: "local",
  seed: TEST_SEED,
  secureCookie: false,
};
const key = boardKey("local", day);

/** A complete draft's squad code, from the play endpoint (Redis off: nothing recorded). */
async function draftCode(choice: number): Promise<string> {
  const token = await draftToken(seasonDeps, 11, choice);
  const r = await handlePlay(seasonDeps, JSON.stringify({ token }), {
    cookie: null,
    ip: null,
  });
  return r.body.code as string;
}

const season = (code: string): Season =>
  simulateSeason({
    day,
    xi: rateXi(data, decodeXi(data, code)!),
    table: data.table,
  });

let code: string;
let codes25: string[];
beforeAll(async () => {
  code = await draftCode(0);
  // Distinct draft ids give distinct squads; dedupe by code in case two collide.
  const seen = new Set<string>();
  for (let i = 0; seen.size < 25 && i < 200; i++)
    seen.add(await draftCode(i % 3));
  codes25 = [...seen];
});

let kv: FakeKv;
let deps: Parameters<typeof handleBoard>[0];
beforeEach(() => {
  kv = new FakeKv();
  kv.nowMs = now.getTime();
  deps = { now, data, kv, env: "local" };
});

describe("GET /api/season/board", () => {
  it("made 25 different squads to rank", () => {
    expect(codes25).toHaveLength(25);
    expect(BOARD_SHOWN).toBe(20);
  });

  it("rows are re-simulated by the server, never read from Redis", async () => {
    await kv.zaddTop(key, code, 999_999_999, 50, 60); // a forged score
    const r = await handleBoard(deps);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ day, status: "on" });
    const row = (r.body.rows as BoardRow[])[0];
    const s = season(code);
    expect(row).toMatchObject({
      rank: 1,
      code,
      w: s.w,
      d: s.d,
      l: s.l,
      points: s.points,
      gf: s.gf,
      ga: s.ga,
      rating: s.rating,
    });
  });

  it("a row's squad is each footballer's id, names and line, in the code's order", async () => {
    await kv.zaddTop(key, code, 1, 50, 60);
    const row = ((await handleBoard(deps)).body.rows as BoardRow[])[0];
    const picks = decodeXi(data, code)!;
    expect(row.squad).toEqual(
      picks.map((c) => {
        const p = data.people.get(c.footballerId)!;
        return {
          id: c.footballerId,
          names: {
            nameLatin: p.nameLatin,
            nameArabic: p.nameArabic,
            nameFrench: p.nameFrench,
          },
          line: c.line,
        };
      }),
    );
  });

  it("rows are ordered by the server's boardScore and limited to 20", async () => {
    for (const c of codes25) await kv.zaddTop(key, c, 1, 50, 60); // the same forged score for all
    const rows = (await handleBoard(deps)).body.rows as BoardRow[];
    expect(rows).toHaveLength(20);
    const scores = rows.map((r) => boardScore(r as unknown as Season));
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(rows.map((r) => r.rank)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    const best = codes25
      .map((c) => ({ c, score: boardScore(season(c)) }))
      .sort((a, b) => b.score - a.score || (a.c < b.c ? -1 : a.c > b.c ? 1 : 0))
      .slice(0, 20)
      .map((e) => e.c);
    expect(rows.map((r) => r.code)).toEqual(best);
  });

  it("a member that no longer decodes, or is not canonical, is skipped", async () => {
    const c = code.split("~");
    const swapped = [c[0], c[2], c[1], ...c.slice(3)].join("~");
    await kv.zaddTop(key, "gone_0~x_1", 5, 50, 60);
    await kv.zaddTop(key, swapped, 4, 50, 60);
    await kv.zaddTop(key, code, 1, 50, 60);
    const r = await handleBoard(deps);
    expect(r.status).toBe(200);
    expect((r.body.rows as BoardRow[]).map((row) => row.code)).toEqual([code]);
    expect(canonicalXi(rateXi(data, decodeXi(data, swapped)!))).toBe(code);
  });

  it("an empty board is on, with no rows", async () =>
    expect((await handleBoard(deps)).body).toEqual({
      day,
      status: "on",
      rows: [],
    }));

  it("Redis off or failing: 200, status off, no rows", async () => {
    kv.failing = true;
    for (const r of [
      await handleBoard({ ...deps, kv: null }),
      await handleBoard(deps),
    ]) {
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ day, status: "off", rows: [] });
      expect(r.headers?.["Cache-Control"]).toBe(
        "public, s-maxage=30, stale-while-revalidate=30",
      );
    }
  });

  it("reads today's board in Tunis and writes nothing to Redis", async () => {
    await kv.zaddTop(key, code, 1, 50, 60);
    kv.commands.length = 0;
    // 23:30 UTC on the 6th is already the 7th in Tunis (UTC+1).
    const r = await handleBoard({
      ...deps,
      now: new Date("2026-10-06T23:30:00Z"),
    });
    expect(r.body.day).toBe(day);
    expect(kv.commands).toEqual([`ztop ${key}`]);
  });

  it("cached 30 s at the CDN (D-S3-10)", async () =>
    expect((await handleBoard(deps)).headers?.["Cache-Control"]).toBe(
      "public, s-maxage=30, stale-while-revalidate=30",
    ));
});
