import * as crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { draftKeys, readDraft, signDraft } from "./token.ts";
import type { DraftToken } from "./token.ts";

vi.mock("node:crypto", async (original) => {
  const actual = await original<typeof import("node:crypto")>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

// Test seeds, never the real one.
const key = draftKeys("test-seed-not-the-real-one").sign;
const state: DraftToken = {
  id: "abcdefghijklmnop",
  picks: ["aymen-mathlouthi", "ali-maaloul"],
  respin: 1,
  t: 1_791_000_000_000,
};

describe("the draft token", () => {
  it("a token round-trips", () => {
    const token = signDraft(state, key);
    expect(token).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(readDraft(token, key)).toEqual(state);
    const fresh = { ...state, picks: [], respin: null };
    expect(readDraft(signDraft(fresh, key), key)).toEqual(fresh);
  });

  it("a changed payload or signature is refused", () => {
    const [v, payload, sig] = signDraft(state, key).split(".");
    const other = Buffer.from(
      JSON.stringify({ ...state, picks: ["aymen-mathlouthi"] }),
    ).toString("base64url");
    expect(readDraft(`${v}.${other}.${sig}`, key)).toBeNull();
    const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    expect(readDraft(`${v}.${payload}.${flipped}`, key)).toBeNull();
    expect(readDraft(`${v}.${payload}.`, key)).toBeNull();
    expect(readDraft(`${v}.${payload}`, key)).toBeNull();
    expect(readDraft("", key)).toBeNull();
    expect(readDraft("not a token", key)).toBeNull();
  });

  it("a token signed with another seed is refused", () => {
    const token = signDraft(state, draftKeys("another-test-seed").sign);
    expect(readDraft(token, key)).toBeNull();
  });

  it("a token longer than 2,048 characters is refused", () => {
    const long = {
      ...state,
      picks: Array.from({ length: 11 }, () => "x".repeat(150)),
    };
    const token = signDraft(long, key);
    expect(token.length).toBeGreaterThan(2048);
    expect(readDraft(token, key)).toBeNull();
  });

  it("comparison is constant time", () => {
    const spy = vi.mocked(crypto.timingSafeEqual);
    spy.mockClear();
    readDraft(signDraft(state, key), key);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("a version other than v1 is refused", () => {
    const [, payload, sig] = signDraft(state, key).split(".");
    expect(readDraft(`v2.${payload}.${sig}`, key)).toBeNull();
  });

  it("a well-signed payload of the wrong shape is refused", () => {
    const forge = (body: unknown) => {
      const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
      const sig = crypto
        .createHmac("sha256", key)
        .update(`v1.${payload}`)
        .digest("base64url");
      return `v1.${payload}.${sig}`;
    };
    expect(readDraft(forge(state), key)).toEqual(state);
    for (const bad of [
      null,
      [],
      { ...state, id: "" },
      { ...state, picks: "ali-maaloul" },
      { ...state, picks: [1] },
      { ...state, respin: "1" },
      { ...state, respin: -1 },
      { ...state, t: "now" },
    ])
      expect(readDraft(forge(bad), key)).toBeNull();
  });

  it("the signing and spin keys differ by seed and from each other", () => {
    const a = draftKeys("test-seed-not-the-real-one");
    const b = draftKeys("another-test-seed");
    expect(a.sign.equals(b.sign)).toBe(false);
    expect(a.spin).not.toBe(b.spin);
    expect(a.spin).not.toBe(a.sign.toString("hex"));
  });
});
