import { afterEach, describe, expect, it, vi } from "vitest";

// The admin data checks the password itself, not only the proxy: a request
// that skipped the proxy gets a 404 and nothing else.
const request = vi.hoisted(() => ({ authorization: null as string | null }));
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers(
      request.authorization ? { authorization: request.authorization } : {},
    ),
}));

const { loadPool } = await import("./load-pool");

const PASSWORD = "unit-test-admin-password";
const basic = (pass: string) =>
  `Basic ${Buffer.from(`jalel:${pass}`).toString("base64")}`;
const notFound = { digest: expect.stringContaining("404") };

afterEach(() => {
  vi.unstubAllEnvs();
  request.authorization = null;
});

describe("loadPool", () => {
  it("refuses without the header or with a wrong password", async () => {
    vi.stubEnv("ADMIN_PASSWORD", PASSWORD);
    await expect(loadPool()).rejects.toMatchObject(notFound);
    request.authorization = basic("not-the-admin-password");
    await expect(loadPool()).rejects.toMatchObject(notFound);
    request.authorization = "Basic %%%";
    await expect(loadPool()).rejects.toMatchObject(notFound);
  });

  it("refuses when the password is unset or short, whatever is sent", async () => {
    request.authorization = basic(PASSWORD);
    vi.stubEnv("ADMIN_PASSWORD", undefined);
    await expect(loadPool()).rejects.toMatchObject(notFound);
    vi.stubEnv("ADMIN_PASSWORD", "too-short");
    request.authorization = basic("too-short");
    await expect(loadPool()).rejects.toMatchObject(notFound);
  });

  it("returns the committed pool with the right password", async () => {
    vi.stubEnv("ADMIN_PASSWORD", PASSWORD);
    request.authorization = basic(PASSWORD);
    const pool = await loadPool();
    expect(pool.version).toBe(1);
    expect(pool.players.length).toBeGreaterThan(0);
  });
});
