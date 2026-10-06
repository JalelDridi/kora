import { beforeEach, describe, expect, it } from "vitest";
import { FakeKv } from "./kv.ts";
import {
  parseEntry,
  readToday,
  recordFinish,
  RESULT_TTL_SECONDS,
  STATS_TTL_SECONDS,
} from "./store.ts";

const visitorId = "4b5c0f3e-2d1a-4c8e-9f7b-1a2b3c4d5e6f";
const day = "2026-10-16";
const won = {
  day,
  n: 12,
  visitorId,
  solved: true,
  guesses: 2,
  grid: ["xxaxgx", "gggggg"],
};

let kv: FakeKv;
/** Every key with its value (hashes as entries) and expiry. */
const snapshot = () =>
  JSON.stringify([...kv.entries], (_, v) => (v instanceof Map ? [...v] : v));
beforeEach(() => {
  kv = new FakeKv();
});

describe("recordFinish", () => {
  it("recordFinish writes the day's hash once (HSETNX), sets 8 days of life, updates stats", async () => {
    const stats = await recordFinish(kv, "test", won);
    expect(stats).toMatchObject({ last: 12, streak: 1, played: 1, won: 1 });
    // The hash and its expiry go in one transaction.
    expect(kv.commands.filter((c) => c.startsWith("hsetnx"))).toEqual([
      "hsetnxEx kora:test:chkoun:r:2026-10-16",
    ]);
    expect(kv.commands.some((c) => c.startsWith("expire"))).toBe(false);
    expect(RESULT_TTL_SECONDS).toBe(8 * 86_400);
    expect(kv.ttl("kora:test:chkoun:r:2026-10-16")).toBe(691_200);
    expect(STATS_TTL_SECONDS).toBe(34_128_000);
    expect(kv.ttl(`kora:test:chkoun:s:${visitorId}`)).toBe(34_128_000);
    expect(
      parseEntry((await kv.hget("kora:test:chkoun:r:2026-10-16", visitorId))!),
    ).toEqual({ solved: true, guesses: 2, grid: ["xxaxgx", "gggggg"] });
  });

  it("a second recordFinish for the same visitor and day returns the stored stats and changes nothing", async () => {
    const first = await recordFinish(kv, "test", won);
    const before = snapshot();
    const again = await recordFinish(kv, "test", {
      ...won,
      solved: false,
      guesses: 8,
      grid: Array(8).fill("xxxxxx"),
    });
    expect(again).toEqual(first);
    expect(snapshot()).toBe(before);
  });

  it("the next day's win continues the streak", async () => {
    await recordFinish(kv, "test", won);
    const next = await recordFinish(kv, "test", {
      ...won,
      day: "2026-10-17",
      n: 13,
    });
    expect(next).toMatchObject({ streak: 2, best: 2, played: 2 });
  });

  it("a failed record write keeps the hash's expiry, and a replay counts the stored game", async () => {
    kv.failOn.add("set");
    expect(await recordFinish(kv, "test", won)).toBe("unavailable");
    expect(kv.ttl("kora:test:chkoun:r:2026-10-16")).toBe(691_200);
    expect(kv.ttl(`kora:test:chkoun:s:${visitorId}`)).toBeUndefined();
    kv.failOn.clear();
    // The replay is a loss; the first finish (a win) is what counts.
    const again = await recordFinish(kv, "test", {
      ...won,
      solved: false,
      guesses: 8,
      grid: Array(8).fill("xxxxxx"),
    });
    expect(again).toMatchObject({ last: 12, streak: 1, played: 1, won: 1 });
    expect(kv.ttl(`kora:test:chkoun:s:${visitorId}`)).toBe(34_128_000);
  });

  it("a day the record missed is folded in by the next day's finish, so the streak does not skip it", async () => {
    await recordFinish(kv, "test", { ...won, day: "2026-10-15", n: 11 });
    kv.failOn.add("set");
    expect(await recordFinish(kv, "test", won)).toBe("unavailable");
    kv.failOn.clear();
    const next = await recordFinish(kv, "test", {
      ...won,
      day: "2026-10-17",
      n: 13,
    });
    expect(next).toMatchObject({ last: 13, streak: 3, best: 3, played: 3 });
  });

  it("an unreadable stored game leaves the record as it is on a replay", async () => {
    await kv.hsetnx("kora:test:chkoun:r:2026-10-16", visitorId, "{broken");
    expect(await recordFinish(kv, "test", won)).toMatchObject({
      last: 12,
      played: 1,
    });
  });

  it("keys start with kora:{env}:", async () => {
    await recordFinish(kv, "preview", won);
    for (const key of kv.entries.keys())
      expect(key.startsWith("kora:preview:chkoun:")).toBe(true);
  });

  it('a Redis error is reported as "unavailable", never thrown to the visitor', async () => {
    kv.failing = true;
    await expect(recordFinish(kv, "test", won)).resolves.toBe("unavailable");
    await expect(readToday(kv, "test", day, visitorId)).resolves.toBe(
      "unavailable",
    );
  });
});

describe("readToday", () => {
  it("readToday returns the visitor's finished game and stats", async () => {
    const stats = await recordFinish(kv, "test", won);
    expect(await readToday(kv, "test", day, visitorId)).toEqual({
      finished: { solved: true, guesses: 2, grid: ["xxaxgx", "gggggg"] },
      stats,
    });
  });

  it("a visitor who has not finished today has no game, but keeps his stats", async () => {
    const stats = await recordFinish(kv, "test", won);
    expect(await readToday(kv, "test", "2026-10-17", visitorId)).toEqual({
      finished: null,
      stats,
    });
    expect(
      await readToday(kv, "test", day, "00000000-0000-4000-8000-000000000000"),
    ).toEqual({ finished: null, stats: null });
  });
});

describe("parseEntry", () => {
  it("refuses anything that is not a finished game", () => {
    for (const bad of [
      "",
      "{",
      "null",
      '{"s":2,"k":1,"grid":["gggggg"]}',
      '{"s":1,"k":0,"grid":[]}',
      '{"s":1,"k":9,"grid":[]}',
      '{"s":1,"k":2,"grid":["gggggg"]}',
      '{"s":1,"k":1,"grid":["ggg"]}',
      '{"s":1,"k":1,"grid":["gggggz"]}',
    ])
      expect(parseEntry(bad)).toBeNull();
  });
});
