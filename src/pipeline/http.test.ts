import { describe, expect, it } from "vitest";
import {
  createPoliteClient,
  HttpError,
  retryDelayMs,
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

  it("waits as long as Retry-After asks, then succeeds", async () => {
    const { client, sleeps } = harness([
      { status: 429, headers: { "Retry-After": "7" } },
      { status: 200, body: "ok" },
    ]);

    expect(await client.getText("https://en.wikipedia.org/")).toBe("ok");
    expect(sleeps).toContain(7_000);
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
    const { client } = harness([
      { status: 503 },
      { status: 503 },
      { status: 503 },
    ]);

    await expect(
      client.getText("https://query.wikidata.org/sparql"),
    ).rejects.toMatchObject({
      status: 503,
    });
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
      { status: 429, headers: { "Retry-After": "3600" } },
    ]);

    await expect(
      client.getText("https://en.wikipedia.org/"),
    ).rejects.toMatchObject({
      status: 429,
    });
    expect(starts).toHaveLength(1);
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
