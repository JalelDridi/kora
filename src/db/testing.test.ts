import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "./client";
import {
  assertLocalDatabase,
  resetDatabase,
  TEST_DATABASE_URL,
} from "./testing";

describe("assertLocalDatabase", () => {
  it("accepts localhost and 127.0.0.1", () => {
    expect(() =>
      assertLocalDatabase("postgresql://u:p@localhost:5434/kora_test"),
    ).not.toThrow();
    expect(() =>
      assertLocalDatabase("postgresql://u:p@127.0.0.1:5434/kora_test"),
    ).not.toThrow();
  });

  it("refuses a hosted database", () => {
    expect(() =>
      assertLocalDatabase("postgresql://u:p@ep-example.neon.tech/kora"),
    ).toThrow(/non-local host "ep-example.neon.tech"/);
  });

  // The pg driver lets query parameters override the URL's host, so a local
  // hostname followed by ?host= would still reach a hosted database.
  it("refuses a host passed in the query string", () => {
    expect(() =>
      assertLocalDatabase(
        "postgresql://u:p@localhost:5434/kora_test?host=ep-x.neon.tech",
      ),
    ).toThrow(/query string/);
    expect(() =>
      assertLocalDatabase(
        "postgresql://u:p@localhost:5434/kora_test?hostaddr=203.0.113.5",
      ),
    ).toThrow(/query string/);
  });
});

describe("resetDatabase", () => {
  it("refuses a client that createTestClient did not create", async () => {
    const other = createClient(TEST_DATABASE_URL);
    // Stands in for the database so that, if the guard were missing, this
    // test would fail without truncating anything.
    const truncate = vi.spyOn(other, "$executeRawUnsafe").mockResolvedValue(0);

    await expect(resetDatabase(other)).rejects.toThrow(/createTestClient/);
    expect(truncate).not.toHaveBeenCalled();
    await other.$disconnect();
  });
});

describe("createTestClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("refuses a non-local TEST_DATABASE_URL", async () => {
    vi.stubEnv(
      "TEST_DATABASE_URL",
      "postgresql://u:p@ep-example.neon.tech/kora",
    );
    vi.resetModules();
    const { createTestClient } = await import("./testing");

    expect(() => createTestClient()).toThrow(/non-local host/);
  });
});
