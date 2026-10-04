import type { ErrorEvent, NodeOptions } from "@sentry/nextjs";

type SentryEnv = { dsn?: string; environment?: string; release?: string };

// Error tracking is optional: without a DSN nothing is sent. Server only
// (decision P5). @sentry/nextjs 11 has no sendDefaultPii; dataCollection
// replaces it (@sentry/core types/datacollection.d.ts).
export function sentryOptions(env: SentryEnv): NodeOptions | null {
  if (!env.dsn) return null;

  return {
    dsn: env.dsn,
    environment: env.environment || "development",
    release: env.release,
    // Errors only; no performance tracing on the free tier.
    tracesSampleRate: 0,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: ["user-agent"] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
      databaseQueryData: false,
    },
    beforeSend: scrubEvent,
  };
}

// Second line of defence, in case an integration fills these in anyway.
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  delete event.user;
  const request = event.request;
  if (request) {
    delete request.cookies;
    delete request.data;
    delete request.query_string;
    if (request.url) request.url = request.url.split("?")[0];
    const userAgent = request.headers?.["user-agent"];
    request.headers = userAgent ? { "user-agent": userAgent } : {};
  }
  // captureRequestError stores Next's request path here, query included.
  const next = event.contexts?.nextjs;
  if (typeof next?.request_path === "string") {
    next.request_path = next.request_path.split("?")[0];
  }
  return event;
}
