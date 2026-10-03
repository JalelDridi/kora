# Kora: daily Tunisian football games. Design

Date: 3 October 2026 · Status: proposed; decisions D1–D8 open for Jalel. Working name "Kora" (كرة, the ball); the real name is decision D1.

## 1. Why

Football is Tunisia's sport and Facebook is its town square: 9.1 million Tunisians are on Facebook, Espérance's page alone has 2.3 million followers. Daily guessing games (Wordle, Who Are Ya?, NBA 82-0's Hoople) grew on one mechanic: the same puzzle for everyone, once a day, with a result you can paste anywhere. Nobody has built that for Tunisian football. The existing Tunisian fantasy game is a different, heavier product.

The goal is real users, measured, not a demo. Secondary goal: a project that shows engineering depth a recruiter can see.

## 2. Terminology

| Term | Meaning |
| --- | --- |
| Puzzle | One day's mystery player. Same for everyone. Changes at 00:00 Africa/Tunis. |
| Pool | The set of players a puzzle can be drawn from and that a guess can name. |
| Guess | One player name submitted. A puzzle allows 8 guesses. |
| Clue tiles | The row shown after each guess: Club, Country of club, Position, Age, Caps, Governorate. Green exact, amber close, grey wrong, arrows for higher/lower. |
| Streak | Consecutive days with a solved puzzle. Kept on the device; synced if signed in. |
| Share grid | The emoji summary of a finished puzzle (🟩🟨⬜, guesses used, streak), copied to Facebook, WhatsApp, Messenger. |
| Season | A calendar month. Leaderboards reset per season. |
| Mode | A game type. Launch with one: Guess the Player. Later: Career Path, Higher or Lower. |

## 3. The game (launch scope)

**Guess the Player.** One Tunisian player a day. The pool: Tunisian internationals since 2000, current Ligue 1 squads, Tunisians playing abroad. About 300 curated players at launch.

Each guess shows six tiles:

| Tile | Exact | Close | Wrong |
| --- | --- | --- | --- |
| Club | same club | same country's league | otherwise |
| Country of club | same | same confederation | otherwise |
| Position | same | same line (defence, midfield, attack) | otherwise |
| Age | same | within 2 years, with ↑/↓ | ↑/↓ |
| Caps (national team) | same band | adjacent band, with ↑/↓ | ↑/↓ |
| Governorate of birth | same | same region (north, centre, south) | otherwise |

Eight guesses. Autocomplete over the pool in Arabic, French and English spellings (ملعب الرياضي, Hannibal Mejbri, Mejbri). After solving or failing: the player card (photo when licensed, club, caps, a one-line fact), the share grid, streak, and "come back at midnight" with a countdown.

**Not at launch:** accounts beyond an anonymous id, other modes, prizes, ads, comments.

## 4. Data

| Source | Use | Licence |
| --- | --- | --- |
| Wikidata (SPARQL) | Seed: name in ar/fr/en, birth date and place, positions, clubs with dates, national team caps, photo reference | CC0 |
| Wikimedia Commons | Player photos, only those under CC BY / CC BY-SA, with attribution shown on the card | per file |
| Curated overrides (`data/players.json` in the repo) | Corrections and additions you verify by hand: current club, caps, shirt name, retired flag | ours |
| Players' own reports | A "something is wrong" button creates a review item | ours |

Pipeline: a nightly GitHub Actions job runs the SPARQL query, normalises the result, merges the overrides, writes `data/pool.json` and a diff; a pull request is opened when anything changed, so every data change is reviewed and versioned. The app reads the pool from the database, which the deploy seeds. Provenance (which source said what, when) is stored per field.

Wikidata is incomplete for the current season (clubs lag by months); the overrides file is the fix, and the report button is how the audience keeps it right. Governorate comes from place of birth, resolved through Wikidata's administrative hierarchy.

Puzzle schedule: a seeded shuffle of the pool, 365 days ahead, stored in the database, with manual pins (a player's birthday, a derby day). The answer for a day is never sent to a client before midnight of the next day.

## 5. Product and interface

- Mobile first; most visits will come from Facebook's in-app browser on Android. 375px layout is the design target; desktop is a centred column.
- Languages: Arabic (RTL) and French, switchable; Arabic default (D2). Player names shown in the chosen script with the Latin spelling underneath.
- Identity: anonymous id in local storage from the first visit, so streaks work with no sign-up. Optional sign-in (D3) only to keep a streak across devices and to appear on the leaderboard with a name.
- Leaderboard: weekly and monthly, points by guesses used and streak; anonymous players appear as "Visitor from Bizerte" style labels only if they opt in.
- Share grid: text first (works everywhere), plus an OG image per result for links.
- PWA: installable, works offline for today's puzzle once loaded.
- Accessibility: tiles carry text labels, not colour alone; keyboard play; reduced-motion respected.
- Visual direction: large type, one bold accent, the red of the national shirt on a dark pitch green; Arabic set in a proper Arabic typeface (IBM Plex Sans Arabic), Latin in Geist. Mockups in the report.

## 6. Architecture and stack

| Layer | Choice | Why |
| --- | --- | --- |
| App | Next.js 16 (App Router), TypeScript, Tailwind 4 | the stack of the other two projects; Vercel-native |
| Hosting | Vercel Hobby, region fra1 | free; non-commercial use is allowed; cron and edge included |
| Database | Neon Postgres (free), Prisma | pool, schedule, results, reports, accounts |
| Cache and leaderboards | Upstash Redis (free tier via Vercel marketplace) | sorted sets for leaderboards, rate limits, today's puzzle metadata |
| i18n | next-intl, RTL layout | ar and fr |
| Auth (D3) | Auth.js with Google | free, familiar to the audience |
| Analytics | PostHog Cloud free tier, cookieless mode | funnels, retention, no banner needed |
| Errors | Sentry (Student Pack: 50k errors, 1 year) | |
| Domain | Student Pack: Name.com free domain, or Namecheap .me (D1) | |
| CI | GitHub Actions: lint, typecheck, unit, Postgres tests, Playwright, Lighthouse budget | |
| Data job | GitHub Actions nightly, opens a PR | reviewed data |

Game engine: pure TypeScript module `engine/` with no I/O: `evaluate(guess, answer) → tiles`, `score(guesses, streak)`, `scheduleFor(date, pool, seed)`. Property tests: evaluating the answer against itself is all green; tiles are symmetric where they should be; a schedule never repeats a player within 90 days.

Request flow: the page is static with ISR per day (puzzle id, pool for autocomplete, no answer). A guess is a server action: rate-limited per anonymous id and IP, evaluated server-side, result stored, tiles returned. Nothing on the client can reveal the answer; the pool sent to the client has names only.

## 7. Where the technical depth is

1. A data pipeline with provenance, review by pull request, and an audience feedback loop.
2. A server-authoritative game engine with property-based tests and a deterministic, time-zone-correct schedule.
3. Leaderboards and rate limits on Redis sorted sets; the same idempotency habits as Payout Ledger (a result is written once per player per day).
4. RTL Arabic plus French, with correct number and date formatting, in one layout.
5. Share images generated at the edge; a Lighthouse budget enforced in CI for 3G Android.
6. Measured growth: funnels (open, first guess, solved, shared), D1 and D7 retention, by language.
7. Abuse handling without accounts: anonymous ids, per-IP limits, no answer in any response until the day ends.

## 8. Measuring use

PostHog events: `puzzle_opened`, `guess_made`, `puzzle_solved`, `puzzle_failed`, `result_shared` (with channel), `language_changed`, `signed_in`. Dashboards: daily players, solve rate, average guesses, share rate, D1/D7 retention, language split, device split. Targets for the first month: 500 daily players, 25% share rate, 30% D7 retention. Growth plan: you post the share grid in the two or three biggest fan groups on launch day and after each derby; the game posts nothing by itself.

## 9. Costs

Zero in money. Vercel Hobby, Neon free, Upstash free, PostHog free (1 million events a month), Sentry and the domain from the Student Pack. The Hobby plan forbids commercial use, so no ads and no prizes; if that ever changes, Vercel Pro is the first paid item.

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| Data wrong for current clubs | overrides file, report button, nightly diff PR |
| Facebook in-app browser quirks | test in it; no features that need a full browser |
| Nobody shares | the share grid is the product; measure share rate from day one and iterate on it |
| Photos' licences | only CC BY / CC BY-SA from Commons, attribution on the card; silhouettes otherwise |
| Name disputes | avoid club names and trademarks in the product name |

## 11. Decisions for Jalel

| # | Decision | Options | Recommendation |
| --- | --- | --- | --- |
| D1 | Name and domain | "Kora" family (kora.me via Namecheap; koratounsia.app via Name.com), "Dawri", "El La3eb" ("the player"), your own | a short Arabic-sounding name that is not a club's; check the domain is free in the pack first |
| D2 | Default language | Arabic / French | Arabic default, French one tap away |
| D3 | Accounts | anonymous only / anonymous + optional Google sign-in | anonymous + optional Google, built in phase 2 |
| D4 | Pool scope | Tunisian players only / also foreign players in Ligue 1 | Tunisian players only at launch |
| D5 | Photos | use Commons photos where licensed / silhouettes only | licensed photos, silhouettes as fallback |
| D6 | Analytics | PostHog cookieless / Umami / Vercel Analytics | PostHog cookieless |
| D7 | Launch channel | you post in fan groups / a dedicated Facebook page / both | both: a page for the game, and you share it |
| D8 | Second mode after launch | Career Path / Higher or Lower / none yet | Career Path, decided from the week-one data |

## 12. Phases

1. **Foundation (days 1–3):** repo, CI, engine with property tests, data pipeline producing the first pool, schedule generator.
2. **The game (days 4–7):** the page in ar and fr, server-side guessing, share grid, streaks, PWA, Playwright, Lighthouse budget, PostHog, Sentry, domain, launch.
3. **Keep them (days 8–12):** leaderboards on Redis, optional sign-in, OG result images, report button and review queue, first data PR from the nightly job.
4. **Grow (after week two):** second mode (D8), derby-day pins, Facebook page content, retention work from the numbers.
