import { describe, expect, it } from "vitest";
import { analyticsOptions } from "./options";

describe("analyticsOptions", () => {
  it("is null without a key, so nothing is loaded or sent", () => {
    expect(analyticsOptions({})).toBeNull();
    expect(analyticsOptions({ key: "" })).toBeNull();
  });

  it("never sets a cookie or uses browser storage (decision D6)", () => {
    const analytics = analyticsOptions({ key: "phc_test" });

    expect(analytics?.key).toBe("phc_test");
    expect(analytics?.options.cookieless_mode).toBe("always");
  });

  it("sends to PostHog's EU cloud unless told otherwise", () => {
    expect(analyticsOptions({ key: "phc_test" })?.options.api_host).toBe(
      "https://eu.i.posthog.com",
    );
    expect(
      analyticsOptions({ key: "phc_test", host: "https://ph.example" })?.options
        .api_host,
    ).toBe("https://ph.example");
  });

  it("records no sessions and no typed text", () => {
    const options = analyticsOptions({ key: "phc_test" })?.options;

    expect(options?.disable_session_recording).toBe(true);
    expect(options?.autocapture).toBe(false);
  });
});
