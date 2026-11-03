import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { E2E_ENV } from "../playwright.config";
import type { Pool } from "../src/pipeline/types";
import { securityHeaders } from "../src/security-headers";
import { guess, ready, skipHelp } from "./chkoun-helpers";
import { type ChkounFixture, seedChkoun } from "./fixtures/chkoun";

// The game pages open with the help already seen (src/chkoun/help-seen.ts).
test.beforeEach(async ({ page }) => skipHelp(page));

// Seeded before any page asks the server for today's puzzle (the server
// remembers it for the day).
let fixture: ChkounFixture;
test.beforeAll(async () => {
  fixture = await seedChkoun();
});

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
  "/ar/chkoun",
  "/ar/chkoun/yesterday",
  "/fr/sources",
  "/tn/privacy",
  "/og/chkoun-ar-v1.png",
  "/chkoun-data/ar-TN.json",
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
for (const path of [
  "/ar",
  "/tn",
  "/fr",
  "/ar/nope",
  "/ar/chkoun",
  "/ar/chkoun/yesterday",
  "/fr/sources",
  "/tn/privacy",
]) {
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

test("a played Chkoun? game breaks no rule of the report-only policy", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const probe = window as unknown as Probe;
    probe.cspViolations = [];
    document.addEventListener("securitypolicyviolation", (e) =>
      probe.cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  await page.goto("/ar/chkoun", { waitUntil: "networkidle" });
  await ready(page);
  await guess(page, fixture.others[0]);
  await guess(page, fixture.answers[0]);
  await expect(page.locator("#chkoun-result")).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as Probe).cspViolations),
  ).toEqual([]);
});

// The admin dashboard (Task 10). Every admin page and every save action
// answers 401 without the password; no admin page carries the fake GitHub's
// path (it stands in for the token, which tests never have) or a Bearer
// header; and no client chunk holds admin code or names its token.

const adminPool = JSON.parse(readFileSync("data/pool.json", "utf8")) as Pool;
const anyone = adminPool.players.find((p) => p.pools.active)!;
const ADMIN_PAGES = [
  "/admin",
  "/admin/pool",
  `/admin/pool/${anyone.id}`,
  "/admin/chkoun",
  `/admin/footballers/${anyone.wikidataId}`,
  "/admin/add",
  "/admin/add?q=Msakni",
  "/admin/games/chkoun",
  "/admin/games/season",
  "/admin/settings",
  "/admin/settings/club-short",
  "/admin/settings/ligue1-strength",
  "/admin/settings/honours",
  "/admin/settings/afcon-2004",
  "/admin/settings/ligue1-clubs",
  "/admin/settings/governorates",
  "/admin/rebuild",
  "/admin/changes",
];
// The pages whose forms post to a server action.
const ADMIN_ACTIONS = [
  "/admin/chkoun",
  `/admin/footballers/${anyone.wikidataId}`,
  "/admin/add",
  "/admin/settings/club-short",
  "/admin/rebuild",
  "/admin/changes",
];
const adminAuth = `Basic ${Buffer.from(`jalel:${E2E_ENV.ADMIN_PASSWORD}`).toString("base64")}`;

test("every admin page answers 401 without the password", async ({
  request,
}) => {
  for (const path of ADMIN_PAGES) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(401);
    expect(await response.text(), path).not.toContain("<form");
  }
});

test("every admin save action answers 401 without the password", async ({
  request,
}) => {
  for (const path of ADMIN_ACTIONS) {
    const response = await request.post(path, {
      headers: { "Next-Action": "0".repeat(42) },
      multipart: { note: "x" },
    });
    expect(response.status(), path).toBe(401);
  }
});

test("no admin page carries the GitHub token's stand-in or a Bearer header", async ({
  request,
}) => {
  for (const path of ADMIN_PAGES) {
    const response = await request.get(path, {
      headers: { Authorization: adminAuth },
    });
    expect(response.status(), path).toBe(200);
    const html = await response.text();
    expect(html, path).not.toContain(E2E_ENV.KORA_ADMIN_FAKES);
    expect(html, path).not.toContain("KORA_ADMIN_FAKES");
    expect(html, path).not.toContain("Bearer");
  }
});

// Strings only admin server code holds: its GitHub client's paths and
// host, the fake's guard, the token's name. The build's server output has
// them (the search finds what it looks for); no browser file may.
const ADMIN_ONLY = [
  "admin/github",
  "api.github.com",
  "KORA_GITHUB_TOKEN",
  "KORA_ADMIN_FAKES",
  "is for tests only",
  "Bearer",
];
const filesUnder = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((f) => f.isFile())
    .map((f) => path.join(f.parentPath, f.name));

test("no browser file holds admin code or names the token", async ({
  page,
}) => {
  const server = filesUnder(".next/server")
    .filter((f) => f.endsWith(".js"))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
  expect(server).toContain("api.github.com");
  expect(server).toContain("KORA_GITHUB_TOKEN");

  // Every file the build hands to browsers.
  for (const file of filesUnder(".next/static")) {
    const text = readFileSync(file, "utf8");
    for (const needle of ADMIN_ONLY)
      expect(text.includes(needle), `${needle} in ${file}`).toBe(false);
  }
  // And the scripts a public page actually loads.
  const scripts: string[] = [];
  page.on("response", async (response) => {
    if (response.request().resourceType() === "script")
      scripts.push(await response.text().catch(() => ""));
  });
  for (const path of ["/ar", "/ar/chkoun", "/fr/sources"])
    await page.goto(path, { waitUntil: "networkidle" });
  expect(scripts.length).toBeGreaterThan(0);
  for (const text of scripts)
    for (const needle of ADMIN_ONLY) expect(text).not.toContain(needle);
});
