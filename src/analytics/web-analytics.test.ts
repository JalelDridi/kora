import { describe, expect, it } from "vitest";
import { webAnalyticsEnabled } from "./web-analytics";

describe("webAnalyticsEnabled", () => {
  it("is on in a Vercel build", () => {
    expect(webAnalyticsEnabled("1")).toBe(true);
  });

  it("is off everywhere else", () => {
    expect(webAnalyticsEnabled(undefined)).toBe(false);
    expect(webAnalyticsEnabled("")).toBe(false);
    expect(webAnalyticsEnabled("0")).toBe(false);
  });
});
