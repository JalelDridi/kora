# Kora on phones: design reassessment (31 October 2026)

Benchmarked against the popular football daily games (playfootball.games' Who Are Ya? and Box2Box, Footdle, Immaculate Footy, Sportword, FootballGenius, NBA 82-0), the daily-puzzle conventions (NYT Wordle and Connections, Framed, Worldle) and what is known of Tunisian phone use (Android 83%, 360×800 the most common screen, Facebook and Messenger as the main browsers, prepaid data). Three research notes with sources sit next to this file: `research-competitors.md`, `research-mobile-ux.md`, `research-tunisia.md`. Screenshots: `shots/` (iPhone SE 375×667 and Pixel 412×915, built from `main` f871655). No competitor site could be opened from this container (network policy), so their first screens come from write-ups and prior knowledge, not fresh screenshots.

## 1. Where Kora already matches the best

| Convention                                                                        | Kora today                                                                                      |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| One puzzle a day, same for everyone, stated reset                                 | Yes: Tunis midnight, countdown on the result                                                    |
| No account, progress on the device                                                | Yes (`localStorage`, `kora_v` cookie only with Redis on)                                        |
| Closed-list autocomplete, no typos                                                | Yes: Arabic, Arabizi and French names, accent-insensitive                                       |
| Colour tiles with a text label and a screen-reader word, arrows on numbers        | Yes, axe clean in every state                                                                   |
| Spoiler-free share: header, emoji grid, one link on the last line, LRM marks      | Yes (D-S2-10); the 30–0 card image is 70 KB, under WhatsApp's limit                             |
| Stats: played, win %, streak, best streak                                         | Yes, after the game (no distribution chart)                                                     |
| Western digits, RTL with logical CSS, reduced motion respected, 16 px inputs      | Yes (tests pin the digits)                                                                      |
| Fast: Lighthouse performance 0.93 to 0.98, CLS 0, script 155 KB, manifest present | Yes                                                                                             |
| Free, no ads, dark theme                                                          | Yes (dark only)                                                                                 |
| Local identity: Tunisian clubs and footballers, Derja                             | Yes, and nobody else covers it (the competitors' Arabic is MSA clones of big-five-league games) |

## 2. Where Kora falls short on a phone (from the screenshots)

1. **The game starts below the fold.** On a 375×667 phone the Chkoun? input sits at 70% of the first screen: back link, a 60 px language switcher, the title and two lines of rules come first. Every popular site puts the puzzle at the top under a one-line header (logo, "?", stats, settings). 30–0 has the same header cost; its first spin starts at the bottom of the first screen.
2. **No first-visit "how to play".** The rules are two lines of prose on the page, every visit. The convention is a modal once, with one example row of tiles, reopenable from a "?" icon.
3. **Stats and streak are invisible until the game ends.** The streak is the habit lever of this genre; the best sites show a stats icon in the header at all times.
4. **The guess rows grow away from the thumb.** New rows appear under the input, below the fold after two guesses; the visitor scrolls after every guess. Wordle-likes keep the grid in view and the input where the thumb is.
5. **Tile rows are hard to scan at 360 to 412 px.** Six tiles across at 412 px leave 10 to 11 px text ("Étoile Sportive du Sahel" wraps inside a 60 px tile); at 320 to 375 they wrap 3 by 2, which breaks the row-per-guess reading. Arabic labels need 14 px or more.
6. **The hub tells nothing about today.** The cards say "play"; competitors' hubs show per game "played, 3/8", "not yet", the streak, and the puzzle number. The brand hero takes the first screen; the language pill is the very first thing on the page.
7. **No way back in.** No archive or "play yesterday", no unlimited mode: once the daily is done the visit ends. Archives and endless modes are what keep visitors on Footdle, Futbol-11 and Renderfoot.
8. **Streaks live only on the device.** In Facebook's in-app browser (the main browser for shared links in Tunisia) storage can be lost; lost streaks were Wordle's biggest complaint. The server keeps results under `kora_v` only with Redis on; nothing lets a visitor recover a streak.
9. **No hint ladder.** Eight guesses with no help; Weddle and AlWird keep casual fans with hints after a few tries; Who Are Ya? shows a blurred photo. Chkoun? shows the photo only at the end.
10. **No club identity.** Tunisian fan culture is tribal; a chosen club (crest, colours, "your club's average today", a derby board) is the strongest untested hook, and no competitor has it for Tunisia.
11. **Dark only.** Fine as a brand, but a `prefers-color-scheme` light theme is now standard and matters for daylight use on cheap screens.
12. **Minor:** the Chkoun? flip animation runs long enough that a screenshot mid-game catches empty tiles; the 30–0 match list is 30 rows long on the result (collapse after 5); the 30–0 reserved spin area shows an empty dark screen for the first fetch (a loading line would read better).

## 3. Proposal: a "mobile polish" round before Sprint 4 (about one session)

| #   | Change                                                                                                                                                            | Why                                             | Size | Recommendation                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---- | ----------------------------------------- |
| M1  | Compact game header: back arrow, game name, "?" and stats icons; language switcher shrinks to a small menu in the header (and stays full-size in the footer)      | Puts the puzzle on the first screen (gaps 1, 3) | M    | Yes                                       |
| M2  | "How to play" modal on the first visit with one example row, reopened by "?"; the rules prose leaves the page                                                     | Gap 2                                           | S    | Yes                                       |
| M3  | Stats panel reachable any time; add the guess-distribution chart                                                                                                  | Gap 3                                           | S    | Yes                                       |
| M4  | Chkoun? layout: guess rows above the input, the input pinned at the bottom of the screen while playing (chat-composer pattern), the newest row scrolled into view | Gap 4                                           | M    | Yes                                       |
| M5  | Tile row redesign for 360 to 412 px: six narrow columns with a fixed order, icon plus short value, 14 px minimum, header row once; 3 by 2 only under 340 px       | Gap 5                                           | M    | Yes, after a screenshot mock you approve  |
| M6  | Hub cards with today's state (played and score, not yet, streak, puzzle number) and a smaller hero; brand before the language pill                                | Gap 6                                           | S    | Yes                                       |
| M7  | "Play yesterday" (archive of past Chkoun? puzzles, no streak effect, marked in the share)                                                                         | Gap 7                                           | M    | Yes, Sprint 4 task 1                      |
| M8  | Hint after the 5th guess (first letter, or a blurred photo after the 6th)                                                                                         | Gap 9                                           | M    | Your call; I lean yes (first letter only) |
| M9  | Streak recovery: a short code (or the Sprint 5 sign-in)                                                                                                           | Gap 8                                           | M    | Sprint 5 with sign-in (D3)                |
| M10 | Club identity: pick your club, crest and colour on the hub, "your club today"                                                                                     | Gap 10                                          | L    | Sprint 5                                  |
| M11 | Light theme via `prefers-color-scheme`, dark by default                                                                                                           | Gap 11                                          | M    | Sprint 4, with the PWA                    |
| M12 | The minors of §2.12                                                                                                                                               |                                                 | S    | Yes, inside M1 to M4                      |

Not proposed: ads, accounts to play, push on first visit, Eastern digits, a bigger font budget. All against the rules or the research.

## 4. What I would measure after the round

Lighthouse unchanged (performance ≥ 0.9, CLS 0); the Chkoun? input within the first 60% of a 360×800 screen; axe clean; the 320 px tests; a real check in the Facebook in-app browser on your phone (the one thing this container cannot do).
