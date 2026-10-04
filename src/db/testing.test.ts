import { describe, expect, it } from "vitest";
import { assertLocalDatabase } from "./testing";

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
});
