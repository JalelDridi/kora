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

| #   | Decision                     | Outcome                                                                                                              |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| P2  | Locale ids and URLs          | `/ar` → `ar-TN`, `/tn` → `ar-Latn-TN`, `/fr` → `fr`. Not `aeb`: browsers, screen readers and hreflang do not know it |
| P3  | The root address             | Always opens Derja in Arabic script; no browser-language detection                                                   |
| P5  | Error tracking and analytics | Sentry on the server only; posthog-js loaded lazily when a key exists. Revisit in Sprint 4                           |
| P7  | The simulator's name         | "30–0" in every language (Western digits everywhere)                                                                 |
