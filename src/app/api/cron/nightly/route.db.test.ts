import pg from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  createTestClient,
  resetDatabase,
  TEST_DATABASE_URL,
} from "@/db/testing";
import {
  eligible,
  syncFootballers,
} from "@/pipeline/__fixtures__/calendar-pool.ts";
import { GET } from "./route";

// The cron route wired to the local Postgres, Redis off. Test values for
// the secret and the seed, never the real ones.

const db = createTestClient(); // checks that the URL is local, first
const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
const secret = "test-cron-secret-0123456789";

beforeAll(async () => {
  await client.connect();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await client.end();
  await db.$disconnect();
});

beforeEach(async () => {
  vi.stubEnv("DATABASE_URL", TEST_DATABASE_URL);
  vi.stubEnv("DATABASE_URL_UNPOOLED", "");
  vi.stubEnv("CRON_SECRET", secret);
  vi.stubEnv("CHKOUN_SEED", "test-seed-not-the-real-one");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  await resetDatabase(db);
  await syncFootballers(
    { query: (text, values) => client.query(text, values) },
    eligible,
  );
});

const call = (authorization?: string) =>
  GET(
    new Request("http://localhost/api/cron/nightly", {
      headers: authorization ? { authorization } : {},
    }),
  );

const puzzles = async () =>
  Number(
    (await client.query("SELECT count(*)::int AS n FROM puzzles")).rows[0].n,
  );

describe("GET /api/cron/nightly", () => {
  it("a missing or wrong secret is refused with 401 and does nothing", async () => {
    for (const auth of [
      undefined,
      "Bearer wrong",
      `Bearer ${secret}x`,
      secret,
    ]) {
      const r = await call(auth);
      expect(r.status).toBe(401);
    }
    expect(await puzzles()).toBe(0);
  });

  it("without CRON_SECRET set: 503, nothing runs", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call(`Bearer ${secret}`)).status).toBe(503);
    expect(await puzzles()).toBe(0);
  });

  it("the right secret copies (nothing, Redis is off) and tops up the calendar", async () => {
    const r = await call(`Bearer ${secret}`);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    const body = await r.json();
    expect(body).toMatchObject({
      ok: true,
      copied: 0,
      skipped: 0,
      written: 30,
      filled: 30,
      window: 44,
      notes: ["Redis is off: nothing to copy"],
    });
    expect(await puzzles()).toBe(30);
    for (const p of eligible) expect(JSON.stringify(body)).not.toContain(p.id);
  });
});
