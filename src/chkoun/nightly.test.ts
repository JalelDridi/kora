import { beforeEach, describe, expect, it } from "vitest";
import { FakeKv } from "./kv.ts";
import { JOB_TTL_SECONDS, readNightly, runNightly } from "./nightly.ts";

// A test secret, never the real one.
const secret = "test-cron-secret-0123456789";
const now = new Date("2026-10-20T02:40:00Z");

let kv: FakeKv;
let calls: string[];
beforeEach(() => {
  kv = new FakeKv();
  calls = [];
});

const run = (over: Partial<Parameters<typeof runNightly>[0]> = {}) =>
  runNightly({
    authorization: `Bearer ${secret}`,
    secret,
    kv,
    env: "test",
    now,
    copy: async () => {
      calls.push("copy");
      return { copied: 3, already: 1, skipped: 0, notes: [] };
    },
    topUp: async () => {
      calls.push("topUp");
      return { written: 1, filled: 30, window: 44 };
    },
    describe: (error) => (error as { code?: string }).code ?? "Error",
    ...over,
  });

describe("the nightly cron job", () => {
  it("no CRON_SECRET set → 503", async () => {
    for (const unset of [undefined, ""])
      expect(await run({ secret: unset })).toMatchObject({ status: 503 });
    expect(calls).toEqual([]);
  });

  it("wrong or missing bearer → 401, and nothing runs", async () => {
    for (const authorization of [
      null,
      "",
      secret,
      `Bearer ${secret}x`,
      `Bearer ${secret.slice(0, -1)}`,
      `Basic ${secret}`,
    ])
      expect(await run({ authorization })).toEqual({
        status: 401,
        body: { ok: false, error: "unauthorized" },
      });
    expect(calls).toEqual([]);
    expect(kv.commands).toEqual([]);
  });

  it("right bearer → runs copy then top-up, stores job:nightly, returns counts", async () => {
    const r = await run();
    expect(calls).toEqual(["copy", "topUp"]);
    const job = {
      at: "2026-10-20T02:40:00.000Z",
      ok: true,
      copied: 3,
      skipped: 0,
      written: 1,
      filled: 30,
      window: 44,
      notes: [],
    };
    expect(r).toEqual({ status: 200, body: job });
    expect(await readNightly(kv, "test")).toEqual(job);
    expect(kv.ttl("kora:test:chkoun:job:nightly")).toBe(JOB_TTL_SECONDS);
  });

  it("a failed copy still runs the top-up and answers 500 with both outcomes", async () => {
    const r = await run({
      copy: async () => {
        calls.push("copy");
        throw Object.assign(new Error("secret detail"), { code: "ECONNRESET" });
      },
    });
    expect(calls).toEqual(["copy", "topUp"]);
    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({
      ok: false,
      copied: null,
      written: 1,
      notes: ["copy failed (ECONNRESET)"],
    });
    expect(JSON.stringify(r.body)).not.toContain("secret detail");
    expect((await readNightly(kv, "test"))?.ok).toBe(false);
  });

  it("with Redis off the job runs and keeps nothing", async () => {
    const r = await run({ kv: null });
    expect(r.status).toBe(200);
    expect(calls).toEqual(["copy", "topUp"]);
  });
});
