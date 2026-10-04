import * as Sentry from "@sentry/nextjs";

// Error tracking is optional: without SENTRY_DSN nothing is sent.
export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.VERCEL_ENV ?? "development",
      release: process.env.VERCEL_GIT_COMMIT_SHA,
      // Errors only; no performance tracing on the free tier.
      tracesSampleRate: 0,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
