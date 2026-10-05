import * as crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { MAX_TOKEN_LENGTH, readToken, signToken, tokenKey } from "./token.ts";
import type { GameState } from "./token.ts";

vi.mock("node:crypto", async (original) => {
  const actual = await original<typeof import("node:crypto")>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

// Test seeds, never the real one.
const key = tokenKey("test-seed-not-the-real-one");
const state: GameState = {
  n: 12,
  d: "2026-10-16",
  g: ["youssef-msakni", "ellyes-skhiri"],
};

describe("the game token", () => {
  it("a token round-trips", () => {
    const token = signToken(state, key);
    expect(token).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(readToken(token, key)).toEqual(state);
    expect(readToken(signToken({ ...state, g: [] }, key), key)).toEqual({
      ...state,
      g: [],
    });
  });

  it("a changed payload or signature is refused", () => {
    const [v, payload, sig] = signToken(state, key).split(".");
    const other = Buffer.from(
      JSON.stringify({ ...state, g: ["youssef-msakni"] }),
    ).toString("base64url");
    expect(readToken(`${v}.${other}.${sig}`, key)).toBeNull();
    const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    expect(readToken(`${v}.${payload}.${flipped}`, key)).toBeNull();
    expect(readToken(`${v}.${payload}.`, key)).toBeNull();
    expect(readToken(`${v}.${payload}`, key)).toBeNull();
    expect(readToken("", key)).toBeNull();
    expect(readToken("not a token", key)).toBeNull();
  });

  it("a token signed with another seed is refused", () => {
    const token = signToken(state, tokenKey("another-test-seed"));
    expect(readToken(token, key)).toBeNull();
  });

  it("a token longer than 1,024 characters is refused", () => {
    const long = {
      ...state,
      g: Array.from({ length: 8 }, () => "x".repeat(100)),
    };
    const token = signToken(long, key);
    expect(token.length).toBeGreaterThan(MAX_TOKEN_LENGTH);
    expect(MAX_TOKEN_LENGTH).toBe(1024);
    expect(readToken(token, key)).toBeNull();
  });

  it("comparison is constant time", () => {
    const spy = vi.mocked(crypto.timingSafeEqual);
    spy.mockClear();
    readToken(signToken(state, key), key);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("version other than 1 is refused", () => {
    const [, payload, sig] = signToken(state, key).split(".");
    expect(readToken(`v2.${payload}.${sig}`, key)).toBeNull();
  });

  it("a well-signed payload of the wrong shape is refused", () => {
    // Signed with the right key: only the shape check stands in the way.
    const forge = (body: unknown) => {
      const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
      const sig = crypto
        .createHmac("sha256", key)
        .update(`v1.${payload}`)
        .digest("base64url");
      return `v1.${payload}.${sig}`;
    };
    expect(readToken(forge(state), key)).toEqual(state);
    for (const bad of [
      null,
      [],
      { ...state, n: "12" },
      { ...state, n: 1.5 },
      { ...state, d: "16/10/2026" },
      { ...state, g: "youssef-msakni" },
      { ...state, g: [1] },
      { ...state, g: Array.from({ length: 9 }, (_, i) => `f-${i}`) },
    ])
      expect(readToken(forge(bad), key)).toBeNull();
  });

  it("the token carries nothing but the number, the day and the guesses", () => {
    const [, payload] = signToken(state, key).split(".");
    expect(
      Object.keys(JSON.parse(Buffer.from(payload, "base64url").toString())),
    ).toEqual(["n", "d", "g"]);
  });
});
