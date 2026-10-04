import type { PostHogConfig } from "posthog-js";

type AnalyticsEnv = { key?: string; host?: string };

// Analytics is optional: without a key nothing is loaded or sent. With one,
// PostHog runs cookieless (decision D6), so no consent banner is needed.
export function analyticsOptions(
  env: AnalyticsEnv,
): { key: string; options: Partial<PostHogConfig> } | null {
  if (!env.key) return null;

  return {
    key: env.key,
    options: {
      api_host: env.host || "https://eu.i.posthog.com",
      defaults: "2025-05-24",
      cookieless_mode: "always",
      // Events are sent by the games themselves (design §12).
      autocapture: false,
      disable_session_recording: true,
    },
  };
}
