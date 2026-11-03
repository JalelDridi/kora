import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeGitHub } from "./fake.ts";
import { HttpGitHub } from "./http.ts";
import { getGitHub } from "./index.ts";

afterEach(() => vi.unstubAllEnvs());

describe("getGitHub", () => {
  it("is null with neither a token nor the fakes", () => {
    vi.stubEnv("KORA_GITHUB_TOKEN", "");
    vi.stubEnv("KORA_ADMIN_FAKES", "");
    expect(getGitHub()).toBeNull();
  });
  it("refuses the fakes on Vercel", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("KORA_ADMIN_FAKES", "/tmp/kora-admin-fakes.json");
    expect(() => getGitHub()).toThrow("KORA_ADMIN_FAKES is for tests only");
  });
  it("uses the token when it is set", () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("KORA_ADMIN_FAKES", "");
    vi.stubEnv("KORA_GITHUB_TOKEN", "test-token");
    expect(getGitHub()).toBeInstanceOf(HttpGitHub);
  });
  it("uses the file-backed fake off Vercel", () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv(
      "KORA_ADMIN_FAKES",
      path.join(mkdtempSync(path.join(tmpdir(), "kora-gh-")), "fakes.json"),
    );
    vi.stubEnv("KORA_GITHUB_TOKEN", "test-token");
    expect(getGitHub()).toBeInstanceOf(FakeGitHub);
  });
});
