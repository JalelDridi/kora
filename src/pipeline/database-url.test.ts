import { describe, expect, it } from "vitest";
import { databaseTarget, maskHost } from "./database-url.ts";

const LOCAL = "postgresql://postgres:postgres@localhost:5434/kora_test";
const HOSTED =
  "postgresql://user:secret@ep-cool-name-123.eu-central-1.aws.neon.tech/kora?sslmode=require";

describe("maskHost", () => {
  it("hides the first label, which names the database", () => {
    expect(maskHost("ep-cool-name-123.eu-central-1.aws.neon.tech")).toBe(
      "***.eu-central-1.aws.neon.tech",
    );
    expect(maskHost("127.0.0.1")).toBe("***.0.0.1");
  });

  it("leaves a one-label host such as localhost as it is", () => {
    expect(maskHost("localhost")).toBe("localhost");
  });
});

describe("databaseTarget", () => {
  it("prefers the direct URL, as the migrations do", () => {
    expect(
      databaseTarget({
        DATABASE_URL_UNPOOLED: LOCAL,
        DATABASE_URL: "postgresql://u:p@localhost:9999/other",
      }),
    ).toEqual({ ok: true, url: LOCAL, host: "localhost" });
    expect(databaseTarget({ DATABASE_URL: LOCAL })).toEqual({
      ok: true,
      url: LOCAL,
      host: "localhost",
    });
  });

  it("refuses when no URL is set", () => {
    expect(databaseTarget({})).toEqual({
      ok: false,
      reason: "DATABASE_URL_UNPOOLED or DATABASE_URL must be set",
    });
  });

  it("refuses a hosted database outside Vercel, without printing its URL", () => {
    const target = databaseTarget({ DATABASE_URL_UNPOOLED: HOSTED });
    expect(target.ok).toBe(false);
    const reason = target.ok ? "" : target.reason;
    expect(reason).toContain("***.eu-central-1.aws.neon.tech");
    expect(reason).toContain("KORA_SYNC_ALLOW_REMOTE=1");
    expect(reason).not.toMatch(/ep-cool-name|secret|postgresql:/);
  });

  it("refuses a local host with a query string outside Vercel", () => {
    const target = databaseTarget({
      DATABASE_URL: `${LOCAL}?host=ep-x.neon.tech`,
    });
    expect(target.ok).toBe(false);
  });

  it("accepts a hosted database on Vercel or when explicitly allowed", () => {
    for (const flag of [
      { VERCEL: "1", VERCEL_ENV: "production" },
      { VERCEL: "1", VERCEL_ENV: "preview" },
      { KORA_SYNC_ALLOW_REMOTE: "1" },
    ])
      expect(
        databaseTarget({ ...flag, DATABASE_URL_UNPOOLED: HOSTED }),
      ).toEqual({
        ok: true,
        url: HOSTED,
        host: "***.eu-central-1.aws.neon.tech",
      });
    expect(
      databaseTarget({ KORA_SYNC_ALLOW_REMOTE: "yes", DATABASE_URL: HOSTED })
        .ok,
    ).toBe(false);
  });

  // Final wave, A10: VERCEL=1 alone is set by `vercel dev` and `vercel env
  // pull` on a laptop too; only a Vercel build (production or preview) counts.
  it("refuses a hosted database on VERCEL=1 alone, or on a Vercel development run", () => {
    for (const env of [
      { VERCEL: "1" },
      { VERCEL: "1", VERCEL_ENV: "development" },
      { VERCEL: "true", VERCEL_ENV: "production" },
    ]) {
      const target = databaseTarget({ ...env, DATABASE_URL_UNPOOLED: HOSTED });
      expect(target.ok).toBe(false);
    }
  });

  it("refuses a URL it cannot read, without echoing it", () => {
    const target = databaseTarget({ DATABASE_URL: "not a url secret" });
    expect(target).toEqual({
      ok: false,
      reason: "the database URL cannot be parsed",
    });
  });
});
