import { describe, expect, it } from "vitest";
import { createSiteClient, SiteRefusal, SiteStopped } from "./client.ts";

type Reply = {
  status: number;
  body?: string;
  headers?: Record<string, string>;
};

/** A fake host and a fake clock: sleeping only moves time forward. */
function harness(
  replies: Record<string, Reply[]>,
  over: { gapMs?: number; maxRequests?: number } = {},
) {
  let time = 0;
  const log: {
    path: string;
    at: number;
    headers: Headers;
    init: RequestInit;
  }[] = [];
  const client = createSiteClient({
    host: "site.test",
    gapMs: over.gapMs ?? 30_000,
    maxRequests: over.maxRequests ?? 20,
    userAgent: "KoraWitness/0.1 (+https://github.com/JalelDridi/kora; test)",
    now: () => time,
    sleep: async (ms) => {
      time += ms;
    },
    fetch: async (url, init) => {
      const path = new URL(url).pathname + new URL(url).search;
      log.push({
        path,
        at: time,
        headers: new Headers(init?.headers),
        init: init ?? {},
      });
      const reply = replies[path]?.shift();
      if (!reply) throw new Error(`no reply for ${path}`);
      return new Response(reply.body ?? "", {
        status: reply.status,
        headers: reply.headers,
      });
    },
  });
  return { client, log };
}

const ok = (body = "<html>page</html>") => ({ status: 200, body });

describe("createSiteClient (B2)", () => {
  it("fetches robots.txt first and refuses a disallowed URL", async () => {
    const { client, log } = harness({
      "/robots.txt": [ok("User-agent: *\nDisallow: /old/\n")],
      "/new/1": [ok()],
    });
    await expect(client.get("/old/1")).rejects.toThrow(SiteRefusal);
    expect(log.map((l) => l.path)).toEqual(["/robots.txt"]);
    expect(await client.get("/new/1")).toBe("<html>page</html>");
    expect(log.map((l) => l.path)).toEqual(["/robots.txt", "/new/1"]);
  });

  it("waits max(gap, crawl delay) between starts", async () => {
    const slow = harness({
      "/robots.txt": [ok("User-agent: *\nCrawl-delay: 60\n")],
      "/a": [ok()],
      "/b": [ok()],
    });
    await slow.client.get("/a");
    await slow.client.get("/b");
    expect(slow.log.map((l) => l.at)).toEqual([0, 60_000, 120_000]);
    const fast = harness({
      "/robots.txt": [ok("User-agent: *\nCrawl-delay: 1\n")],
      "/a": [ok()],
    });
    await fast.client.get("/a");
    expect(fast.log.map((l) => l.at)).toEqual([0, 30_000]);
  });

  it("stops for the rest of the run at 403, 429, 503, a redirect, or a challenge marker in a 200 body", async () => {
    const answers: [string, Reply][] = [
      ["403", { status: 403 }],
      ["429", { status: 429 }],
      ["503", { status: 503 }],
      ["redirect", { status: 301, headers: { location: "/consent" } }],
      ["Just a moment", ok("<title>Just a moment...</title>")],
      ["cf-chl", ok('<div id="cf-chl-widget"></div>')],
      ["captcha", ok("<div class='g-captcha'></div>")],
      ["datadome", ok("<script src='https://ct.datadome.co/'></script>")],
    ];
    for (const [what, reply] of answers) {
      const { client, log } = harness({
        "/robots.txt": [ok("")],
        "/a": [reply],
        "/b": [ok()],
      });
      await expect(client.get("/a"), what).rejects.toThrow(SiteStopped);
      expect(client.stopped(), what).not.toBeNull();
      await expect(client.get("/b"), what).rejects.toThrow(SiteStopped);
      expect(
        log.map((l) => l.path),
        what,
      ).toEqual(["/robots.txt", "/a"]);
    }
  });

  it("stops at a refused robots.txt, and takes a missing one for no rules", async () => {
    const refused = harness({ "/robots.txt": [{ status: 403 }], "/a": [ok()] });
    await expect(refused.client.get("/a")).rejects.toThrow(SiteStopped);
    expect(refused.log).toHaveLength(1);
    const missing = harness({ "/robots.txt": [{ status: 404 }], "/a": [ok()] });
    expect(await missing.client.get("/a")).toBe("<html>page</html>");
  });

  it("never retries", async () => {
    const { client, log } = harness({
      "/robots.txt": [ok("")],
      "/a": [{ status: 503, headers: { "retry-after": "1" } }, ok()],
    });
    await expect(client.get("/a")).rejects.toThrow(SiteStopped);
    expect(log.filter((l) => l.path === "/a")).toHaveLength(1);
  });

  it("refuses past its request cap", async () => {
    const { client, log } = harness(
      { "/robots.txt": [ok("")], "/a": [ok()], "/b": [ok()] },
      { maxRequests: 2 },
    );
    await client.get("/a");
    await expect(client.get("/b")).rejects.toThrow(SiteRefusal);
    expect(client.requests()).toBe(2);
    expect(log).toHaveLength(2);
  });

  it("sends only User-Agent: no Api-User-Agent, no browser headers", async () => {
    const { client, log } = harness({ "/robots.txt": [ok("")], "/a": [ok()] });
    await client.get("/a");
    for (const entry of log) {
      expect([...entry.headers.keys()]).toEqual(["user-agent"]);
      expect(entry.headers.get("user-agent")).toMatch(/^KoraWitness\/0\.1 /);
      expect(entry.init.redirect).toBe("manual");
    }
  });
});

describe("createSiteClient: robots.txt and odd paths (fix round 1)", () => {
  it("a refused or challenged robots.txt stops the site with no further request", async () => {
    const answers: [string, Reply][] = [
      ["403", { status: 403 }],
      ["429", { status: 429 }],
      ["503", { status: 503 }],
      ["redirect", { status: 302, headers: { location: "/consent" } }],
      ["Just a moment", ok("<title>Just a moment...</title>")],
      ["cf-chl", ok("cf-chl-bypass")],
      ["captcha", ok("please solve the captcha")],
      ["datadome", ok("datadome")],
    ];
    for (const [what, reply] of answers) {
      const { client, log } = harness({ "/robots.txt": [reply], "/a": [ok()] });
      await expect(client.get("/a"), what).rejects.toThrow(SiteStopped);
      expect(client.stopped(), what).toMatch(/robots\.txt/);
      await expect(client.get("/a"), what).rejects.toThrow(SiteStopped);
      expect(
        log.map((l) => l.path),
        what,
      ).toEqual(["/robots.txt"]);
      expect(client.robots(), what).toBeNull();
    }
  });

  it("a real 404 for robots.txt still means no extra rules", async () => {
    const { client, log } = harness({
      "/robots.txt": [{ status: 404 }],
      "/a": [ok()],
    });
    expect(await client.get("/a")).toBe("<html>page</html>");
    expect(log.map((l) => l.path)).toEqual(["/robots.txt", "/a"]);
  });

  it("refuses every odd href without a request: another host, a protocol, a backslash, an @", async () => {
    for (const odd of [
      "//other.host/x",
      "/\\other.host/x",
      "\\\\other.host/x",
      "https://other.host/x",
      "http://site.test/x",
      "https://site.test/x",
      "/x@other.host",
      "x/y",
      "",
      "/a\nb",
      " /a",
    ]) {
      const { client, log } = harness({ "/robots.txt": [ok("")] });
      await expect(client.get(odd), JSON.stringify(odd)).rejects.toThrow(
        SiteRefusal,
      );
      expect(log, JSON.stringify(odd)).toEqual([]);
      expect(client.requests()).toBe(0);
    }
  });
});

describe("a guessed path (squad-lists review, L2)", () => {
  it("with missingOk, a 404 answers an empty page and the site goes on; any other refusal still stops it", async () => {
    const { client, log } = harness({
      "/robots.txt": [ok("")],
      "/guess": [{ status: 404 }],
      "/real": [ok()],
      "/moved": [{ status: 301, headers: { location: "/elsewhere" } }],
      "/after": [ok()],
    });
    expect(await client.get("/guess", { missingOk: true })).toBe("");
    expect(client.stopped()).toBeNull();
    expect(await client.get("/real")).toBe("<html>page</html>");
    await expect(client.get("/moved", { missingOk: true })).rejects.toThrow(
      SiteStopped,
    );
    await expect(client.get("/after")).rejects.toThrow(SiteStopped);
    expect(log.map((l) => l.path)).toEqual([
      "/robots.txt",
      "/guess",
      "/real",
      "/moved",
    ]);
  });

  it("without missingOk, a 404 still stops the site", async () => {
    const { client } = harness({
      "/robots.txt": [ok("")],
      "/gone": [{ status: 404 }],
    });
    await expect(client.get("/gone")).rejects.toThrow(SiteStopped);
    expect(client.stopped()).toContain("HTTP 404");
  });
});
