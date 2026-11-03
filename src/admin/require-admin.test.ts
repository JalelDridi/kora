import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// Every dashboard action is a public POST endpoint: the proxy checks the
// password, and each action checks it again itself (branch review, item 13).
const request = vi.hoisted(() => ({ authorization: null as string | null }));
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers(
      request.authorization ? { authorization: request.authorization } : {},
    ),
}));

const { requireAdmin } = await import("./require-admin");

const PASSWORD = "unit-test-admin-password";
const basic = (pass: string) =>
  `Basic ${Buffer.from(`jalel:${pass}`).toString("base64")}`;

afterEach(() => {
  vi.unstubAllEnvs();
  request.authorization = null;
});

describe("requireAdmin", () => {
  it("refuses without the header and with a wrong password", async () => {
    vi.stubEnv("ADMIN_PASSWORD", PASSWORD);
    await expect(requireAdmin()).rejects.toThrow("Not found");
    request.authorization = basic("not-the-admin-password");
    await expect(requireAdmin()).rejects.toThrow("Not found");
  });

  it("refuses every request when no password is set", async () => {
    vi.stubEnv("ADMIN_PASSWORD", "");
    request.authorization = basic("");
    await expect(requireAdmin()).rejects.toThrow("Not found");
  });

  it("lets the admin password through", async () => {
    vi.stubEnv("ADMIN_PASSWORD", PASSWORD);
    request.authorization = basic(PASSWORD);
    await expect(requireAdmin()).resolves.toBeUndefined();
  });
});

/** Every actions.ts under src/app/admin. */
function actionFiles(dir = "src/app/admin"): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return actionFiles(file);
    return entry.name === "actions.ts" ? [file] : [];
  });
}

describe("the dashboard's actions", () => {
  const files = actionFiles();

  it("are the six files the dashboard posts to", () => {
    expect(files.sort()).toEqual([
      "src/app/admin/add/actions.ts",
      "src/app/admin/changes/actions.ts",
      "src/app/admin/chkoun/actions.ts",
      "src/app/admin/footballers/[qid]/actions.ts",
      "src/app/admin/rebuild/actions.ts",
      "src/app/admin/settings/[file]/actions.ts",
    ]);
  });

  it.each(files)(
    "%s: each exported action checks the password first, with the shared check",
    (file) => {
      const source = readFileSync(file, "utf8");
      expect(source).toMatch(/^"use server";/);
      expect(source).toContain(
        'import { requireAdmin } from "@/admin/require-admin";',
      );
      expect(source).not.toMatch(/function requireAdmin/);
      const exported = [
        ...source.matchAll(
          /export async function (\w+)\([^)]*\)[^{]*\{\s*([^;]*;)/g,
        ),
      ].map((m) => [m[1], m[2]]);
      expect(exported.length).toBeGreaterThan(0);
      // Nothing else is exported: an exported const or plain function
      // in a "use server" file would be an action without the check.
      expect(source.match(/^export /gm)?.length).toBe(exported.length);
      for (const [name, first] of exported)
        expect([name, first]).toEqual([name, "await requireAdmin();"]);
    },
  );
});
