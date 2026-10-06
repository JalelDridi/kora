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
          exec: async () => {
            calls.push(["exec", ...parts]);
            return parts[0] === "incr" ? [3, 1] : [0, 1];
          },
        };
        return tx;
      },
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
});
