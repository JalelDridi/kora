import { describe, expect, it } from "vitest";
import { reportOnlyPolicy, securityHeaders } from "./security-headers";

const production = { analyticsHost: "https://eu.i.posthog.com", dev: false };

describe("securityHeaders", () => {
  it("sends exactly these headers", () => {
    expect(securityHeaders(production)).toEqual([
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
      },
      {
        key: "Content-Security-Policy",
        value:
          "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
      },
      {
        key: "Content-Security-Policy-Report-Only",
        value: reportOnlyPolicy(production),
      },
    ]);
  });
});

describe("reportOnlyPolicy", () => {
  it("allows only this site, plus PostHog's EU hosts for analytics calls", () => {
    expect(reportOnlyPolicy(production)).toBe(
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self' https://eu.i.posthog.com https://eu-assets.i.posthog.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join("; "),
    );
  });

  it("allows eval in development only (React's dev tooling needs it)", () => {
    expect(reportOnlyPolicy({ ...production, dev: true })).toContain(
      "script-src 'self' 'unsafe-inline' 'unsafe-eval';",
    );
    expect(reportOnlyPolicy(production)).not.toContain("unsafe-eval");
  });

  it("follows a custom analytics host", () => {
    expect(
      reportOnlyPolicy({ analyticsHost: "https://ph.example/x", dev: false }),
    ).toContain("connect-src 'self' https://ph.example;");
  });
});
