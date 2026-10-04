import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";
import { scrubEvent, sentryOptions } from "./sentry-options";

const dsn = "https://key@example.ingest.sentry.io/1";

describe("sentryOptions", () => {
  it("is null without a DSN, so nothing is sent", () => {
    expect(sentryOptions({})).toBeNull();
    expect(sentryOptions({ dsn: "" })).toBeNull();
  });

  // Sentry 11 replaced sendDefaultPii with dataCollection. One exact object:
  // any change is a privacy decision and shows up as a diff here.
  it("sends exactly these options", () => {
    expect(
      sentryOptions({ dsn, environment: "production", release: "abc123" }),
    ).toEqual({
      dsn,
      environment: "production",
      release: "abc123",
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
    });
  });

  it("calls the environment development when Vercel does not name one", () => {
    expect(sentryOptions({ dsn })?.environment).toBe("development");
  });
});

describe("scrubEvent", () => {
  it("drops the user, cookies, body, query and every header but the user agent", () => {
    const event = {
      type: undefined,
      user: { id: "visitor-1", ip_address: "197.0.0.1" },
      request: {
        url: "https://kora-tn.vercel.app/ar?fbclid=abc",
        query_string: "fbclid=abc",
        cookies: { a: "b" },
        data: { guess: "x" },
        headers: {
          "user-agent": "Mozilla/5.0",
          "x-forwarded-for": "197.0.0.1",
          cookie: "a=b",
        },
      },
    } as ErrorEvent;
    expect(scrubEvent(event)).toEqual({
      type: undefined,
      request: {
        url: "https://kora-tn.vercel.app/ar",
        headers: { "user-agent": "Mozilla/5.0" },
      },
    });
  });

  // captureRequestError copies Next's request path, query included, into
  // contexts.nextjs.request_path: a second copy of ?fbclid=… and the like.
  it("cuts the query off the request path Next reports", () => {
    const event = {
      type: undefined,
      contexts: {
        nextjs: { request_path: "/ar?fbclid=abc123", router_kind: "App" },
      },
    } as ErrorEvent;
    expect(scrubEvent(event).contexts?.nextjs).toEqual({
      request_path: "/ar",
      router_kind: "App",
    });
  });

  it("leaves an event without a request alone", () => {
    const event = { type: undefined, message: "boom" } as ErrorEvent;
    expect(scrubEvent(event)).toEqual({ type: undefined, message: "boom" });
  });
});
