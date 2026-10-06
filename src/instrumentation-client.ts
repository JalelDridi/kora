import { registerAnalytics } from "@/analytics/events";
import { analyticsOptions } from "@/analytics/options";

const analytics = analyticsOptions({
  key: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
});

// The library is fetched only when a key is configured, and after the page
// has started, so it never weighs on the first paint.
if (analytics) {
  void import("posthog-js").then(({ default: posthog }) => {
    posthog.init(analytics.key, analytics.options);
    // The games send their events through src/analytics/events.ts.
    registerAnalytics(posthog);
  });
}
