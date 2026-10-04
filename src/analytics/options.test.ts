import { describe, expect, it } from "vitest";
import { analyticsOptions } from "./options";

describe("analyticsOptions", () => {
  it("is null without a key, so nothing is loaded or sent", () => {
    expect(analyticsOptions({})).toBeNull();
    expect(analyticsOptions({ key: "" })).toBeNull();
  });

  // One exact object on purpose: adding or changing an option is a privacy
  // decision and must show up as a diff here (launch-readiness C3).
  it("sends exactly these options", () => {
    expect(analyticsOptions({ key: "phc_test" })).toEqual({
      key: "phc_test",
      options: {
        api_host: "https://eu.i.posthog.com",
        defaults: "2025-05-24",
        cookieless_mode: "always",
        person_profiles: "never",
        mask_personal_data_properties: true,
        autocapture: false,
        capture_dead_clicks: false,
        capture_heatmaps: false,
        capture_exceptions: false,
        disable_session_recording: true,
        disable_surveys: true,
        disable_external_dependency_loading: true,
      },
    });
  });

  it("sends to another host only when told to", () => {
    const options = analyticsOptions({
      key: "phc_test",
      host: "https://ph.example",
    })?.options;
    expect(options?.api_host).toBe("https://ph.example");
  });
});
