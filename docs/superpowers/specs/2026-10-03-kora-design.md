# Kora: Tunisian football games. Design (v2)

Date: 4 October 2026 · Status: proposed; decisions D1–D10 open for Jalel. Working name "Kora"; the real name is decision D1. v2 adds: a hub of several games copied from the best sites, Tunisian Derja, an AI layer, and the real-time technology per game.

## 1. Why

Football is Tunisia's sport and Facebook is its square: 9.1 million Tunisians on Facebook, Espérance's page alone has 2.3 million followers. The best football and basketball game sites (playfootball.games, NBA 82-0, Immaculate Footy, KitTok) grew on daily puzzles with a shareable result, endless streak games, and one viral simulator. Nobody has built any of it for Tunisian football, and nobody writes games in Derja.

Goal: real, measured Tunisian users. Second goal: engineering a recruiter can see.

## 2. What the top sites do (teardown, 4 October 2026)

| Site | Shape | Games | What to copy |
| --- | --- | --- | --- |
| **NBA 82-0** (viral in 2026, covered by ESPN, SI, Yahoo) | Dark hub: hero, "Today's puzzles" strip, grid of mode cards with a badge (Daily, Endless, Quiz, Timed, Predict), leaderboard "Today's top sides", Hall of Fame saved on device | 82-0 squad builder and season sim; Hoople (guess in 8); Guess the Player (7 clues, fewer = more points); Draft Class; Higher or Lower; Efficiency Duel; Bracket; Career Path; Beat the Clock; Score Predictor | the hub layout, the mode badges, the simulator as the viral centre, daily strip |
| **playfootball.games** | Purple hub, league pickers, daily and multiplayer sections | Who Are Ya? (photo + attribute tiles), Box2Box (3×3 grid), Missing XI, Career Path, Football Wordle, Tiki-Taka-Toe (multiplayer), Football Bingo, Connections | Who Are Ya? tiles, Missing XI, the multiplayer duel |
| **Immaculate Footy** (FBref) | One game done perfectly | 3×3 grid of clubs × criteria, nine guesses, rarity score | the grid mechanic and the rarity score |
| **KitTok**, **Football Transfer Quiz**, **higherorlowergame.com** | single games | reveal-the-kit, guess from transfers, market-value higher/lower | kit reveal, transfer trail, endless higher/lower |

Common pattern: free, no login, dark theme, one accent colour, emoji share grid, resets at midnight, archive of past puzzles, "saved on this device" leaderboards, light ads (we will not run ads: Vercel Hobby terms, and the portfolio reads better without).

## 3. The games

Launch with three; add the rest in order. Names are working names in Derja (Arabic script, Arabizi, French).

| # | Game | Derja name | Type | Mechanic | Data needed | Real-time |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **Chkoun?** | شكون؟ · Chkoun? · C'est qui ? | Daily | Who Are Ya / Hoople: one mystery Tunisian player, 8 guesses, tiles: club, country of club, position, age, caps, governorate | pool | none; midnight rollover without refresh |
| 2 | **30–0** | ٣٠–٠ · 30-0 · 30–0 | Simulator | 82-0 clone: spin a Ligue 1 club and an era, draft a legend into each of 11 positions from that club's history, simulate a 30-match season. Share the squad and the record. "Today's top sides" board | pool with club history and a rating per player | leaderboard updates live (SSE) |
| 3 | **Aktar wala A9all** | أكثر ولا أقل · Aktar wala a9all · Plus ou moins | Endless | Higher or Lower: more caps, goals, trophies? Keep the streak | pool stats | none |
| 4 | **Masira** | المسيرة · Masira · Carrière | Daily | Career Path: clubs revealed one by one, name the player, fewer = more points | club history | none |
| 5 | **Box 3×3** | الشبكة · Chabka · Grille | Daily | Immaculate grid: rows and columns are clubs, trophies, eras; nine guesses, rarity score | club history, honours | none |
| 6 | **El 11** | الحداش · El 7dach · Le onze | Daily | Missing XI: a famous Tunisia or derby line-up (2004 final, 1978 World Cup, a Champions League final); name the eleven | curated line-ups | none |
| 7 | **Tbannen** | تبنّن · Tbannen · Pronostics | Predict | Score Predictor for national-team and derby matches; live points as the match goes | fixtures and scores (manual entry at first) | live scores (SSE) |
| 8 | **Duel** | ديول · Duel · Duel | Multiplayer | Tiki-Taka-Toe: two players, a 3×3 of clubs and criteria, take turns in real time, invite link | club history | WebSockets (PartyKit) |

Game 1 is detailed in §4. Game 2 is the growth bet: 82-0's authors said the simulator, not the puzzles, went viral. Ratings are computed, not invented: caps, goals, honours and era weight, published on each card so arguments can happen in the comments.

## 4. Chkoun? in detail

Pool: Tunisian internationals since 2000, current Ligue 1 squads, Tunisians abroad; about 300 curated players. Eight guesses. Six tiles per guess: Club (green same, amber same country), Country of club (amber same confederation), Position (amber same line), Age (amber within 2, arrows), Caps band (amber adjacent, arrows), Governorate of birth (amber same region). Autocomplete accepts Arabic, Arabizi and French spellings. After the game: player card, share grid, streak, countdown; at 00:00 Africa/Tunis the page rolls to the new puzzle on its own.

## 5. Language: Derja first

Research: on Tunisian Facebook, 53% of comments are in Arabizi (Latin letters with 3, 7, 9), 34% in Arabic script, 13% mixed. Modern Standard Arabic is read, but nobody plays in it.

- Three UI languages: **Derja in Arabic script** (شكون اللاعب؟), **Derja in Arabizi** (Chkoun el la3eb?), **French**. Default is decision D2.
- Copy is written in Derja by a native speaker (you), reviewed by one more Tunisian before launch; no machine translation in the UI.
- Player names: shown in the chosen script with the Latin spelling underneath; search accepts all three.
- Numbers: Western digits everywhere (that is how Tunisians write scores).

## 6. The AI layer (free tiers only)

| Feature | What | How | Cost |
| --- | --- | --- | --- |
| **A1 · Hint of the day** | After guess 4, one hint in Derja ("لعب في الدربي 2019") generated from the player's Wikipedia text | generated nightly for tomorrow's puzzle by the data job with Gemini's free tier, stored in the database, shown from cache; you can edit it in the review queue | 0; one call per day |
| **A2 · Coach's report** | After a game, a two-line post-match report in Derja about your guesses ("بديت بالحارس، كان لازم تبدا بالدفاع") to paste with the share grid | generated at request time, cached by (puzzle, guess pattern); Gemini free tier (1,500 requests/day), falls back to a template when the quota is hit | 0 up to about 1,000 games/day; then templates |
| **A3 · Name understanding** | "mejbri", "مجبري", "Hannibal", "hanibal" all find the player | not an LLM: a transliteration table Arabizi → Arabic phonemes plus fuzzy matching; tested against a list of 200 real misspellings from Facebook | 0 |
| **A4 · Review assistant** | Turns player reports ("he moved to Al-Ahli in July") into proposed override entries for you to accept | nightly batch with Gemini free tier; nothing changes without your click | 0 |

Why these and not a chatbot: they are cheap, bounded, measurable (hint-open rate, report-share rate), and they fail safe (templates). A chatbot would cost money at any real traffic. Decision D9 covers A2's runtime quota.

## 7. Real-time, the right technology per need

| Need | Technology | Why |
| --- | --- | --- |
| Daily puzzle rolls at midnight with no refresh | a client timer against the server date plus `router.refresh()`; page is ISR with a daily tag | no connection needed |
| "Today's top sides" and streak boards updating while you watch | **Server-Sent Events** from a Next.js route handler, reading Upstash Redis every few seconds; browsers reconnect by themselves | one-way; works on Vercel; free |
| Live score points in Tbannen | SSE from the same route; scores entered by you or a feed later | one-way; low volume |
| Duel (two players, turns, presence) | **PartyKit** (partyserver) on Cloudflare: one Durable Object per room, WebSockets, state in memory, free tier for non-commercial use | Vercel cannot hold WebSockets; PartyKit is built for rooms; the client is one hook |
| Fallback if PartyKit ever changes terms | Ably free (200 concurrent connections, 6M messages/month) or Supabase Realtime (200 connections) | |

Rule: nothing that works with a timer or SSE gets a WebSocket. Only Duel does.

## 8. Data

Sources: Wikidata SPARQL (1,090 Tunisian footballers; 366 current-era with clubs, 310 with Arabic labels, 285 with photos), Wikimedia Commons photos under CC BY / CC BY-SA with credit, a curated `data/players.json` of overrides you verify, curated line-ups for El 11, and player reports. Nightly GitHub Actions job: query, normalise, merge, compute ratings, generate A1 hints, open a pull request with the diff. Every data change is reviewed and versioned; every field keeps its provenance.

Ratings for 30–0: a documented formula over caps, goals per match, honours (league, cup, CAF, AFCON), era and position, scaled 60–99; shown on the card with its inputs.

## 9. Product and interface

- Hub, copied from 82-0: hero with the simulator call to action, "Today's puzzles" strip, grid of mode cards with badges (Daily, Endless, Simulator, Predict, Duel), "Today's top sides", leaderboards, archive. Dark pitch green, shirt red accent, big type; Inter for Latin, IBM Plex Sans Arabic for Arabic script, both RTL and LTR layouts.
- Mobile first (Facebook in-app browser on Android). PWA. Reduced motion respected. Tiles labelled with text, not colour alone.
- Identity: anonymous id in local storage; optional Google sign-in (D3) for streak sync and a name on boards.
- Share: text grid for Chkoun?, squad card image for 30–0 (OG image at the edge), invite link for Duel.

## 10. Architecture and stack

Next.js 16 on Vercel Hobby (fra1) · Neon Postgres + Prisma · Upstash Redis (leaderboards, rate limits, SSE source) · PartyKit on Cloudflare for Duel · next-intl with three locales · Auth.js (Google) · PostHog cookieless · Sentry (Student Pack) · free domain (Student Pack, D1) · Gemini free tier for A1/A2/A4 · GitHub Actions for CI and the nightly data job · Vitest + fast-check, Postgres tests, Playwright, Lighthouse CI.

Game engines are pure TypeScript modules with no I/O (`engine/chkoun`, `engine/season`, `engine/grid`, …), property-tested. Guesses and simulations run on the server; a client never receives an answer before the day ends. One result per player per game per day (idempotent writes).

## 11. Technical depth, for interviews

1. Data pipeline with provenance, review by PR, audience reports, an AI assistant that proposes and a human that approves.
2. Deterministic engines: schedule across time zones, a season simulator that is reproducible from a seed, grids with a rarity score computed from everyone's answers.
3. Three transports chosen by need: ISR + timer, SSE on Redis, WebSockets in Durable Objects; and the write-up of why.
4. Three locales including a dialect in two scripts, RTL and LTR, with a transliteration-aware search.
5. An AI layer with hard cost ceilings and template fallbacks, measured by its own events.
6. Performance on a 3G Android: Lighthouse budget in CI, edge share images, PWA.
7. Abuse without accounts: anonymous ids, rate limits, server-side answers, idempotent results.

## 12. Measuring

PostHog events per game: opened, guessed, solved/failed, shared (channel), hint_opened, report_shared, season_simulated, duel_started/finished, language. Targets for month one: 500 daily players, 25% share rate, 30% D7 retention, 20% of visitors try 30–0. Launch: you post in fan groups and on a Facebook page for the game (D7); derby days get pinned puzzles.

## 13. Costs and risks

Zero cost: Vercel Hobby, Neon, Upstash, PartyKit, PostHog, Gemini free tiers; Sentry and the domain from the Student Pack. No ads, no prizes.

Risks: stale club data (overrides, reports, nightly PR); Facebook browser quirks (test in it); Gemini quota at success (templates, then Cloudflare Workers AI free as a second provider); PartyKit terms (Ably fallback); photo licences (CC only, credited); nobody shares (measure from day one).

## 14. Decisions for Jalel

| # | Decision | Options | Recommendation |
| --- | --- | --- | --- |
| D1 | Name and domain | Kora family (kora.me, koratounsia.app), Dawri, your own | short, Derja-sounding, not a club's; claim the free domain in the Student Pack |
| D2 | Default language | Derja Arabic script / Derja Arabizi / French | Derja in Arabic script, the other two one tap away |
| D3 | Accounts | anonymous only / + optional Google | optional Google in phase 3 |
| D4 | Pool scope | Tunisian players only / + foreigners in Ligue 1 | Tunisians only at launch; foreigners when 30–0 needs full club squads |
| D5 | Photos | licensed Commons photos with credit / silhouettes | licensed photos, silhouettes as fallback |
| D6 | Analytics | PostHog cookieless / Umami / Vercel Analytics | PostHog |
| D7 | Launch channel | fan groups / a page for the game / both | both |
| D8 | Launch set | Chkoun? + 30–0 + Aktar wala A9all / Chkoun? only / all daily games | the three; 30–0 is the growth bet |
| D9 | AI at runtime | A2 coach's report on (quota then templates) / A1 and A4 only (no runtime calls) | on, with the ceiling |
| D10 | Duel transport | PartyKit on Cloudflare / Ably / skip Duel | PartyKit, in phase 3 |

## 15. Phases

1. **Foundation (days 1–3):** repo, CI, data pipeline with ratings and first pool, engines for Chkoun?, season and higher-or-lower with property tests.
2. **Launch (days 4–8):** hub, the three games in three languages, share grid and squad card, SSE board, PWA, PostHog, Sentry, domain, A1 hints and A3 matching. **Launch.**
3. **Keep (days 9–14):** leaderboards, optional sign-in, Masira and Box 3×3, A2 coach's report, A4 review assistant, report button, first nightly data PR.
4. **Grow (weeks 3–4):** El 11, Tbannen for a national-team match, Duel on PartyKit, archive, retention work from the numbers, portfolio case study with real figures.
