import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/monitoring/sentry-options";

// Error tracking is optional: without SENTRY_DSN nothing is sent. The
// privacy settings live in src/monitoring/sentry-options.ts, under test.
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const options = sentryOptions({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
  });
  if (options) Sentry.init(options);
}

export const onRequestError = Sentry.captureRequestError;
