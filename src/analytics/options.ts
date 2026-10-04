import type { PostHogConfig } from "posthog-js";
import { posthogEuHost } from "./hosts";

type AnalyticsEnv = { key?: string; host?: string };

// Analytics is optional: without a key nothing is loaded or sent. With one,
// PostHog runs cookieless (decision D6), so no banner is needed while every
// condition in launch-readiness C5 holds. Names checked against
// @posthog/types 1.413.0.
export function analyticsOptions(
  env: AnalyticsEnv,
): { key: string; options: Partial<PostHogConfig> } | null {
  if (!env.key) return null;

  return {
    key: env.key,
    options: {
      api_host: env.host || posthogEuHost,
      defaults: "2025-05-24",
      // No cookie, no local or session storage. The PostHog project must also
      // have cookieless server hash mode on, or the events are dropped.
      cookieless_mode: "always",
      // Never build a profile of a visitor. Never call identify().
      person_profiles: "never",
      // Strips fbclid, gclid and similar ad ids from recorded URLs.
      mask_personal_data_properties: true,
      // Events are sent by the games themselves (design §12).
      autocapture: false,
      capture_dead_clicks: false,
      capture_heatmaps: false,
      // Errors go to Sentry, from the server only (decision P5).
      capture_exceptions: false,
      disable_session_recording: true,
      disable_surveys: true,
      // No script is ever loaded from PostHog, so the Content-Security-Policy
      // needs no third-party script source.
      disable_external_dependency_loading: true,
    },
  };
}
