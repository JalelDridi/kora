import { expect, test } from "@playwright/test";
import { securityHeaders } from "../src/security-headers";

const expected = securityHeaders({
  analyticsHost: "https://eu.i.posthog.com",
  dev: false,
});
type Probe = { cspViolations: string[] };

for (const path of [
  "/ar",
  "/tn",
  "/fr",
  "/ar/nope",
  "/og/ar-v1.png",
  "/robots.txt",
]) {
  test(`${path} sends the security headers`, async ({ request }) => {
    const headers = (await request.get(path)).headers();
    for (const { key, value } of expected) {
      expect(headers[key.toLowerCase()], key).toBe(value);
    }
  });
}

// Report-only violations still fire the event, so this shows the policy would
// not break the hub once enforced. PostHog is not loaded in tests (no key),
// nor is Vercel Web Analytics (same origin, /_vercel/insights): the owner
// checks those on a Preview deployment.
for (const path of ["/ar", "/tn", "/fr", "/ar/nope"]) {
  test(`${path} breaks no rule of the report-only policy`, async ({ page }) => {
    await page.addInitScript(() => {
      const probe = window as unknown as Probe;
      probe.cspViolations = [];
      document.addEventListener("securitypolicyviolation", (e) =>
        probe.cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`),
      );
    });
    await page.goto(path, { waitUntil: "networkidle" });
    expect(
      await page.evaluate(() => (window as unknown as Probe).cspViolations),
    ).toEqual([]);
  });
}
