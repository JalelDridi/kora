# Kora Hub Polish Implementation Plan

> **Approved by Jalel on 4 October 2026**, every assumed decision (H1–H19) as recommended. For H8 he chose: the 404 drafts ship and he rewrites all wording in one pass before the public launch (same rule as P13), so the pull request does not wait for his strings. Nothing in this plan has been run yet. Build it on branch `hub-polish` from `main` after the Sprint 1 pull request merges.

> **UNAPPROVED DRAFT (4 October 2026).** Jalel has not reviewed this plan. Nothing in it was run: no build, no test, no browser, no Lighthouse. Code is written against the installed packages' types and the Next.js 16.3.8 docs in `node_modules/next/dist/docs/`, but has never been compiled. Every "Expected" line is a prediction.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the hub's privacy settings, link previews, 404 page, small-screen switcher, font waste, site files and security headers before the first game goes public.

**Architecture:** Each fix is small and tested on its own. Privacy settings move into pure option builders (`src/analytics/options.ts`, new `src/monitoring/sentry-options.ts`) pinned by exact-object unit tests. Link previews use static PNGs that a script renders with the repo's own Playwright Chromium (the tool `scripts/render-deck.mjs` already uses; `page.screenshot` writes PNGs) and commits under `public/`. The 404 is a `not-found.tsx` inside the `[locale]` layout, reached through a catch-all route. Site files use Next's metadata file conventions. Security headers come from a pure builder imported by `next.config.ts`.

**Tech Stack:** Next.js 16.3.8 (App Router, Proxy, metadata files) · next-intl 4.14.9 without its plugin · Tailwind 4 · posthog-js 1.435.8 (`@posthog/types` 1.413.0) · `@sentry/nextjs` 11.4.0 · Vitest 5 · Playwright 1.63.0 · `@axe-core/playwright` · Lighthouse CI 0.15.1.

## Decisions this plan assumes

Every row is **assumed, Jalel to confirm**. Task 1 step 1 records his answers in `docs/decisions.md` before any code. A changed row changes the task in the last column.

| # | Question | Assumed (Jalel to confirm) | Alternative | Task |
| --- | --- | --- | --- | --- |
| H1 | Branch | `hub-polish`, from `main` after the Sprint 1 pull request merges. Only `e2e/locales.spec.ts` overlaps Sprint 1 files | Branch from `sprint-1` now, rebase later | all |
| H2 | PostHog options beyond `person_profiles: 'never'` | Also `mask_personal_data_properties: true` (strips `fbclid` and other ad ids from recorded URLs; most visitors come from Facebook), `disable_external_dependency_loading: true` (no PostHog scripts), surveys, heatmaps, dead clicks and exception capture off | Only `person_profiles: 'never'` | 1 |
| H3 | Sentry privacy | Sentry 11 has **no `sendDefaultPii`**; use its replacement `dataCollection` (no user info, cookies, bodies, query strings, local variables; only the `user-agent` header) plus a `beforeSend` that drops `user` and scrubs `request` | Keep request headers for debugging | 1 |
| H4 | next-intl's `NEXT_LOCALE` cookie | Off (`localeCookie: false`): detection is already off, so it only makes the site set a cookie | Keep it | 1 |
| H5 | How share images are made | HTML rendered by Playwright Chromium (real shaping and bidi); fonts from two new dev dependencies `@fontsource/inter` and `@fontsource/ibm-plex-sans-arabic`, embedded as data URLs; output committed as `public/og/{ar,tn,fr}-v1.png` | Fonts from Google's CSS at render time (network on the developer's machine, no dependency); or images made by hand in a design tool | 2 |
| H6 | What the share image shows | The `K` mark, "Kora" and the locale's existing `hub.tagline`. No new wording, no player, no crest (launch-readiness B) | One language-neutral image (mark, "Kora", "30–0") | 2 |
| H7 | `og:locale` | `/ar` and `/tn` → `ar_AR`, `/fr` → `fr_FR`; alternates are the others, deduplicated | `ar_TN` as launch-readiness D2 says (not in Facebook's list per hub-audit 3.1, probably ignored) | 2 |
| H8 | 404 wording before Jalel writes it | Drafts go on the branch under decision P13; the pull request does not merge until he has replaced or approved them | Hold Task 3 until he sends final strings | 3 |
| H9 | 404 reach | Every path without a dot: `/ar/x`, `/fr/a/b`, and `/x` (the Proxy already redirects it to `/ar/x`). Dotted paths outside a locale (`/x.php`) keep Next's default 404 | Next's experimental `global-not-found.js` for those too | 3 |
| H10 | Switcher at 320 px | The pill row may wrap (rounded rectangle when it does); links use `px-3` below `sm`, `px-4` above | A native `<select>`; or shorter labels (wording) | 4 |
| H11 | Root font size | `106.25%` (17 px at the browser default, grows with the visitor's setting) | Keep `17px` | 4 |
| H12 | Switcher details | `aria-current="page"` (audit 1.1) and `prefetch={false}` (audit 4.3), since the line is edited anyway | Leave both | 4 |
| H13 | Face for Latin text on `/ar` | Inter, as the CSS comment intends: one stack for both directions (Inter first; Arabic falls through to Plex). Plex no longer preloaded anywhere | Plex for Latin on `/ar` (and Inter preloaded for nothing) | 5 |
| H14 | Icons | Rendered from `src/app/icon.svg` by the same script: `favicon.ico` (16, 32, 48 as PNG-in-ICO), `apple-icon.png` 180 px full-bleed, manifest PNGs 192 and 512 plus a 512 maskable | Keep the SVG only until a game exists | 6 |
| H15 | Manifest language | One manifest in Derja: `lang` `ar-TN`, `dir` `rtl`, `start_url` `/ar`, description = existing `/ar` meta description | Per-locale manifests | 6 |
| H16 | `robots.txt` and `/admin` | Disallow `/api/` only. `/admin` keeps its `noindex` and stays out of the sitemap; listing it would advertise the path and stop crawlers reading the `noindex` | Disallow `/admin` too | 6 |
| H17 | Sitemap dates | No `lastmod` (no honest date for a hand-edited hub) | Build time | 6 |
| H18 | Content-Security-Policy | No nonces (they make every page render per request and lose the prerendered edge cache, per Next's CSP guide). Enforce now `frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`; ship the full policy (`'unsafe-inline'` scripts for Next's inline payload) as `Content-Security-Policy-Report-Only`; graduate as described in Task 7 | Nonces with dynamic rendering; or Next's experimental SRI | 7 |
| H19 | Where headers live | `next.config.ts` `headers()`, so `next start` in the browser tests serves what Vercel serves | `vercel.json` (invisible to local tests) | 7 |

## Strings for Jalel

Three new keys under `notFound` in each `messages/*.json`. **Every value is a DRAFT** written by Claude, not checked by a Derja speaker; Jalel rewrites or approves all nine before the pull request merges (H8).

| Key | Where it appears | `ar-TN` | `ar-Latn-TN` | `fr` |
| --- | --- | --- | --- | --- |
| `notFound.title` | 404 heading (`h1`) | DRAFT: الصفحة هاذي موش موجودة | DRAFT: El page hedhi mouch mawjouda | DRAFT: Cette page n'existe pas |
| `notFound.body` | 404, one line under the heading | DRAFT: يمكن الرابط غالط ولا الصفحة تنحّات. | DRAFT: Ymken el lien ghalet wala el page tna77at. | DRAFT: Le lien est peut-être faux, ou la page a été retirée. |
| `notFound.home` | 404, button back to the hub | DRAFT: ارجع للألعاب | DRAFT: Arja3 lel al3ab | DRAFT: Retour aux jeux |

Existing strings that now appear in new places (no new wording): `hub.tagline` is baked into the three share images (if he rewrites it: `pnpm images`, then bump `shareImageVersion`); `Kora · ` + `hub.tagline` becomes `og:image:alt`; `meta.title` and `meta.description` become the `og:`/`twitter:` title and description; the `ar-TN` `meta.description` becomes the web manifest description.

## Corrections to the research

Found while checking the two research files against the installed code; the plan follows the corrected version.

1. **`sendDefaultPii` does not exist in `@sentry/nextjs` 11.4.0** (launch-readiness C4 and S2 item 6). `@sentry/core` 11.4.0 `types/options.d.ts` has `dataCollection?: DataCollection` instead (`userInfo`, `cookies`, `httpHeaders`, `httpBodies`, `urlQueryParams`, `stackFrameVariables`...). `sendDefaultPii: false` would fail type-checking.
2. **PostHog's `ip` client option has no effect** (C3 "turn off IP capture"): `@posthog/types` 1.413.0 says "THIS OPTION HAS NO EFFECT ... Use ... 'Discard IP data' project setting". IP discard is a project setting only (owner checklist, Task 1).
3. **`og:locale`:** launch-readiness D2 says `ar_TN`; hub-audit 3.1 says Facebook's list has `ar_AR` and nothing Tunisian. The plan takes `ar_AR` (H7); the Sharing Debugger settles it.
4. **"Preload the needed weights per locale"** (hub-audit 4.1) is not possible with `next/font` here: the font is declared once in `src/app/[locale]/layout.tsx`, the root layout for all three locales, and `preload` is per declaration, not per route parameter. Plex preloading goes off everywhere (Task 5).
5. **"A root fallback for paths outside any locale"** (hub-audit 3.5) needs Next's experimental `global-not-found.js`, as there is no `app/layout.tsx`. Non-dotted paths already reach the localized 404 through the Proxy redirect (H9).
6. **"130 % text zoom" in the overflow test** (hub-audit 1.7): Playwright cannot set Android's font scale. The plan raises Chromium's default font size through the DevTools protocol (`Page.setFontSizes`), which exercises the same `rem` scaling; the WebView stays a phone check.
7. **Full CSP "needs nonces"** (hub-audit 4.6): true for a strict policy, but nonces make every page dynamic (Next's CSP guide), ending the prerendered edge cache the audit praises (H18).
8. Size limit: D2 says ≤ 250 KB, audit 3.2 about 300 KB. The plan uses 250 000 bytes.

## Global Constraints

From `docs/superpowers/plans/2026-10-04-sprint-1.md` lines 35-52, where they apply:

- Free tiers only. Vercel Hobby: no ads, no prizes. No API keys or paid services.
- Never print or commit secrets. `NEXT_PUBLIC_POSTHOG_KEY` and `SENTRY_DSN` stay unset in tests (`check.sh` and `playwright.config.ts` already blank them).
- Derja copy is Jalel's. This branch adds exactly the three `notFound` keys above, as drafts. No other visitor-facing wording.
- Western digits everywhere. No letter-spacing or uppercase on translated text. Logical CSS only (`ps-`, `pe-`, `ms-`, `me-`, `start`, `end`, `inline-size`; never `left`/`right`/`pl-`/`pr-`/`ml-`/`mr-`). A **player** is a footballer; the person playing is a **visitor**.
- `@swc/core` does not load on this PC. No `tsx`, `ts-node`, `vite-node` CLI or Next plugins that import it. Scripts run with `node file.ts` (Node 24 type stripping): no `enum`, no namespaces, no constructor parameter properties, `import type` for types, relative imports ending in `.ts`.
- Vitest configs are `.mts`. Unit tests are `src/**/*.test.ts`; Postgres tests `*.db.test.ts`.
- Next.js 16 differs from older versions (Proxy, not Middleware; `params` is a Promise). Read the matching guide in `node_modules/next/dist/docs/` before writing Next code.
- One implementer agent at a time. Check free RAM before a build (`powershell -c "(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1MB"`, in GB); stop under about 2 GB. Build with `CIRCLE_NODE_TOTAL=2`.
- Network: only `pnpm add` in Task 2. Tests never touch the network.
- Small conventional commits, one concern each, every one ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Run `bash check.sh` before every commit; it must end with `all checks passed`. `lighthouserc.json` is not touched.
- Pull request descriptions end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Work in `D:\Downloads\Portfolio\kora` on branch `hub-polish`. Never merge to `main` without Jalel's go-ahead in chat.
- Code blocks below are compacted; run `pnpm format` before each commit (`format:check` is in `check.sh`).

Shorthands used in the steps:
- **BUILD+E2E `<spec>`** = `NEXT_PUBLIC_POSTHOG_KEY= CIRCLE_NODE_TOTAL=2 pnpm build && pnpm test:e2e <spec>` (the Playwright web server runs `next start`, so a build must come first).
- **COMMIT `"<message>"` `<files>`** = `pnpm format && bash check.sh` (expect `all checks passed`), then `git add <files> && git commit -m "<message>" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`.

## File structure

| Path | Responsibility | Task |
| --- | --- | --- |
| `src/analytics/hosts.ts`, `options.ts`, `options.test.ts` | PostHog host and options, pinned as one exact object | 1 |
| `src/monitoring/sentry-options.ts` (+ test), `src/instrumentation.ts` | Sentry options and event scrubber; `Sentry.init` | 1 |
| `src/i18n/routing.ts` | `localeCookie: false` | 1 |
| `src/share.ts` (+ test), `public/og/*.png`, `e2e/share.spec.ts` | Share-image paths, size, OG locales; committed PNGs; tag tests | 2 |
| `scripts/render-images.ts` | Renders share images (Task 2) and icons (Task 6) with Chromium | 2, 6 |
| `src/app/[locale]/layout.tsx` | OG/Twitter metadata; font preload; theme colour | 2, 5, 6 |
| `src/app/[locale]/not-found.tsx`, `[...rest]/page.tsx`, `messages/*.json`, `e2e/not-found.spec.ts` | Localized 404 | 3 |
| `src/components/language-switcher.tsx`, `src/app/globals.css`, `e2e/hub.spec.ts` | Wrapping switcher, root size in %, one font stack | 4, 5 |
| `e2e/fonts.spec.ts` | One font preload; no Plex Latin on `/ar`; one Arabic weight on `/tn`, `/fr` | 5 |
| `src/app/{robots,sitemap,manifest}.ts`, `src/app/{favicon.ico,apple-icon.png}`, `public/icons/*.png`, `src/site.ts`, `src/site-files.test.ts`, `e2e/site-files.spec.ts` | Site files | 6 |
| `src/security-headers.ts` (+ test), `next.config.ts`, `e2e/security.spec.ts` | Headers | 7 |

---

### Task 1: Privacy settings before any analytics key is set

**Files:** Create `src/analytics/hosts.ts`, `src/monitoring/sentry-options.ts`, `src/monitoring/sentry-options.test.ts`. Modify `src/analytics/options.ts`, `src/analytics/options.test.ts`, `src/instrumentation.ts`, `src/i18n/routing.ts`, `e2e/locales.spec.ts`, `docs/decisions.md`.

**Interfaces:**
- Produces: `posthogEuHost: string` in `src/analytics/hosts.ts` (no imports, so `next.config.ts` can load it in Task 7). `analyticsOptions(env)` keeps its signature. `sentryOptions(env: { dsn?: string; environment?: string; release?: string }): NodeOptions | null` and `scrubEvent(event: ErrorEvent): ErrorEvent` in `src/monitoring/sentry-options.ts`.

- [ ] **Step 1: Record the decisions.** Ask Jalel about H1-H19 in one message (options as in the table). Append his answers to `docs/decisions.md` under `## Hub polish` in the file's table format. If an answer differs from the assumption, change the named task first.

- [ ] **Step 2: Write the failing PostHog test.** Replace `src/analytics/options.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { analyticsOptions } from "./options";
describe("analyticsOptions", () => {
  it("is null without a key, so nothing is loaded or sent", () => {
    expect(analyticsOptions({})).toBeNull();
    expect(analyticsOptions({ key: "" })).toBeNull();
  });
  // One exact object on purpose: adding or changing an option is a privacy
  // decision and must show up as a diff here (launch-readiness C3).
  it("sends exactly these options", () => {
    expect(analyticsOptions({ key: "phc_test" })).toEqual({
      key: "phc_test",
      options: {
        api_host: "https://eu.i.posthog.com", defaults: "2025-05-24",
        cookieless_mode: "always", person_profiles: "never",
        mask_personal_data_properties: true, autocapture: false,
        capture_dead_clicks: false, capture_heatmaps: false, capture_exceptions: false,
        disable_session_recording: true, disable_surveys: true,
        disable_external_dependency_loading: true,
      },
    });
  });
  it("sends to another host only when told to", () => {
    const options = analyticsOptions({ key: "phc_test", host: "https://ph.example" })?.options;
    expect(options?.api_host).toBe("https://ph.example");
  });
});
```

- [ ] **Step 3: See it fail.** Run `pnpm test src/analytics/options.test.ts`. Expected: FAIL in "sends exactly these options", diff lists `person_profiles`, `mask_personal_data_properties` and the other new keys as missing.

- [ ] **Step 4: Implement.** Create `src/analytics/hosts.ts`:

```ts
// PostHog's EU cloud (decision D6). No imports: next.config.ts loads this
// file with Node's own type stripping (Task 7).
export const posthogEuHost = "https://eu.i.posthog.com";
```

Replace `src/analytics/options.ts`:

```ts
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
```

- [ ] **Step 5: See it pass.** `pnpm test src/analytics/options.test.ts`. Expected: PASS, 3 tests.

- [ ] **Step 6: Write the failing Sentry test.** Create `src/monitoring/sentry-options.test.ts`:

```ts
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
    expect(sentryOptions({ dsn, environment: "production", release: "abc123" })).toEqual({
      dsn, environment: "production", release: "abc123", tracesSampleRate: 0,
      dataCollection: {
        userInfo: false, cookies: false,
        httpHeaders: { request: { allow: ["user-agent"] }, response: false },
        httpBodies: [], urlQueryParams: false, stackFrameVariables: false,
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
        url: "https://kora-tn.vercel.app/ar?fbclid=abc", query_string: "fbclid=abc",
        cookies: { a: "b" }, data: { guess: "x" },
        headers: { "user-agent": "Mozilla/5.0", "x-forwarded-for": "197.0.0.1", cookie: "a=b" },
      },
    } as ErrorEvent;
    expect(scrubEvent(event)).toEqual({
      type: undefined,
      request: { url: "https://kora-tn.vercel.app/ar", headers: { "user-agent": "Mozilla/5.0" } },
    });
  });
  it("leaves an event without a request alone", () => {
    const event = { type: undefined, message: "boom" } as ErrorEvent;
    expect(scrubEvent(event)).toEqual({ type: undefined, message: "boom" });
  });
});
```

- [ ] **Step 7: See it fail.** `pnpm test src/monitoring/sentry-options.test.ts`. Expected: FAIL, "Failed to resolve import ./sentry-options".

- [ ] **Step 8: Implement.** Create `src/monitoring/sentry-options.ts`:

```ts
import type { ErrorEvent, NodeOptions } from "@sentry/nextjs";
type SentryEnv = { dsn?: string; environment?: string; release?: string };
// Error tracking is optional: without a DSN nothing is sent. Server only
// (decision P5). @sentry/nextjs 11 has no sendDefaultPii; dataCollection
// replaces it (@sentry/core types/datacollection.d.ts).
export function sentryOptions(env: SentryEnv): NodeOptions | null {
  if (!env.dsn) return null;
  return {
    dsn: env.dsn,
    environment: env.environment ?? "development",
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
  return event;
}
```

If `pnpm typecheck` rejects the test's `as ErrorEvent` casts, add the field it asks for to the test objects; do not loosen `scrubEvent`'s type.

Replace `src/instrumentation.ts`:

```ts
import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/monitoring/sentry-options";
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
```

- [ ] **Step 9: See it pass.** `pnpm test src/monitoring/sentry-options.test.ts && pnpm typecheck`. Expected: PASS, 5 tests; typecheck exits 0.

- [ ] **Step 10: Commit.** COMMIT `"fix: no person profiles in PostHog, no personal data in Sentry"` `src/analytics src/monitoring src/instrumentation.ts docs/decisions.md`

- [ ] **Step 11: Write the failing cookie test.** Append to `e2e/locales.spec.ts`:

```ts
test("no page sets a cookie (the site stays cookieless)", async ({ request }) => {
  for (const path of ["/", ...locales.map((l) => localeInfo[l].prefix)]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.headers()["set-cookie"], path).toBeUndefined();
  }
});
```

- [ ] **Step 12: See it fail.** BUILD+E2E `e2e/locales.spec.ts -g cookie`. Expected: FAIL, `set-cookie` is `NEXT_LOCALE=…` (hub-audit 4.5).

- [ ] **Step 13: Implement.** In `src/i18n/routing.ts`, after `localeDetection: false,`:

```ts
  // With detection off the cookie is never read; dropping it keeps the site
  // free of cookies (launch-readiness C5) and lets shared caches reuse pages.
  localeCookie: false,
```

- [ ] **Step 14: See it pass.** Same command as step 12. Expected: PASS.

- [ ] **Step 15: Commit.** COMMIT `"fix: stop setting the unused locale cookie"` `src/i18n/routing.ts e2e/locales.spec.ts`

- [ ] **Step 16: Owner checklist, in the pull request description (no code).** Before Jalel sets `NEXT_PUBLIC_POSTHOG_KEY` or `SENTRY_DSN` in Vercel: PostHog project settings, turn on cookieless server hash mode and "Discard client IP data", retention 25 months or less if offered; Sentry project settings, turn on "Prevent Storing of IP Addresses" and the default data scrubbers, and note the organisation's data region for the privacy page. (Setting labels unverified.)

---

### Task 2: Link previews with static share images

**Files:** Create `src/share.ts`, `src/share.test.ts`, `scripts/render-images.ts`, `public/og/ar-v1.png`, `public/og/tn-v1.png`, `public/og/fr-v1.png`, `e2e/share.spec.ts`. Modify `package.json`, `pnpm-lock.yaml`, `src/app/[locale]/layout.tsx`.

**Interfaces:**
- Consumes: `localeInfo`, `locales`, `Locale` (`src/i18n/locales.ts`, no imports, runnable by Node); `site` (`src/site.ts`).
- Produces (`src/share.ts`, type-only imports so Node can run it from the script): `shareImageVersion = 1`; `shareImageSize = { width: 1200, height: 630 }`; `shareImageMaxBytes = 250_000`; `shareImagePath(prefix: string): string` (`/ar` → `/og/ar-v1.png`); `openGraphLocale: Record<Locale, string>`; `alternateOpenGraphLocales(locale: Locale): string[]`. `scripts/render-images.ts` exposes nothing; Task 6 adds an icons section.

- [ ] **Step 1: Write the failing unit test.** Create `src/share.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { localeInfo, locales } from "./i18n/locales";
import {
  alternateOpenGraphLocales, openGraphLocale, shareImageMaxBytes, shareImagePath, shareImageSize,
} from "./share";
describe("share images", () => {
  it("live under /og with the locale prefix and a version", () => {
    expect(locales.map((l) => shareImagePath(localeInfo[l].prefix))).toEqual([
      "/og/ar-v1.png", "/og/tn-v1.png", "/og/fr-v1.png",
    ]);
  });
  // The PNGs are committed (rendered by `pnpm images`): this catches a
  // missing, resized or bloated file before Facebook or WhatsApp does.
  for (const locale of locales) {
    const path = shareImagePath(localeInfo[locale].prefix);
    it(`${path} is a 1200×630 PNG under 250 KB`, () => {
      const file = readFileSync(new URL(`../public${path}`, import.meta.url));
      expect(file.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect({ width: file.readUInt32BE(16), height: file.readUInt32BE(20) }).toEqual(shareImageSize);
      expect(file.length).toBeLessThanOrEqual(shareImageMaxBytes);
    });
  }
});
describe("Open Graph locales", () => {
  it("use ar_AR for both Derja scripts and fr_FR for French (H7)", () => {
    expect(openGraphLocale).toEqual({ "ar-TN": "ar_AR", "ar-Latn-TN": "ar_AR", fr: "fr_FR" });
  });
  it("list each other locale once as an alternate", () => {
    expect(alternateOpenGraphLocales("ar-TN")).toEqual(["fr_FR"]);
    expect(alternateOpenGraphLocales("ar-Latn-TN")).toEqual(["fr_FR"]);
    expect(alternateOpenGraphLocales("fr")).toEqual(["ar_AR"]);
  });
});
```

- [ ] **Step 2: See it fail.** `pnpm test src/share.test.ts`. Expected: FAIL, "Failed to resolve import ./share".

- [ ] **Step 3: Implement `src/share.ts`.**

```ts
import type { Locale } from "./i18n/locales";
// Link-preview images (hub-audit 3.1-3.2, launch-readiness D2): static PNGs
// rendered by scripts/render-images.ts, because next/og reverses Arabic words
// and crashes on IBM Plex Sans Arabic. Facebook caches by URL: bump the
// version whenever an image changes. Type-only imports: the script runs this
// file with Node's type stripping.
export const shareImageVersion = 1;
export const shareImageSize = { width: 1200, height: 630 } as const;
// WhatsApp may drop preview images above about 300 KB.
export const shareImageMaxBytes = 250_000;
export function shareImagePath(prefix: string): string {
  return `/og${prefix}-v${shareImageVersion}.png`;
}
// Facebook has no Tunisian or Arabizi locale (decision H7).
export const openGraphLocale: Record<Locale, string> = {
  "ar-TN": "ar_AR",
  "ar-Latn-TN": "ar_AR",
  fr: "fr_FR",
};
export function alternateOpenGraphLocales(locale: Locale): string[] {
  const own = openGraphLocale[locale];
  return [...new Set(Object.values(openGraphLocale))].filter((l) => l !== own);
}
```

- [ ] **Step 4: Add the font packages and the script entry.** Run `pnpm add -D -E @fontsource/inter @fontsource/ibm-plex-sans-arabic`, then `ls node_modules/@fontsource/inter/files | grep -E "latin-(600|800)-normal.woff2$"` and `ls node_modules/@fontsource/ibm-plex-sans-arabic/files | grep -E "arabic-(600|700)-normal.woff2$"`. Expected: four file names; if they differ from step 5, use the listed ones. In `package.json` `scripts`, after `"deck"`, add `"images": "node scripts/render-images.ts",`.

- [ ] **Step 5: Write `scripts/render-images.ts`.**

```ts
// Renders the link-preview images into public/og/, one per locale, with a
// real Chromium so Arabic is shaped and ordered by the browser (not next/og:
// it reverses Arabic words and crashes on IBM Plex Sans Arabic). Run by hand
// after changing a tagline, the mark or this design: `pnpm images`, then bump
// shareImageVersion in src/share.ts if an existing image changed. Locally it
// uses the installed Chrome, like scripts/render-deck.mjs.
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "@playwright/test";
import { localeInfo, locales } from "../src/i18n/locales.ts";
import { shareImageMaxBytes, shareImagePath, shareImageSize } from "../src/share.ts";
import { site } from "../src/site.ts";
const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root));
const out = (path: string) => fileURLToPath(new URL(path, root));
// Fonts as data URLs: Chromium refuses font files from file:// pages.
const face = (family: string, weight: number, file: string) =>
  `@font-face { font-family: "${family}"; font-weight: ${weight}; src: url(data:font/woff2;base64,${read(
    `node_modules/${file}`,
  ).toString("base64")}) format("woff2"); }`;
const plex = (weight: number) =>
  face("Plex Arabic", weight, `@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-${weight}-normal.woff2`);
const inter = (weight: number) =>
  face("Inter", weight, `@fontsource/inter/files/inter-latin-${weight}-normal.woff2`);
const mark = read("src/app/icon.svg").toString("utf8");
// Same colours and font order as the site. Content sits in the middle
// because WhatsApp crops previews to a square.
const shareCss = `${inter(600)} ${inter(800)} ${plex(600)} ${plex(700)}
  * { margin: 0; box-sizing: border-box; }
  html, body { inline-size: ${shareImageSize.width}px; block-size: ${shareImageSize.height}px; }
  body { background: #0b1510; color: #eef3ef; font-family: "Inter", "Plex Arabic", sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 28px; text-align: center; }
  svg { inline-size: 132px; block-size: 132px; }
  h1 { font-size: 168px; font-weight: 800; line-height: 1; }
  p { font-size: 52px; font-weight: 600; color: #cfd8d2; max-inline-size: 1000px; }
  .bar { inline-size: 160px; block-size: 10px; border-radius: 5px; background: #9ad4b4; }`;
async function waitForFonts(page: Page) {
  const failed = await page.evaluate(async () => {
    await Promise.all([...document.fonts].map((f) => f.load()));
    return [...document.fonts].filter((f) => f.status !== "loaded").map((f) => `${f.family} ${f.weight}`);
  });
  if (failed.length) throw new Error(`fonts not loaded: ${failed.join(", ")}`);
}
async function renderShareImages(page: Page) {
  mkdirSync(out("public/og"), { recursive: true });
  await page.setViewportSize(shareImageSize);
  for (const locale of locales) {
    const { prefix, dir } = localeInfo[locale];
    const messages = JSON.parse(read(`messages/${locale}.json`).toString("utf8"));
    await page.setContent(
      `<!doctype html><html lang="${locale}" dir="${dir}"><head><meta charset="utf-8"><style>${shareCss}</style></head>
       <body>${mark}<h1>${site.name}</h1><p>${messages.hub.tagline}</p><div class="bar"></div></body></html>`,
    );
    await waitForFonts(page);
    const path = out(`public${shareImagePath(prefix)}`);
    await page.screenshot({ path, type: "png" });
    const bytes = statSync(path).size;
    if (bytes > shareImageMaxBytes) throw new Error(`${path}: ${bytes} bytes`);
    console.log(`${path} (${bytes} bytes)`);
  }
}
const browser = await chromium.launch({ channel: process.env.CI ? undefined : "chrome" });
const page = await browser.newPage({ deviceScaleFactor: 1 });
try {
  await renderShareImages(page);
} finally {
  await browser.close();
}
```

- [ ] **Step 6: Render and look.** Run `pnpm images`. Expected: three lines `...\public\og\ar-v1.png (NNNNN bytes)`, each under 250 000 (estimate 30-80 KB, flat colours). Open `public/og/ar-v1.png`: the tagline reads right to left with joined letters and "،"; "Kora" is intact. Show the three PNGs to Jalel before committing (the Derja's look is his).

- [ ] **Step 7: See the unit test pass.** `pnpm test src/share.test.ts`. Expected: PASS, 6 tests.

- [ ] **Step 8: Commit.** COMMIT `"feat: render a share image per locale with a real browser"` `src/share.ts src/share.test.ts scripts/render-images.ts public/og package.json pnpm-lock.yaml`

- [ ] **Step 9: Write the failing browser test.** Create `e2e/share.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { localeInfo, locales } from "../src/i18n/locales";
import {
  alternateOpenGraphLocales, openGraphLocale, shareImageMaxBytes, shareImagePath, shareImageSize,
} from "../src/share";
import { site } from "../src/site";
for (const locale of locales) {
  const { prefix } = localeInfo[locale];
  test(`${prefix} carries Open Graph and Twitter tags for link previews`, async ({ page, request }) => {
    await page.goto(prefix);
    const og = (p: string) => page.locator(`head meta[property="${p}"]`);
    const tw = (n: string) => page.locator(`head meta[name="${n}"]`);
    const title = await page.title();
    await expect(og("og:type")).toHaveAttribute("content", "website");
    await expect(og("og:site_name")).toHaveAttribute("content", site.name);
    await expect(og("og:title")).toHaveAttribute("content", title);
    await expect(og("og:description")).toHaveAttribute("content", /.{20,}/);
    await expect(og("og:locale")).toHaveAttribute("content", openGraphLocale[locale]);
    expect(await og("og:locale:alternate").evaluateAll((els) => els.map((e) => e.getAttribute("content"))))
      .toEqual(alternateOpenGraphLocales(locale));
    expect(new URL((await og("og:url").getAttribute("content")) ?? "").pathname).toBe(prefix);
    await expect(tw("twitter:card")).toHaveAttribute("content", "summary_large_image");
    await expect(tw("twitter:title")).toHaveAttribute("content", title);
    // Absolute URL (Facebook requires it). In tests it names site.url's
    // localhost:3000, so the file is fetched by path from the test server.
    const imageUrl = await og("og:image").getAttribute("content");
    expect(imageUrl).toMatch(/^https?:\/\//);
    expect(await tw("twitter:image").getAttribute("content")).toBe(imageUrl);
    const { pathname } = new URL(imageUrl ?? "");
    expect(pathname).toBe(shareImagePath(prefix));
    await expect(og("og:image:width")).toHaveAttribute("content", String(shareImageSize.width));
    await expect(og("og:image:height")).toHaveAttribute("content", String(shareImageSize.height));
    await expect(og("og:image:alt")).toHaveAttribute("content", new RegExp(`^${site.name} · `));
    const image = await request.get(pathname);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/png");
    const body = await image.body();
    expect(body.length).toBeLessThanOrEqual(shareImageMaxBytes);
    expect({ width: body.readUInt32BE(16), height: body.readUInt32BE(20) }).toEqual(shareImageSize);
  });
}
```

- [ ] **Step 10: See it fail.** BUILD+E2E `e2e/share.spec.ts`. Expected: FAIL ×3, `og:type` not found.

- [ ] **Step 11: Implement the tags.** In `src/app/[locale]/layout.tsx`, add the import and replace `generateMetadata`:

```tsx
import { alternateOpenGraphLocales, openGraphLocale, shareImagePath, shareImageSize } from "@/share";
export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale });
  const { prefix } = localeInfo[locale];
  const title = t("meta.title");
  const description = t("meta.description");
  // Relative URLs become absolute through metadataBase.
  const image = {
    url: shareImagePath(prefix),
    ...shareImageSize,
    type: "image/png",
    alt: `${site.name} · ${t("hub.tagline")}`,
  };
  return {
    metadataBase: new URL(site.url),
    title,
    description,
    alternates: {
      canonical: prefix,
      languages: {
        ...Object.fromEntries(locales.map((other) => [other, localeInfo[other].prefix])),
        "x-default": localeInfo[defaultLocale].prefix,
      },
    },
    openGraph: {
      type: "website",
      siteName: site.name,
      url: prefix,
      title,
      description,
      locale: openGraphLocale[locale],
      alternateLocale: alternateOpenGraphLocales(locale),
      images: [image],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}
```

- [ ] **Step 12: See it pass.** Same command as step 10, then `pnpm test:e2e e2e/locales.spec.ts` (canonical and hreflang unchanged). Expected: PASS.

- [ ] **Step 13: Commit.** COMMIT `"feat: Open Graph and Twitter tags for link previews"` `src/app/[locale]/layout.tsx e2e/share.spec.ts`

Not provable here: what Facebook, Messenger and WhatsApp show. `site.url` is the production address even on Preview deployments, so previews are checked after the merge deploys (manual checks 1-2).

---

### Task 3: A localized 404 page

**Files:** Create `src/app/[locale]/not-found.tsx`, `src/app/[locale]/[...rest]/page.tsx`, `e2e/not-found.spec.ts`. Modify `messages/ar-TN.json`, `messages/ar-Latn-TN.json`, `messages/fr.json`.

**Interfaces:** Consumes `localeInfo`, `isLocale`, `defaultLocale`; next-intl `getLocale`, `getTranslations`. Produces message keys `notFound.title`, `notFound.body`, `notFound.home`.

Read first: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md` (a segment's `not-found.tsx` renders inside its layout; a non-streamed `notFound()` answers 404 and Next adds `noindex`).

- [ ] **Step 1: Write the failing test.** Create `e2e/not-found.spec.ts`:

```ts
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import arLatnTN from "../messages/ar-Latn-TN.json";
import arTN from "../messages/ar-TN.json";
import fr from "../messages/fr.json";
import { localeInfo, locales } from "../src/i18n/locales";
const messages = { "ar-TN": arTN, "ar-Latn-TN": arLatnTN, fr };
for (const locale of locales) {
  const { prefix, dir } = localeInfo[locale];
  const strings = messages[locale].notFound;
  test(`${prefix}/… unknown page is a styled 404 in its language with a way back`, async ({ page }) => {
    const response = await page.goto(`${prefix}/nope-xyz`);
    expect(response?.status()).toBe(404);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    await expect(page.locator("html")).toHaveCSS("background-color", "rgb(11, 21, 16)");
    await expect(page.getByRole("heading", { level: 1, name: strings.title })).toBeVisible();
    await expect(page.getByText(strings.body)).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    const home = page.getByRole("link", { name: strings.home });
    await expect(home).toHaveAttribute("href", prefix);
    await home.click();
    await expect(page).toHaveURL(new RegExp(`${prefix}$`));
  });
}
test("a deep unknown path is a 404 too", async ({ request }) => {
  expect((await request.get("/fr/a/b/c")).status()).toBe(404);
});
test("an unknown path outside a language lands on the Derja 404", async ({ page }) => {
  const response = await page.goto("/nope-xyz");
  expect(response?.status()).toBe(404);
  await expect(page).toHaveURL(/\/ar\/nope-xyz$/);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});
```

- [ ] **Step 2: Add the draft strings** (so the test type-checks). Add a `notFound` object after `games` in each file. All nine values are DRAFTS (see "Strings for Jalel").

```json
  "notFound": { "title": "الصفحة هاذي موش موجودة", "body": "يمكن الرابط غالط ولا الصفحة تنحّات.", "home": "ارجع للألعاب" }
```
(`messages/ar-TN.json`)
```json
  "notFound": { "title": "El page hedhi mouch mawjouda", "body": "Ymken el lien ghalet wala el page tna77at.", "home": "Arja3 lel al3ab" }
```
(`messages/ar-Latn-TN.json`)
```json
  "notFound": { "title": "Cette page n'existe pas", "body": "Le lien est peut-être faux, ou la page a été retirée.", "home": "Retour aux jeux" }
```
(`messages/fr.json`)

Run `pnpm test src/i18n/messages.test.ts`. Expected: PASS (same keys everywhere, none empty, no Eastern digits).

- [ ] **Step 3: See the browser test fail.** BUILD+E2E `e2e/not-found.spec.ts`. Expected: the three locale tests FAIL (no `lang`, Next's English page); the deep-path test may already pass.

- [ ] **Step 4: Implement.** Create `src/app/[locale]/[...rest]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
// Unknown paths under a language (/ar/xyz) end here, so they render that
// language's not-found page inside the locale layout (right lang and dir)
// instead of Next's default one. Real routes such as /ar/chkoun win over
// this catch-all.
export default function UnknownPage(): never {
  notFound();
}
```

Create `src/app/[locale]/not-found.tsx`:

```tsx
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { defaultLocale, isLocale, localeInfo } from "@/i18n/locales";
export default async function NotFound() {
  const locale = await getLocale();
  const t = await getTranslations("notFound");
  const hub = localeInfo[isLocale(locale) ? locale : defaultLocale].prefix;
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col justify-center gap-6 px-5 py-12 sm:px-8">
      <p aria-hidden="true" className="text-7xl font-extrabold text-mint">
        404
      </p>
      <h1 className="text-4xl font-extrabold">{t("title")}</h1>
      <p className="max-w-2xl text-xl text-chalk-dim">{t("body")}</p>
      <Link
        href={hub}
        prefetch={false}
        className="flex min-h-11 items-center self-start rounded-full bg-mint px-5 text-base font-semibold text-pitch-950"
      >
        {t("home")}
      </Link>
    </main>
  );
}
```

- [ ] **Step 5: See it pass.** Same command as step 3, then `pnpm test:e2e e2e/locales.spec.ts -g 404`. Expected: PASS. If the status becomes 200, the response was streamed: check no `loading.tsx` sits above the catch-all and `UnknownPage` stays synchronous.

- [ ] **Step 6: Commit.** COMMIT `"feat: a 404 page in the visitor's language with a link back"` `src/app/[locale]/not-found.tsx "src/app/[locale]/[...rest]" messages e2e/not-found.spec.ts` (add a second `-m "Draft wording, to be replaced by Jalel before merge."`).

---

### Task 4: The language switcher at 320 px and with large text

**Files:** Modify `src/components/language-switcher.tsx`, `src/app/globals.css`, `e2e/hub.spec.ts`.

**Interfaces:** none new. The current language link carries `aria-current="page"`.

Size check (17 px root, Inter semibold, hub-audit 1.7 estimates): at 320 px the row has 320 − 2 × 21.25 = 277.5 px. With `px-3` (12.75 px a side) it needs 179 (labels) + 76.5 (padding) + 8.5 (gaps) + 8.5 (pill padding) ≈ 272.5 px: it fits at the default size, and wraps instead of scrolling when text is larger.

- [ ] **Step 1: Write the failing tests.** In `e2e/hub.spec.ts`, inside the `for (const locale of locales)` loop, replace the test `${prefix} fits a small phone without sideways scrolling` with:

```ts
  for (const { width, height, fontSize } of [
    { width: 320, height: 640, fontSize: 16 },
    { width: 320, height: 640, fontSize: 21 },
    { width: 360, height: 740, fontSize: 16 },
    { width: 360, height: 740, fontSize: 21 },
  ]) {
    test(`${prefix} fits ${width} px with a ${fontSize} px default font, no sideways scrolling`, async ({ page }) => {
      // 21 px ≈ 130 % of the default: the closest headless stand-in for a
      // large Android font setting (the real WebView is checked by hand).
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Page.setFontSizes", { fontSizes: { standard: fontSize } });
      await page.setViewportSize({ width, height });
      await page.goto(prefix);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
    });
  }
  test(`${prefix} follows the visitor's default font size`, async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: 20 } });
    await page.goto(prefix);
    await expect(page.locator("html")).toHaveCSS("font-size", "21.25px");
  });
  test(`${prefix} does not prefetch the other languages`, async ({ page }) => {
    const others = locales.filter((l) => l !== locale).map((l) => localeInfo[l].prefix);
    const prefetched: string[] = [];
    page.on("request", (r) => {
      if (others.includes(new URL(r.url()).pathname)) prefetched.push(r.url());
    });
    await page.goto(prefix, { waitUntil: "networkidle" });
    expect(prefetched).toEqual([]);
  });
```

In `the language switcher changes language and direction`, change `toHaveAttribute("aria-current", "true")` to `toHaveAttribute("aria-current", "page")`.

- [ ] **Step 2: See them fail.** BUILD+E2E `e2e/hub.spec.ts`. Expected FAIL: "follows the visitor's default font size" (17px), `aria-current`, prefetch (requests such as `/fr?_rsc=…`), and at least the 320 px / 21 px cases. If this Chrome rejects `Page.setFontSizes`, replace the two CDP lines with `await page.addInitScript(() => document.documentElement.style.setProperty("font-size", "138.125%"))` for the 21 px cases, drop the "follows" test, and say so in the commit.

- [ ] **Step 3: Implement.** In `src/app/globals.css`, in the `html` rule, replace `font-size: 17px;` with:

```css
  /* 17 px at the browser default, and it grows with the visitor's own
     font-size setting (WCAG 1.4.4). */
  font-size: 106.25%;
```

Replace `src/components/language-switcher.tsx`:

```tsx
import Link from "next/link";
import { localeInfo, locales, type Locale } from "@/i18n/locales";
type Props = { current: Locale; label: string };
// On a narrow screen or with large text the row wraps instead of scrolling
// sideways (WCAG 1.4.10). No prefetch: few visitors switch, and a full load
// is the surest way to swap <html lang dir>.
export function LanguageSwitcher({ current, label }: Props) {
  return (
    <nav aria-label={label} className="max-w-full">
      <ul className="flex flex-wrap justify-end gap-1 rounded-3xl bg-pitch-800 p-1">
        {locales.map((locale) => (
          <li key={locale}>
            <Link
              href={localeInfo[locale].prefix}
              prefetch={false}
              lang={locale}
              hrefLang={locale}
              aria-current={locale === current ? "page" : undefined}
              className="flex min-h-11 items-center rounded-full px-3 text-base font-semibold text-mint sm:px-4 aria-[current=page]:bg-mint aria-[current=page]:text-pitch-950"
            >
              {localeInfo[locale].label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 4: See them pass.** Same command as step 2. Expected: PASS. If a 21 px case still overflows, find the culprit with `await page.evaluate(() => [...document.querySelectorAll("*")].filter((e) => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; }).map((e) => e.tagName + "." + e.className))`. If it is the `h1` "Kora", change its classes in `src/app/[locale]/page.tsx` to `text-[clamp(3rem,22vw,4.5rem)] font-extrabold sm:text-9xl` and rerun.

- [ ] **Step 5: Commit.** COMMIT `"fix: switcher wraps on small screens; text follows the visitor's font size"` `src/components/language-switcher.tsx src/app/globals.css e2e/hub.spec.ts` (Lighthouse accessibility must stay at 1).

---

### Task 5: Fonts that do work

**Files:** Modify `src/app/[locale]/layout.tsx` (font declaration), `src/app/globals.css`. Create `e2e/fonts.spec.ts`.

**Interfaces:** none.

Read first: `node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md` (`preload`; a font declared in a layout is preloaded on every route below it).

Expected font bytes per first visit (file sizes measured in hub-audit §4; which files a browser fetches is estimated):

| Page | Before | After | vs. 200 KB budget |
| --- | --- | --- | --- |
| `/ar` | Inter Latin 48.4 + Plex Arabic 400/600/700 103.0 + Plex Latin about 43.2 = **about 194.6 KB** (97 %) | Inter Latin 48.4 + Plex Arabic 400/600/700 103.0 = **151.4 KB** (76 %) | pass |
| `/tn`, `/fr` | Inter 48.4 + Plex Arabic 400/600/700 103.0 = **151.4 KB** (all preloaded) | Inter 48.4 + Plex Arabic 600 35.9 (the "تونسي" label) = **84.3 KB** (42 %) | pass |

Trade-off: on `/ar` the Arabic files are no longer preloaded; they start when the CSS is parsed. With `font-display: swap` text paints at once in the fallback, so first paint is unchanged and the Plex swap may come slightly later. Lighthouse performance (≥ 0.9) guards it.

- [ ] **Step 1: Write the failing test.** Create `e2e/fonts.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import { localeInfo, locales } from "../src/i18n/locales";
// Chrome serialises unicode-range as "U+0-FF, …" for the Latin subset and
// "U+600-6FF, …" for Arabic.
const isLatin = (range: string) => /U\+0+-0*FF\b/i.test(range);
const isArabic = (range: string) => /U\+0*600-0*6FF\b/i.test(range);
async function loadedFaces(page: Page) {
  return page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts]
      .filter((f) => f.status === "loaded")
      .map((f) => ({ family: f.family, weight: f.weight, range: f.unicodeRange }));
  });
}
for (const locale of locales) {
  const { prefix } = localeInfo[locale];
  test(`${prefix} preloads one font file, the Latin face`, async ({ page }) => {
    await page.goto(prefix);
    await expect(page.locator('link[rel="preload"][as="font"]')).toHaveCount(1);
  });
}
test("/ar sets Latin fragments in Inter and Arabic in Plex", async ({ page }) => {
  await page.goto("/ar", { waitUntil: "networkidle" });
  const faces = await loadedFaces(page);
  const plex = faces.filter((f) => /Plex/i.test(f.family));
  expect(plex.filter((f) => isLatin(f.range))).toEqual([]);
  expect(plex.some((f) => isArabic(f.range))).toBe(true);
  expect(faces.some((f) => /Inter/i.test(f.family) && isLatin(f.range))).toBe(true);
});
for (const prefix of ["/tn", "/fr"]) {
  test(`${prefix} downloads one Arabic weight, for the switcher's label`, async ({ page }) => {
    await page.goto(prefix, { waitUntil: "networkidle" });
    const plex = (await loadedFaces(page)).filter((f) => /Plex/i.test(f.family));
    expect(plex.map((f) => f.weight)).toEqual(["600"]);
  });
}
```

- [ ] **Step 2: See it fail.** BUILD+E2E `e2e/fonts.spec.ts`. Expected: preload tests FAIL (4, not 1); `/ar` FAILS (Plex Latin faces loaded); `/tn` and `/fr` FAIL (`["400","600","700"]`). If `/ar` passes before the change, hub-audit 2.4's estimate that Plex Latin is fetched was wrong: keep the test as a guard and say so in the commit.

- [ ] **Step 3: Implement.** In `src/app/[locale]/layout.tsx`, replace the `arabic` declaration:

```tsx
// Not preloaded: one layout serves all three locales, and /tn and /fr only
// need the 600 weight for "تونسي". The browser fetches the Arabic files that
// the page's characters need (unicode-range) as soon as the CSS is parsed.
const arabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "600", "700"],
  variable: "--font-arabic",
  preload: false,
});
```

In `src/app/globals.css`, put this comment above the existing `@theme inline` block (whose stack is already Inter first) and delete the `html[dir="rtl"] body` rule and its comment:

```css
/* One stack for both directions. Inter has no Arabic letters, so Arabic falls
   through to IBM Plex Sans Arabic while names, scores and digits stay in
   Inter, even on /ar (hub-audit 2.4). */
```

- [ ] **Step 4: See it pass.** Same command as step 2, then `pnpm test:e2e e2e/hub.spec.ts` (P7 direction test, headings). Expected: PASS.

- [ ] **Step 5: Measure.** `bash check.sh`. Expected: `all checks passed`; in `.lighthouseci/*.json` (`resource-summary` audit), fonts about 151 KB on `/ar` and about 84 KB on `/tn` and `/fr`.

- [ ] **Step 6: Commit.** COMMIT `"perf: preload no Arabic font and set Latin text in Inter on every page"` `src/app/[locale]/layout.tsx src/app/globals.css e2e/fonts.spec.ts` with a second `-m "Fonts per first visit, Lighthouse: /ar N KB, /tn and /fr N KB."` carrying the measured numbers.

---

### Task 6: Site basics: robots, sitemap, manifest, icons, theme colour

**Files:** Create `src/app/robots.ts`, `src/app/sitemap.ts`, `src/app/manifest.ts`, `src/app/favicon.ico`, `src/app/apple-icon.png`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/maskable-512.png`, `src/site-files.test.ts`, `e2e/site-files.spec.ts`. Modify `src/site.ts`, `scripts/render-images.ts`, `src/app/[locale]/layout.tsx`, `e2e/locales.spec.ts`.

**Interfaces:** Consumes `site`, `localeInfo`, `locales`, `defaultLocale`; `mark`, `out`, `Page` from the Task 2 script. Produces `site.themeColor = "#0b1510"`.

Read first: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/{robots,sitemap,manifest,app-icons}.md`. Paths with a dot skip the Proxy (`src/proxy.ts` matcher), so these files are not redirected to `/ar`.

- [ ] **Step 1: Write the failing unit test.** Create `src/site-files.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import arTN from "../messages/ar-TN.json";
import manifest from "./app/manifest";
import robots from "./app/robots";
import sitemap from "./app/sitemap";
import { site } from "./site";
const file = (path: string) => readFileSync(new URL(path, import.meta.url));
const pngSize = (png: Buffer) => [png.readUInt32BE(16), png.readUInt32BE(20)];
const icons = [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
  { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];
describe("site files", () => {
  it("robots.txt allows everything but the API and names the sitemap", () => {
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: "/api/" },
      sitemap: `${site.url}/sitemap.xml`,
    });
  });
  it("the sitemap lists the three hubs, each with every language and x-default", () => {
    const languages = {
      "ar-TN": `${site.url}/ar`, "ar-Latn-TN": `${site.url}/tn`, fr: `${site.url}/fr`,
      "x-default": `${site.url}/ar`,
    };
    expect(sitemap()).toEqual(
      ["/ar", "/tn", "/fr"].map((p) => ({ url: `${site.url}${p}`, alternates: { languages } })),
    );
  });
  it("the manifest opens the Derja hub full screen in the site's colours", () => {
    expect(manifest()).toEqual({
      name: site.name, short_name: site.name, description: arTN.meta.description,
      lang: "ar-TN", dir: "rtl", start_url: "/ar", scope: "/", display: "standalone",
      background_color: site.themeColor, theme_color: site.themeColor, icons,
    });
  });
  it("the theme colour is the page background", () => {
    expect(file("./app/globals.css").toString("utf8")).toContain(`--color-pitch-950: ${site.themeColor};`);
  });
  it.each([
    ["../public/icons/icon-192.png", 192],
    ["../public/icons/icon-512.png", 512],
    ["../public/icons/maskable-512.png", 512],
    ["./app/apple-icon.png", 180],
  ])("%s is a %i px square PNG", (path, size) => {
    expect(pngSize(file(path))).toEqual([size, size]);
  });
  it("favicon.ico holds 16, 32 and 48 px images", () => {
    const ico = file("./app/favicon.ico");
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, 3]);
    expect([0, 1, 2].map((i) => ico.readUInt8(6 + 16 * i))).toEqual([16, 32, 48]);
  });
});
```

- [ ] **Step 2: See it fail.** `pnpm test src/site-files.test.ts`. Expected: FAIL, "Failed to resolve import ./app/manifest".

- [ ] **Step 3: Implement the routes.** In `src/site.ts`, add to the `site` object:

```ts
  // Same as --color-pitch-950 in src/app/globals.css (checked by a test).
  themeColor: "#0b1510",
```

Create `src/app/robots.ts`:

```ts
import type { MetadataRoute } from "next";
import { site } from "@/site";
// /admin is not listed: it carries noindex, and naming it here would both
// advertise it and stop crawlers from reading that noindex (decision H16).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${site.url}/sitemap.xml`,
  };
}
```

Create `src/app/sitemap.ts`:

```ts
import type { MetadataRoute } from "next";
import { defaultLocale, localeInfo, locales } from "@/i18n/locales";
import { site } from "@/site";
const absolute = (prefix: string) => `${site.url}${prefix}`;
// The three hubs with their language alternates, matching each page's
// hreflang links (decision P9). Games are added here as they ship.
export default function sitemap(): MetadataRoute.Sitemap {
  const languages = {
    ...Object.fromEntries(locales.map((l) => [l, absolute(localeInfo[l].prefix)])),
    "x-default": absolute(localeInfo[defaultLocale].prefix),
  };
  return locales.map((l) => ({ url: absolute(localeInfo[l].prefix), alternates: { languages } }));
}
```

Create `src/app/manifest.ts`:

```ts
import type { MetadataRoute } from "next";
import arTN from "../../messages/ar-TN.json";
import { defaultLocale, localeInfo } from "@/i18n/locales";
import { site } from "@/site";
// One manifest, in Derja (decision H15). Icons are rendered by
// scripts/render-images.ts from src/app/icon.svg.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.name,
    short_name: site.name,
    description: arTN.meta.description,
    lang: defaultLocale,
    dir: localeInfo[defaultLocale].dir,
    start_url: localeInfo[defaultLocale].prefix,
    scope: "/",
    display: "standalone",
    background_color: site.themeColor,
    theme_color: site.themeColor,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```

In `src/app/[locale]/layout.tsx`, change the type import to `import type { Metadata, Viewport } from "next";` and add after `generateStaticParams`:

```tsx
export const viewport: Viewport = { themeColor: site.themeColor };
```

- [ ] **Step 4: Add the icon renderer.** In `scripts/render-images.ts`, add `writeFileSync` to the `node:fs` import, add the code below before `const browser`, and call `await renderIcons(page);` after `await renderShareImages(page);` inside the `try`:

```ts
const glyph = mark.match(/<path[\s\S]*?\/>/)?.[0];
if (!glyph) throw new Error("no <path> in src/app/icon.svg");
// Full-bleed square for launchers that cut their own shape (Android
// maskable, iOS); the glyph is scaled into the maskable safe zone.
const fullBleed = (scale: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#101d16" />
   <g transform="translate(16 16) scale(${scale}) translate(-16 -16)">${glyph}</g></svg>`;
async function png(page: Page, svg: string, size: number): Promise<Buffer> {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<!doctype html><html><head><style>* { margin: 0; } html, body { background: transparent; }
     svg { display: block; inline-size: ${size}px; block-size: ${size}px; }</style></head><body>${svg}</body></html>`,
  );
  return page.screenshot({ type: "png", omitBackground: true });
}
// An ICO file wrapping PNG images (read by every current browser).
function ico(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size, 0);
    entry.writeUInt8(size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}
async function renderIcons(page: Page) {
  mkdirSync(out("public/icons"), { recursive: true });
  const write = (path: string, data: Buffer) => {
    writeFileSync(out(path), data);
    console.log(`${out(path)} (${data.length} bytes)`);
  };
  write("public/icons/icon-192.png", await png(page, mark, 192));
  write("public/icons/icon-512.png", await png(page, mark, 512));
  write("public/icons/maskable-512.png", await png(page, fullBleed(0.8), 512));
  write("src/app/apple-icon.png", await png(page, fullBleed(0.9), 180));
  const small = [];
  for (const size of [16, 32, 48]) small.push({ size, png: await png(page, mark, size) });
  write("src/app/favicon.ico", ico(small));
}
```

Run `pnpm images`. Expected: the three share-image lines (`git diff --stat public/og` shows no change, or bump the version only if they visibly changed) and five icon lines. Open `public/icons/maskable-512.png`: the "K" sits well inside the square.

- [ ] **Step 5: See the unit test pass.** `pnpm test src/site-files.test.ts`. Expected: PASS, 10 tests.

- [ ] **Step 6: Write the browser test.** Create `e2e/site-files.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { localeInfo, locales } from "../src/i18n/locales";
import { site } from "../src/site";
const pngSize = (png: Buffer) => [png.readUInt32BE(16), png.readUInt32BE(20)];
test("robots.txt is served and points to the sitemap", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/plain");
  expect(await response.text()).toMatch(/^Sitemap: \S+\/sitemap\.xml$/m);
});
test("sitemap.xml lists the three hubs with language alternates", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("xml");
  const xml = await response.text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  expect(locs).toEqual(locales.map((l) => localeInfo[l].prefix));
  expect(xml.match(/hreflang="x-default"/g)).toHaveLength(3);
});
test("the manifest and every icon it names are served", async ({ page, request }) => {
  await page.goto("/ar");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const response = await request.get(href ?? "");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("manifest+json");
  const manifest = await response.json();
  expect(manifest.start_url).toBe("/ar");
  for (const icon of manifest.icons) {
    const file = await request.get(icon.src);
    expect(file.status(), icon.src).toBe(200);
    expect(file.headers()["content-type"]).toBe("image/png");
    expect(pngSize(await file.body())).toEqual((icon.sizes as string).split("x").map(Number));
  }
});
test("pages name a home-screen icon and a theme colour", async ({ page, request }) => {
  await page.goto("/fr");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", site.themeColor);
  const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  const file = await request.get(apple ?? "");
  expect(file.status()).toBe(200);
  expect(pngSize(await file.body())).toEqual([180, 180]);
});
test("/favicon.ico exists for clients that ask for it blindly", async ({ request }) => {
  const response = await request.get("/favicon.ico");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/icon/);
});
```

In `e2e/locales.spec.ts`, replace `every page names an icon that exists` (there are now two `rel="icon"` links, and `getAttribute` on two matches breaks Playwright's strict mode):

```ts
test("every icon a page names exists", async ({ page, request }) => {
  await page.goto(localeInfo[defaultLocale].prefix);
  const hrefs = await page.locator('link[rel="icon"]').evaluateAll((links) => links.map((l) => l.getAttribute("href")));
  expect(hrefs.length).toBeGreaterThanOrEqual(2);
  for (const href of hrefs) {
    const icon = await request.get(href!);
    expect(icon.status(), href!).toBe(200);
    expect(icon.headers()["content-type"]).toMatch(/^image\//);
  }
});
```

- [ ] **Step 7: Run it.** BUILD+E2E `e2e/site-files.spec.ts e2e/locales.spec.ts`. Expected: PASS. (The red state of this task is step 2; to also see the browser tests red, run them once before step 3.)

- [ ] **Step 8: Commit.** COMMIT `"feat: robots, sitemap, web manifest, home-screen icons and theme colour"` `src/app/robots.ts src/app/sitemap.ts src/app/manifest.ts src/app/favicon.ico src/app/apple-icon.png public/icons src/site.ts src/site-files.test.ts scripts/render-images.ts src/app/[locale]/layout.tsx e2e/site-files.spec.ts e2e/locales.spec.ts` (Lighthouse SEO and best-practices must not fall).

---

### Task 7: Security headers

**Files:** Create `src/security-headers.ts`, `src/security-headers.test.ts`, `e2e/security.spec.ts`. Modify `next.config.ts`.

**Interfaces:** Consumes `posthogEuHost` (Task 1). Produces `securityHeaders(options: { analyticsHost: string; dev: boolean }): { key: string; value: string }[]` and `reportOnlyPolicy(options): string`.

Read first: `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md` ("Without Nonces", "Static vs Dynamic Rendering") and `.../05-config/01-next-config-js/headers.md`. On Node 24, Next loads `next.config.ts` with Node's own TypeScript support (`02-typescript.md`, "Node.js Native TypeScript Resolver"), so the config may import only relative `.ts` files without path aliases.

- [ ] **Step 1: Write the failing unit test.** Create `src/security-headers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { reportOnlyPolicy, securityHeaders } from "./security-headers";
const production = { analyticsHost: "https://eu.i.posthog.com", dev: false };
describe("securityHeaders", () => {
  it("sends exactly these headers", () => {
    expect(securityHeaders(production)).toEqual([
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
      { key: "Content-Security-Policy-Report-Only", value: reportOnlyPolicy(production) },
    ]);
  });
});
describe("reportOnlyPolicy", () => {
  it("allows only this site, plus PostHog's EU hosts for analytics calls", () => {
    expect(reportOnlyPolicy(production)).toBe(
      [
        "default-src 'self'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:", "font-src 'self'",
        "connect-src 'self' https://eu.i.posthog.com https://eu-assets.i.posthog.com",
        "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
      ].join("; "),
    );
  });
  it("allows eval in development only (React's dev tooling needs it)", () => {
    expect(reportOnlyPolicy({ ...production, dev: true })).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval';");
    expect(reportOnlyPolicy(production)).not.toContain("unsafe-eval");
  });
  it("follows a custom analytics host", () => {
    expect(reportOnlyPolicy({ analyticsHost: "https://ph.example/x", dev: false })).toContain(
      "connect-src 'self' https://ph.example;",
    );
  });
});
```

- [ ] **Step 2: See it fail.** `pnpm test src/security-headers.test.ts`. Expected: FAIL, "Failed to resolve import ./security-headers".

- [ ] **Step 3: Implement.** Create `src/security-headers.ts`:

```ts
// Response headers for every path (hub-audit 4.6). Loaded by next.config.ts
// through Node's type stripping: no imports, no path aliases.
type Options = { analyticsHost: string; dev: boolean };
type Header = { key: string; value: string };
// Safe to enforce now: nothing frames Kora, and it has no plugins, base tags
// or forms that post elsewhere.
const enforced = ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"].join("; ");
function analyticsSources(host: string): string[] {
  const origin = new URL(host).origin;
  // PostHog's EU cloud serves remote config from a separate assets host.
  return origin === "https://eu.i.posthog.com" ? [origin, "https://eu-assets.i.posthog.com"] : [origin];
}
// The full policy, reported but not enforced until it graduates (decision
// H18). 'unsafe-inline' scripts: the hub is prerendered, and nonces would
// make every page render per request (Next's CSP guide). PostHog loads no
// script of its own (disable_external_dependency_loading).
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
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
    { key: "Content-Security-Policy", value: enforced },
    { key: "Content-Security-Policy-Report-Only", value: reportOnlyPolicy(options) },
  ];
}
```

In `next.config.ts`, add the two imports at the top and a `headers()` method after the `turbopack` block (keep the existing comment and alias unchanged):

```ts
import { posthogEuHost } from "./src/analytics/hosts.ts";
import { securityHeaders } from "./src/security-headers.ts";
  // inside nextConfig, after turbopack:
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders({
          analyticsHost: process.env.NEXT_PUBLIC_POSTHOG_HOST || posthogEuHost,
          dev: process.env.NODE_ENV === "development",
        }),
      },
    ];
  },
```

If `pnpm build` cannot load the config because of these imports, move `posthogEuHost`'s value and the builder into `next.config.ts` itself, export them, point the unit test at `../next.config`, and record why in the commit.

- [ ] **Step 4: See it pass.** `pnpm test src/security-headers.test.ts && pnpm typecheck`. Expected: PASS, 4 tests; typecheck exits 0.

- [ ] **Step 5: Write the browser test.** Create `e2e/security.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { securityHeaders } from "../src/security-headers";
const expected = securityHeaders({ analyticsHost: "https://eu.i.posthog.com", dev: false });
type Probe = { cspViolations: string[] };
for (const path of ["/ar", "/tn", "/fr", "/ar/nope", "/og/ar-v1.png", "/robots.txt"]) {
  test(`${path} sends the security headers`, async ({ request }) => {
    const headers = (await request.get(path)).headers();
    for (const { key, value } of expected) expect(headers[key.toLowerCase()], key).toBe(value);
  });
}
// Report-only violations still fire the event, so this shows the policy would
// not break the hub once enforced. PostHog is not loaded in tests (no key):
// the owner checks that part on a Preview deployment.
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
    expect(await page.evaluate(() => (window as unknown as Probe).cspViolations)).toEqual([]);
  });
}
```

- [ ] **Step 6: Run it.** BUILD+E2E `e2e/security.spec.ts`. Expected: PASS ×10. (To see red first, run it before step 3's `next.config.ts` change: header tests FAIL with `undefined`.) If a violation test fails, read the directive and URL and fix the cause, or widen one directive with a comment saying why; never delete the test.

- [ ] **Step 7: Commit.** COMMIT `"feat: security headers, with the full content policy in report-only mode"` `src/security-headers.ts src/security-headers.test.ts next.config.ts e2e/security.spec.ts` (best-practices must not drop; the axe tests inject through Playwright, which CSP does not block).

**How the policy graduates (a later one-commit change, not on this branch):**
1. This branch merged with the violation tests green.
2. Jalel sets `NEXT_PUBLIC_POSTHOG_KEY` on the **Preview** environment, opens a Preview `/ar` in desktop Chrome with DevTools, and sees no `[Report Only]` console lines except Vercel's preview toolbar (`vercel.live`, preview only: add `https://vercel.live` to `script-src`, `connect-src` and `frame-src` when `VERCEL_ENV === "preview"`, or turn the toolbar off in Vercel).
3. Jalel opens production in the Facebook app on his phone and the page works (manual check 3).
4. Then: drop the `enforced` entry, rename `Content-Security-Policy-Report-Only` to `Content-Security-Policy`, update the unit and header tests; keep the violation tests (they then catch real blocks).
No reporting endpoint is added: it would be a new third-party connection (Sentry's CSP endpoint needs a key in the page) for little gain at this traffic.

---

## What headless checks cannot prove

- What Facebook, Messenger and WhatsApp previews show (crawler caching, WhatsApp's undocumented size limit, square crop).
- That the Derja in the share images looks right: Chromium shapes and orders it, but a person must look.
- TalkBack's voice for `ar-TN`, `ar-Latn-TN` and `fr`, and how Arabizi digits sound on the 404 page.
- Android's system font scale inside the Facebook WebView (tests raise Chromium's default font size instead).
- PostHog under the report-only policy with a real key, and what Meta's in-app browser injects.
- How launchers crop the maskable icon; how iOS shows the Apple icon.
- That the PostHog and Sentry project settings (server hash mode, IP discard) are on: they are not in the repo.

## Manual checks for the owner's phone (after the merge deploys, about 15 minutes)

1. **(3 min)** On a computer, paste `https://kora-tn.vercel.app/ar`, `/tn` and `/fr` into Facebook's Sharing Debugger and press "Scrape Again". Expect image, title and description in each language and no `og:locale` warning (if `ar_AR` is rejected, tell Claude: H7).
2. **(2 min)** Send each link to yourself in Messenger and WhatsApp. Expect a card with the image; note whether WhatsApp shows a small square or a wide image.
3. **(2 min)** Open the `/ar` link from Messenger (Facebook's in-app browser). The page looks as before; the switcher works.
4. **(2 min)** Open `https://kora-tn.vercel.app/ar/xyz`, `/fr/xyz`, `/xyz`. Expect the dark 404 in Derja (right to left), French, then Derja again, each with a button back to the hub.
5. **(2 min)** Settings → Display → Font size to the largest; reopen `/ar`, `/tn`, `/fr`. Nothing scrolls sideways; the switcher may sit on two lines. Reset the font size.
6. **(2 min)** TalkBack on `/ar/xyz`, then `/tn/xyz`: listen to the heading, the sentence and the button. Note anything unclear for the wording.
7. **(1 min)** In Chrome (not the Facebook app): menu → Add to home screen. Expect the "K" on a dark square and the app opening on `/ar` without the address bar.
8. **(1 min)** Look at the three share images in the pull request: is the Derja tagline right?

## Out of scope

- Screen-reader voice for Arabizi (hub-audit 2.6): phone test first, then a wording decision.
- `h1` clamp (1.8) unless Task 4's 21 px test forces it; forced-colours marker on the current language (1.2); heading before the badge in cards (1.4); explicit `dir="ltr"` on score names instead of relying on `bdi` (2.1).
- French no-break spaces before "?" and ":" (2.2): a wording change for Jalel.
- Excluding `docs/` from Tailwind's scan (2.3); the contrast figure in the `globals.css` comment (1.3).
- JSON-LD `WebSite` (3.6); 308 for `/` (3.7); JavaScript size (4.2).
- Next's experimental `global-not-found.js` for dotted paths outside a locale (H9).
- Per-game share cards (launch-readiness D2, S3-S4), the privacy page, the Sources page, share fallbacks for the WebView (D1), and the PostHog and Sentry project settings themselves (owner checklist in Task 1).
- A CSP reporting endpoint and the enforcement switch (end of Task 7).
