import { NextRequest } from "next/server";
import {
  getRedirectUrl,
  unstable_doesMiddlewareMatch,
} from "next/experimental/testing/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import proxy, { config } from "./proxy";

const PASSWORD = "unit-test-admin-password";
const basic = (pass: string) =>
  `Basic ${Buffer.from(`jalel:${pass}`).toString("base64")}`;
const get = (path: string, headers: Record<string, string> = {}) =>
  proxy(new NextRequest(`http://localhost${path}`, { headers }));

afterEach(() => vi.unstubAllEnvs());

describe("which paths the proxy sees", () => {
  const runs = (url: string) =>
    unstable_doesMiddlewareMatch({ config, nextConfig: {}, url });

  it("still skips route handlers, Next's own files and files", () => {
    expect(runs("/api/health")).toBe(false);
    expect(runs("/_next/static/chunks/a.js")).toBe(false);
    expect(runs("/icon.svg")).toBe(false);
  });

  it("still sees the site's pages", () => {
    for (const url of ["/", "/ar", "/tn", "/fr"]) expect(runs(url)).toBe(true);
  });

  it("sees everything under /admin, files included", () => {
    for (const url of [
      "/admin",
      "/admin/pool",
      "/admin/pool/x",
      "/admin/pool.rsc",
    ])
      expect(runs(url)).toBe(true);
  });
});

describe("the public locales", () => {
  it("still sends / to /ar, whatever the admin password", async () => {
    vi.stubEnv("ADMIN_PASSWORD", PASSWORD);
    expect(getRedirectUrl(await get("/"))).toBe("http://localhost/ar");
  });

  it("leave paths that only start like /admin to next-intl", async () => {
    vi.stubEnv("ADMIN_PASSWORD", PASSWORD);
    const response = await get("/administration");
    expect(response.status).not.toBe(401);
    expect(response.headers.get("www-authenticate")).toBeNull();
  });
});

describe("/admin", () => {
  it("does not exist without a password set", async () => {
    vi.stubEnv("ADMIN_PASSWORD", undefined);
    for (const path of ["/admin", "/admin/pool", "/admin/pool/x"]) {
      const response = await get(path, { authorization: basic(PASSWORD) });
      expect(response.status).toBe(404);
      expect(response.headers.get("x-robots-tag")).toContain("noindex");
    }
  });

  it("does not exist with a password under 16 characters", async () => {
    vi.stubEnv("ADMIN_PASSWORD", "too-short");
    const response = await get("/admin/pool", {
      authorization: basic("too-short"),
    });
    expect(response.status).toBe(404);
  });

  it("asks for the password with a Basic challenge", async () => {
    vi.stubEnv("ADMIN_PASSWORD", PASSWORD);
    const attempts: Record<string, string>[] = [
      {},
      { authorization: basic("wrong-password-here") },
    ];
    for (const headers of attempts) {
      const response = await get("/admin/pool", headers);
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toMatch(/^Basic /);
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
  });

  it("lets the right password through, uncached and unindexed", async () => {
    vi.stubEnv("ADMIN_PASSWORD", PASSWORD);
    const response = await get("/admin/pool", {
      authorization: basic(PASSWORD),
    });
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
});
