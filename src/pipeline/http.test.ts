import { describe, expect, it } from "vitest";
import {
  createPoliteClient,
  HttpError,
  retryDelayMs,
  StoppedError,
  USER_AGENT,
} from "./http.ts";

type Reply = {
  status: number;
  body?: string;
  headers?: Record<string, string>;
};

// A fake network and a fake clock: sleeping only moves time forward.
function harness(replies: Reply[]) {
  let time = 0;
  const starts: number[] = [];
  const sleeps: number[] = [];
  const agents: (string | null)[] = [];
  const client = createPoliteClient({
    minGapMs: 5_000,
    maxRetries: 2,
    now: () => time,
    sleep: async (ms) => {
      sleeps.push(ms);
      time += ms;
    },
    fetch: async (_url, init) => {
      starts.push(time);
      agents.push(new Headers(init?.headers).get("user-agent"));
      const reply = replies.shift();
      if (!reply) throw new Error("no more replies");
      return new Response(reply.body ?? "{}", {
        status: reply.status,
        headers: reply.headers,
      });
    },
  });
  return { client, starts, sleeps, agents };
}

// Timers that run side by side, as real ones do: concurrent sleepers wake
// at their own deadlines instead of adding up. `settle` drives the clock.
function timedHarness(replies: Reply[]) {
  let time = 0;
  const timers: { wake: number; resolve: () => void }[] = [];
  const starts: number[] = [];
  const client = createPoliteClient({
    minGapMs: 5_000,
    maxRetries: 2,
    now: () => time,
    sleep: (ms) =>
      new Promise<void>((resolve) => timers.push({ wake: time + ms, resolve })),
    fetch: async () => {
      starts.push(time);
      const reply = replies.shift();
      if (!reply) throw new Error("no more replies");
      return new Response(reply.body ?? "{}", { status: reply.status });
    },
  });
  async function settle<T>(work: Promise<T>): Promise<T> {
    let done = false;
    work.then(
      () => (done = true),
      () => (done = true),
    );
    for (;;) {
      await new Promise((r) => setImmediate(r));
      if (done || timers.length === 0) return work;
      timers.sort((a, b) => a.wake - b.wake);
      const next = timers.shift()!;
      time = Math.max(time, next.wake);
      next.resolve();
    }
  }
  return { client, starts, settle };
}

describe("createPoliteClient", () => {
  it("sends the User-Agent and keeps requests apart", async () => {
    const { client, starts, agents } = harness([
      { status: 200, body: '{"a":1}' },
      { status: 200, body: "plain" },
    ]);

    expect(await client.getJson("https://en.wikipedia.org/w/api.php")).toEqual({
      a: 1,
    });
    expect(await client.getText("https://en.wikipedia.org/w/api.php")).toBe(
      "plain",
    );
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(5_000);
    expect(agents).toEqual([USER_AGENT, USER_AGENT]);
  });

  it("keeps overlapping requests apart too", async () => {
    const { client, starts, settle } = timedHarness([
      { status: 200, body: "one" },
      { status: 200, body: "two" },
      { status: 200, body: "three" },
    ]);

    expect(
      await settle(
        Promise.all([
          client.getText("https://en.wikipedia.org/?batch=1"),
          client.getText("https://en.wikipedia.org/?batch=2"),
          client.getText("https://en.wikipedia.org/?batch=3"),
        ]),
      ),
    ).toEqual(["one", "two", "three"]);
    expect(starts).toHaveLength(3);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(5_000);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(5_000);
  });

  it("lets the next request run after one fails", async () => {
    const { client, starts, settle } = timedHarness([
      { status: 200, body: "first" },
      { status: 404 },
      { status: 200, body: "ok" },
    ]);

    const results = await settle(
      Promise.allSettled([
        client.getText("https://en.wikipedia.org/?first"),
        client.getText("https://en.wikipedia.org/?missing"),
        client.getText("https://en.wikipedia.org/?present"),
      ]),
    );
    expect(results.map((r) => r.status)).toEqual([
      "fulfilled",
      "rejected",
      "fulfilled",
    ]);
    expect(results[2]).toEqual({ status: "fulfilled", value: "ok" });
    expect(starts).toHaveLength(3);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(5_000);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(5_000);
  });

  it("waits as long as Retry-After asks on a 503, then succeeds", async () => {
    const { client, sleeps, starts } = harness([
      { status: 503, headers: { "Retry-After": "7" } },
      { status: 200, body: "ok" },
    ]);

    expect(await client.getText("https://en.wikipedia.org/")).toBe("ok");
    expect(sleeps).toContain(7_000);
    expect(starts).toEqual([0, 7_000]);
  });

  it("retries when MediaWiki reports replication lag", async () => {
    const { client } = harness([
      {
        status: 200,
        body: '{"error":{"code":"maxlag"}}',
        headers: { "MediaWiki-API-Error": "maxlag", "Retry-After": "5" },
      },
      { status: 200, body: '{"query":{}}' },
    ]);

    expect(await client.getJson("https://en.wikipedia.org/")).toEqual({
      query: {},
    });
  });

  it("gives up after the last retry", async () => {
    const { client, starts } = harness([
      { status: 503 },
      { status: 503 },
      { status: 503 },
    ]);

    await expect(
      client.getText("https://query.wikidata.org/sparql"),
    ).rejects.toMatchObject({
      status: 503,
    });
    expect(starts).toHaveLength(3);
  });

  it("does not retry a 404", async () => {
    const { client, starts } = harness([{ status: 404 }]);

    await expect(
      client.getText("https://en.wikipedia.org/"),
    ).rejects.toBeInstanceOf(HttpError);
    expect(starts).toHaveLength(1);
  });

  it("gives up rather than wait more than five minutes", async () => {
    const { client, starts } = harness([
      { status: 503, headers: { "Retry-After": "3600" } },
    ]);

    await expect(
      client.getText("https://en.wikipedia.org/"),
    ).rejects.toMatchObject({
      status: 503,
    });
    expect(starts).toHaveLength(1);
  });

  for (const status of [429, 403]) {
    it(`stops on a ${status}: no retry, and no request after it`, async () => {
      const { client, starts } = harness([
        { status, headers: { "Retry-After": "1" } },
        { status: 200, body: "ok" },
        { status: 200, body: "ok" },
      ]);

      const first = client.getText("https://en.wikipedia.org/?a");
      await expect(first).rejects.toBeInstanceOf(HttpError);
      await expect(first).rejects.toBeInstanceOf(StoppedError);
      await expect(first).rejects.toMatchObject({ status });
      expect(starts).toHaveLength(1);

      const later = client.getJson("https://en.wikipedia.org/?b");
      await expect(later).rejects.toBeInstanceOf(StoppedError);
      await expect(later).rejects.toMatchObject({ status });
      expect(starts).toHaveLength(1);
    });
  }

  it("does not stop on a 404", async () => {
    const { client } = harness([{ status: 404 }, { status: 200, body: "ok" }]);

    await expect(
      client.getText("https://en.wikipedia.org/"),
    ).rejects.not.toBeInstanceOf(StoppedError);
    expect(await client.getText("https://en.wikipedia.org/")).toBe("ok");
  });
});

describe("retryDelayMs", () => {
  it("reads seconds and HTTP dates, and backs off without a header", () => {
    expect(retryDelayMs("12", 0, 0)).toBe(12_000);
    expect(retryDelayMs("Thu, 01 Jan 1970 00:00:30 GMT", 0, 10_000)).toBe(
      20_000,
    );
    expect(retryDelayMs(null, 0, 0)).toBe(10_000);
    expect(retryDelayMs(null, 2, 0)).toBe(40_000);
    expect(retryDelayMs(null, 9, 0)).toBe(120_000);
  });
});
