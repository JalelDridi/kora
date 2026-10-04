import { afterEach, describe, expect, it, vi } from "vitest";
import { checkRedis, getRedis } from "./redis";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getRedis", () => {
  it("is null when Upstash is not configured", () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");

    expect(getRedis()).toBeNull();
  });

  it("is null when only one of the two values is set", () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");

    expect(getRedis()).toBeNull();
  });

  it("is a client when both values are set", () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");

    expect(getRedis()).not.toBeNull();
  });
});

describe("checkRedis", () => {
  it("is off without a client", async () => {
    expect(await checkRedis(null)).toBe("off");
  });

  it("is ok when the server answers PONG", async () => {
    expect(await checkRedis({ ping: async () => "PONG" })).toBe("ok");
  });

  it("is unreachable when the call fails", async () => {
    const ping = async () => {
      throw new Error("fetch failed");
    };

    expect(await checkRedis({ ping })).toBe("unreachable");
  });

  it("is unreachable on an unexpected answer", async () => {
    expect(await checkRedis({ ping: async () => "" })).toBe("unreachable");
  });
});
