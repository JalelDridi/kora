import { beforeEach, describe, expect, it } from "vitest";
import { FakeKv } from "./kv.ts";
import {
  allowGuess,
  GUESS_LIMIT,
  rateLimitSalt,
  WINDOW_SECONDS,
} from "./rate-limit.ts";

// Test values: a documentation address and a test seed.
const ip = "203.0.113.7";
const salt = rateLimitSalt("test-seed-not-the-real-one", "2026-10-16");
const at = (ms: number) => new Date(Date.UTC(2026, 9, 16, 10, 0, 0) + ms);

let kv: FakeKv;
beforeEach(() => {
  kv = new FakeKv();
});

async function guesses(n: number, when: Date, from = ip) {
  const out = [];
  for (let i = 0; i < n; i++)
    out.push(await allowGuess(kv, { ip: from, now: when, salt, env: "test" }));
  return out;
}

describe("the guess rate limit (N4)", () => {
  it("81st guess within 10 minutes is refused", async () => {
    expect(GUESS_LIMIT).toBe(80);
    expect(WINDOW_SECONDS).toBe(600);
    const first = await guesses(80, at(0));
    expect(first.every((r) => r.allowed)).toBe(true);
    const over = await allowGuess(kv, {
      ip,
      now: at(60_000),
      salt,
      env: "test",
    });
    expect(over.allowed).toBe(false);
    // Retry when the window ends: 10:10, nine minutes later.
    expect(over.retryAfter).toBe(540);
    // Another address is counted apart.
    expect((await guesses(1, at(0), "198.51.100.2"))[0].allowed).toBe(true);
  });

  it("a new window starts fresh", async () => {
    await guesses(81, at(0));
    expect((await guesses(1, at(600_000)))[0].allowed).toBe(true);
  });

  it("the key holds a hash, never the address", async () => {
    await guesses(1, at(0));
    const keys = [...kv.entries.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^kora:test:chkoun:rl:[0-9a-f]{16}:\d+$/);
    expect(keys[0]).not.toContain(ip);
    expect(keys[0]).not.toContain("203");
    // The counter lives 10 minutes.
    expect(kv.ttl(keys[0])).toBe(600);
  });

  it("the salt changes every day and depends on the seed", () => {
    const other = rateLimitSalt("test-seed-not-the-real-one", "2026-10-17");
    expect(other).not.toBe(salt);
    expect(rateLimitSalt("another-test-seed", "2026-10-16")).not.toBe(salt);
  });

  it("no Redis means no limit", async () => {
    for (let i = 0; i < 200; i++)
      expect(
        (await allowGuess(null, { ip, now: at(0), salt, env: "test" })).allowed,
      ).toBe(true);
  });

  it("a Redis error lets the guess through", async () => {
    kv.failing = true;
    expect((await guesses(1, at(0)))[0].allowed).toBe(true);
  });

  it("an unknown address is not limited", async () => {
    expect((await guesses(100, at(0), "")).every((r) => r.allowed)).toBe(true);
    expect(kv.entries.size).toBe(0);
  });
});
