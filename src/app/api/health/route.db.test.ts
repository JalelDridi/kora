import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_DATABASE_URL } from "@/db/testing";
import { GET } from "./route";

const globalForDb = globalThis as { db?: unknown };

beforeEach(() => {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete globalForDb.db;
});

describe("GET /api/health", () => {
  it("reports ok when the database answers, with Redis off", async () => {
    vi.stubEnv("DATABASE_URL", TEST_DATABASE_URL);
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abc123");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      database: "ok",
      redis: "off",
      commit: "abc123",
    });
    expect(Number.isNaN(Date.parse(body.time))).toBe(false);
  });

  it("reports degraded with 503 when the database is unreachable", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://nobody:x@127.0.0.1:1/none");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", undefined);

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      status: "degraded",
      database: "unreachable",
      commit: "local",
    });
  });
});
