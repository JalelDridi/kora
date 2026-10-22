import type { Redis } from "@upstash/redis";
import { describe, expect, it } from "vitest";
import { chkounKey, FakeKv, seasonKey, upstashKv } from "./kv.ts";

describe("the Upstash adapter", () => {
  it("returns text whatever the client parsed, and passes the options on", async () => {
    const calls: unknown[][] = [];
    // Upstash's client parses JSON it reads back; the adapter undoes that.
    const redis = {
      get: async () => ({ streak: 2 }),
      hget: async () => 1234,
      hgetall: async () => ({ a: { s: 1 }, b: "text", c: null }),
      set: async (...args: unknown[]) => {
        calls.push(args);
        return args[2] && (args[2] as { nx?: boolean }).nx ? null : "OK";
      },
      multi: () => {
        const parts: string[] = [];
        const tx = {
          hsetnx: (...args: unknown[]) => (
            parts.push("hsetnx"),
            calls.push(args),
            tx
          ),
          incr: (...args: unknown[]) => (
            parts.push("incr"),
            calls.push(args),
            tx
          ),
          expire: (...args: unknown[]) => (
            parts.push("expire"),
            calls.push(args),
            tx
          ),
          zadd: (...args: unknown[]) => (
            parts.push("zadd"),
            calls.push(args),
            tx
          ),
          zremrangebyrank: (...args: unknown[]) => (
            parts.push("zremrangebyrank"),
            calls.push(args),
            tx
          ),
          zrevrank: (...args: unknown[]) => (
            parts.push("zrevrank"),
            calls.push(args),
            tx
          ),
          exec: async () => {
            calls.push(["exec", ...parts]);
            if (parts[0] === "zadd") return [1, 0, 1, 4];
            return parts[0] === "incr" ? [3, 1] : [0, 1];
          },
        };
        return tx;
      },
      // Upstash parses what it reads back: a numeric member comes back a number.
      zrange: async (...args: unknown[]) => (
        calls.push(["zrange", ...args]),
        ["b", "9", 42, 5]
      ),
      del: async () => 1,
    } as unknown as Redis;
    const kv = upstashKv(redis);
    expect(await kv.get("k")).toBe('{"streak":2}');
    expect(await kv.hget("k", "f")).toBe("1234");
    expect(await kv.hgetall("k")).toEqual({ a: '{"s":1}', b: "text" });
    expect(await kv.set("k", "v", { ex: 60 })).toBe(true);
    expect(await kv.set("k", "v", { ex: 60, nx: true })).toBe(false);
    expect(calls).toEqual([
      ["k", "v", { ex: 60 }],
      ["k", "v", { ex: 60, nx: true }],
    ]);
    calls.length = 0;
    expect(await kv.hsetnxEx("k", "f", "v", 9)).toBe(false);
    expect(await kv.incrEx("k", 7)).toBe(3);
    // Each write and its expiry go in one MULTI.
    expect(calls).toEqual([
      ["k", "f", "v"],
      ["k", 9],
      ["exec", "hsetnx", "expire"],
      ["k"],
      ["k", 7],
      ["exec", "incr", "expire"],
    ]);
    calls.length = 0;
    // ZADD, the trim, the expiry and the rank in one MULTI.
    expect(await kv.zaddTop("z", "m", 7, 100, 60)).toBe(4);
    expect(calls).toEqual([
      ["z", { score: 7, member: "m" }],
      ["z", 0, -101],
      ["z", 60],
      ["z", "m"],
      ["exec", "zadd", "zremrangebyrank", "expire", "zrevrank"],
    ]);
    calls.length = 0;
    expect(await kv.ztop("z", 2)).toEqual([
      { member: "b", score: 9 },
      { member: "42", score: 5 },
    ]);
    expect(calls).toEqual([
      ["zrange", "z", 0, 1, { rev: true, withScores: true }],
    ]);
    calls.length = 0;
    // n <= 0 asks for nothing (ZRANGE 0 -1 would be the whole set).
    expect(await kv.ztop("z", 0)).toEqual([]);
    expect(await kv.ztop("z", -1)).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("keys start with kora:{env}:chkoun:", () => {
    expect(chkounKey("production", "p:2026-10-16")).toBe(
      "kora:production:chkoun:p:2026-10-16",
    );
  });

  it("30–0 keys start with kora:{env}:season:", () => {
    expect(seasonKey("preview", "rl:abc:1")).toBe(
      "kora:preview:season:rl:abc:1",
    );
  });
});

describe("FakeKv", () => {
  it("expires keys on its own clock", async () => {
    const kv = new FakeKv();
    await kv.set("a", "1", { ex: 10 });
    await kv.incrEx("b", 5);
    kv.nowMs = 5_000;
    expect(await kv.get("b")).toBeNull();
    expect(await kv.get("a")).toBe("1");
    kv.nowMs = 10_000;
    expect(await kv.get("a")).toBeNull();
  });

  it("a failed transaction applies none of its parts", async () => {
    const kv = new FakeKv();
    kv.failOn.add("hsetnxEx");
    await expect(kv.hsetnxEx("h", "f", "v", 10)).rejects.toThrow();
    expect(kv.entries.size).toBe(0);
    kv.failOn.clear();
    expect(await kv.hsetnxEx("h", "f", "v", 10)).toBe(true);
    expect(kv.ttl("h")).toBe(10);
  });

  it("zaddTop keeps the best `keep` members and returns the rank from the top", async () => {
    const kv = new FakeKv();
    for (const [m, s] of [
      ["a", 3],
      ["b", 9],
      ["c", 5],
    ] as const)
      await kv.zaddTop("z", m, s, 2, 60);
    expect(await kv.ztop("z", 10)).toEqual([
      { member: "b", score: 9 },
      { member: "c", score: 5 },
    ]);
    expect(await kv.zaddTop("z", "d", 1, 2, 60)).toBeNull();
    expect(await kv.zaddTop("z", "e", 7, 2, 60)).toBe(1);
    expect(await kv.ztop("z", 1)).toEqual([{ member: "b", score: 9 }]);
  });

  it("ztop with n <= 0 answers no member", async () => {
    const kv = new FakeKv();
    await kv.zaddTop("z", "a", 3, 5, 60);
    await kv.zaddTop("z", "b", 4, 5, 60);
    expect(await kv.ztop("z", 0)).toEqual([]);
    expect(await kv.ztop("z", -1)).toEqual([]);
  });

  it("zaddTop updates a member's score instead of adding it twice", async () => {
    const kv = new FakeKv();
    await kv.zaddTop("z", "a", 3, 5, 60);
    await kv.zaddTop("z", "b", 4, 5, 60);
    expect(await kv.zaddTop("z", "a", 8, 5, 60)).toBe(0);
    expect(await kv.ztop("z", 10)).toEqual([
      { member: "a", score: 8 },
      { member: "b", score: 4 },
    ]);
  });

  it("the sorted set expires with the given seconds", async () => {
    const kv = new FakeKv();
    await kv.zaddTop("z", "a", 1, 2, 60);
    expect(kv.ttl("z")).toBe(60);
    kv.nowMs += 61_000;
    expect(await kv.ztop("z", 10)).toEqual([]);
  });

  it("a failed zaddTop writes nothing", async () => {
    const kv = new FakeKv();
    kv.failOn.add("zaddTop");
    await expect(kv.zaddTop("z", "a", 1, 2, 60)).rejects.toThrow();
    expect(kv.entries.size).toBe(0);
  });
});
