import type { Redis } from "@upstash/redis";
import { describe, expect, it } from "vitest";
import { chkounKey, FakeKv, upstashKv } from "./kv.ts";

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
      hsetnx: async () => 0,
      expire: async () => 1,
      incr: async () => 3,
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
    expect(await kv.hsetnx("k", "f", "v")).toBe(false);
    expect(await kv.incr("k")).toBe(3);
  });

  it("keys start with kora:{env}:chkoun:", () => {
    expect(chkounKey("production", "p:2026-10-16")).toBe(
      "kora:production:chkoun:p:2026-10-16",
    );
  });
});

describe("FakeKv", () => {
  it("expires keys on its own clock", async () => {
    const kv = new FakeKv();
    await kv.set("a", "1", { ex: 10 });
    await kv.incr("b");
    await kv.expire("b", 5);
    kv.nowMs = 5_000;
    expect(await kv.get("b")).toBeNull();
    expect(await kv.get("a")).toBe("1");
    kv.nowMs = 10_000;
    expect(await kv.get("a")).toBeNull();
  });
});
