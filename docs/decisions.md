# Decisions

What Jalel decided, and when. The options behind D1–D10 are in the design, §14.

## 4 October 2026: "start planning with your recommendations"

| #   | Decision         | Outcome                                                                                                |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------ |
| D1  | Name and domain  | Working name Kora; repo `JalelDridi/kora`; `kora-tn.vercel.app` until a Student Pack domain is claimed |
| D2  | Default language | Derja in Arabic script; Arabizi and French one tap away                                                |
| D3  | Accounts         | Anonymous at launch; optional Google sign-in in Sprint 5                                               |
| D4  | Pool scope       | Tunisian players only at launch                                                                        |
| D5  | Photos           | Licensed Commons photos with credit; silhouettes as fallback                                           |
| D6  | Analytics        | PostHog, cookieless                                                                                    |
| D7  | Launch channel   | Fan groups and a page for the game                                                                     |
| D8  | Launch set       | Chkoun?, 30–0, Aktar wala A9all                                                                        |
| D9  | AI at runtime    | Coach's report on, with a quota, then templates                                                        |
| D10 | Duel transport   | PartyKit on Cloudflare, in Sprint 6                                                                    |

## Sprint 0

| #   | Decision                       | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2  | Locale ids and URLs            | `/ar` → `ar-TN`, `/tn` → `ar-Latn-TN`, `/fr` → `fr`. Not `aeb`: browsers, screen readers and hreflang do not know it                                                                                                                                                                                                                                                                                                                          |
| P3  | The root address               | Always opens Derja in Arabic script; no browser-language detection                                                                                                                                                                                                                                                                                                                                                                            |
| P5  | Error tracking and analytics   | Sentry on the server only; posthog-js loaded lazily when a key exists. Revisit in Sprint 4                                                                                                                                                                                                                                                                                                                                                    |
| P7  | The simulator's name           | "30–0" in every language (Western digits everywhere)                                                                                                                                                                                                                                                                                                                                                                                          |
| P8  | next-intl without its plugin   | The alias the plugin would set is written directly in next.config.ts, because the plugin loads @swc/core, which will not load on the development machine. Confirmed by Jalel on 4 October 2026                                                                                                                                                                                                                                                |
| P9  | Language alternates            | Announced once, in the page head (canonical, one alternate per locale, x-default → /ar); next-intl's Link header is off. Confirmed by Jalel on 4 October 2026                                                                                                                                                                                                                                                                                 |
| P10 | Preview deploys and migrations | A separate Neon branch (`preview`) for Vercel's Preview environment, so a pull request's migration never touches the production schema. Production and Preview each have their own `DATABASE_URL` and `DATABASE_URL_UNPOOLED` in Vercel; every build runs prisma migrate deploy against its own branch. All pull requests share the one preview branch. Hosted database values are kept out of .env.local. Decided by Jalel on 4 October 2026 |

## 4 October 2026: before the first push

| #   | Decision              | Outcome                                                                                                                                                                                     |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P11 | Repository            | Public `JalelDridi/kora` from the first push, with a pull request per sprint                                                                                                                |
| P12 | Hosting               | Vercel project `kora-tn` (`kora-tn.vercel.app`); Neon project `kora` in Frankfurt                                                                                                           |
| P13 | Hub wording           | The hub goes live with draft strings; Jalel rewrites them before the public launch                                                                                                          |
| P14 | Sprint 1 data sources | Wikidata (identity), English and French Wikipedia infoboxes (caps, clubs), Commons (photos), a CC0 results dataset, and overrides Jalel reviews. No scraping of sites whose terms forbid it |
| P15 | Favicon               | A simple "K" mark for now; replaceable at any time                                                                                                                                          |
