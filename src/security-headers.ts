// Response headers for every path (hub-audit 4.6). Loaded by next.config.ts
// through Node's type stripping: no imports, no path aliases.
type Options = { analyticsHost: string; dev: boolean };
type Header = { key: string; value: string };

// Safe to enforce now: nothing frames Kora, and it has no plugins, base tags
// or forms that post elsewhere.
const enforced = [
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

function analyticsSources(host: string): string[] {
  const origin = new URL(host).origin;
  // PostHog's EU cloud serves remote config from a separate assets host.
  return origin === "https://eu.i.posthog.com"
    ? [origin, "https://eu-assets.i.posthog.com"]
    : [origin];
}

// The full policy, reported but not enforced until it graduates (decision
// H18). 'unsafe-inline' scripts: the hub is prerendered, and nonces would
// make every page render per request (Next's CSP guide). PostHog loads no
// script of its own (disable_external_dependency_loading); Vercel Web
// Analytics is served from this origin (/_vercel/insights), so 'self'
// covers it.
export function reportOnlyPolicy({ analyticsHost, dev }: Options): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${analyticsSources(analyticsHost).join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function securityHeaders(options: Options): Header[] {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
    },
    { key: "Content-Security-Policy", value: enforced },
    {
      key: "Content-Security-Policy-Report-Only",
      value: reportOnlyPolicy(options),
    },
  ];
}
