# Data

| File                        | Written by                              | What it is                                                                                                                                                                                          |
| --------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pool.json`                 | the nightly job (`pnpm data:build`)     | Footballers, clubs and honours the games use; every field names its source                                                                                                                          |
| `ids.json`                  | the nightly job                         | Every id ever given, keyed by Wikidata id; ids are permanent                                                                                                                                        |
| `report.md`                 | the nightly job                         | What changed, coverage, and flags to review; also the nightly pull request's description                                                                                                            |
| `witness.json`              | the witness command, committed by Jalel | The private witness's verdicts (P43, P48): per footballer and field, the site, the day, agrees or differs, and our own value at the time; never the site's value                                    |
| `overrides.json`            | Jalel                                   | Corrections that always win, each with who decided and when                                                                                                                                         |
| `curated/governorates.json` | Jalel                                   | The 24 governorates, their names and their region                                                                                                                                                   |
| `curated/ligue1-clubs.json` | Jalel                                   | This season's Ligue 1 clubs, as English Wikipedia titles                                                                                                                                            |
| `curated/honours.json`      | Jalel                                   | Club titles Wikidata does not have                                                                                                                                                                  |
| `cache/` (not committed)    | the job                                 | The last good raw answer from each source (wikitext, SPARQL results, Commons pages, CSV rows, squad pages and their link lookups, page view counts), used when a source fails and by offline builds |
| `LICENSE`                   | Jalel                                   | The data's licence: CC BY-SA 4.0                                                                                                                                                                    |

Nothing here reaches the database until a pull request is merged: the deploy that follows writes `pool.json` to that environment's database.

## The nightly pull request

Every night at 01:17 UTC (02:17 in Tunis) the `Nightly data` workflow (`.github/workflows/nightly-data.yml`) runs `pnpm data:build` online, then `pnpm data:check`. If the build refuses or a check fails, the run fails in the Actions tab and no pull request is opened. Otherwise, when `pool.json`, `ids.json` or the copied photos changed, it commits `pool.json`, `ids.json`, `report.md` and `public/photos/` to the branch `data/nightly` as `github-actions[bot]`, force-pushes it, and opens or updates one pull request into `main`, whose description is `report.md`. It never merges by itself. When nothing changed it does nothing (`report.md` alone changes every night: it carries the date). It can also be started by hand: Actions → Nightly data → Run workflow, on `main`.

### Once, in the repository settings (Jalel)

- Settings → Actions → General → Workflow permissions: tick **Allow GitHub Actions to create and approve pull requests**. Without it the job cannot open the pull request. The workflow asks for its own permissions per job, so the default token setting can stay read-only.
- Settings → Branches: protect `main` (pull request required, CI's `check` required). The job that pushes may write to the repository; the protection is what keeps it off `main`.

### Reviewing it

1. **CI.** A pull request opened by a workflow starts no workflow, so the job dispatches CI on `data/nightly` itself; its checks appear on the pull request's commit. If they are missing, start it: Actions → CI → Run workflow, branch `data/nightly`. Merge only on green.
2. **The description** is tonight's report: sources not read fresh come first, then low-confidence fields, then what changed. Look hardest at club changes, footballers who joined or left, and anything flagged.
3. **The preview.** Vercel builds the branch, and that build syncs the pool into the Preview database; `/admin/pool` on the preview shows the footballers with their confidence.
4. **A wrong value** is fixed with an override in `data/overrides.json` (or a curated file) in a small pull request on `main`, never by editing `data/nightly`: the next run rebuilds the branch from `main` and drops any edit made there. After that merge, run the workflow by hand to refresh the pull request.
5. **Merge** with a squash merge. The Production deploy that follows syncs the pool into the Production database. To skip a night, close the pull request; the next run that finds a change opens a new one.

## The cache and offline builds

`cache/` keeps what each server sent, not what the pipeline made of it: section 0 of each Wikipedia article (the lead with its infobox) with its revision id and timestamp, the SPARQL results of each Wikidata query, each Commons file's metadata, and the header and Tunisia rows of the martj42 files. Two files hold the squad lists (decision P42): `squads.json`, the whole English and French articles of this season's Ligue 1 clubs and the English national team's article (about 1.7 MB), and `squad-links.json`, the `pageprops` answers that turn the lists' link targets into Wikidata ids. Every build parses these again, so a parser change takes effect without a new request. Each file records its format version, the day it was saved and its source; a copy of another version is ignored.

`pnpm data:build --offline` rebuilds `pool.json`, `ids.json` and `report.md` from the cache alone: no request is made, every source is reported as `cached` with its date, and the build refuses if a source has no usable copy. The squad lists are the exception: they are an extra witness, so with no usable copy of `squads` the build goes on without them, the report says the source failed, and the pool is exactly the pool without squad lists. Use it to check a parser or merge change in seconds.

A run plans its requests before sending any and refuses over its budget of 70 (all clients together, retries aside): it checks once before the first request, again exactly before the redirect lookups, and again before the squad link lookups.

## Photos (P30)

The nightly job copies a 330 px Commons thumbnail per footballer with a photo into `public/photos/<id>.jpg` (or `.png`), and the pool records it as `photo.path` next to the credit. The site serves these files as they are: no hotlinking, no image optimization, no crop and no re-encoding, so the credit needs no "modified" note. A photo is copied only when it has a licence and a file page and, when its licence asks for attribution, an author; a response that is not a JPEG or PNG, or is over 120 KB, is not kept. A copy is made as soon as a footballer has a photo record, whatever his fame, and is fetched again only when the Commons file name changes. Downloads go through their own client on Wikimedia's thumbnail servers (decision P49), before the page views and whatever they do, at least 250 ms apart and at most 200 files a run, new files first; a 429 is waited out like the page views' (three times a run); the rest wait for the next night, and the report says how many. They do not count in the 70. The photos are written only when the build succeeds. A copy no footballer uses any more is kept and listed in the report: deleting it is Jalel's call. The nightly pull request carries `public/photos/` with the three data files.

## Fame (D-S2-4)

Each active footballer's `fame` is `log10(en + 1.5·fr + 3·ar + 1)` from 12 full months of Wikipedia page views by people (the Wikimedia Pageviews API, user agents only), plus 0.5 when Jalel tags him a local star; its tier is A (5.0 and up), B (4.5 to 5.0), C (3.0 to 4.5, lowered from 4.0 by P53 on 7 October 2026) or D. D is never a daily answer, C only on Saturdays and Sundays. A legend who is not active has `fame: null`.

The Pageviews API answers one article per request: a full measure of about 245 footballers in three languages is about 600 requests. It is a separate service with its own published limit (100 requests a second), so it has its own polite client (decision P49): the `all-access/user` counts of each article, at least 250 ms between requests, at most 800 HTTP attempts a run (retries included, so a run with retries measures a little less), outside the budget of 70, which stays for Wikidata and the MediaWiki API. The plan prints `plan: pageviews N`. Each run measures every active footballer whose count is missing or comes from an earlier 12-month window (the window moves on the 1st of each month, so no count is used more than a month after its window changed), those never measured first; an article already counted for this month's window is not asked again. If the source fails, the build goes on and the report says so. Counts are kept in `cache/pageviews.json` (the two newest windows) and in the pool (`fame.views` and `fame.window`), so a failed night, or a lost cache, keeps the counts already known. Until all of a footballer's articles are counted his fame has no score and no tier, and he cannot be a daily answer. A 429 there is a throttle, not a refusal: the client waits as long as `Retry-After` says (60 s without it) and goes on, at most three times a run; a fourth stops it, keeping what it read. A 404 means no such article and counts as 0 views; the plan prints `pageviews: N read, M not found`, and when more than a tenth of the articles asked are not found the night's counts are not used: the source is marked failed and fame stays what it was, so a broken request can never make everyone tier D. The report's source table says how many articles were read and how many active footballers are still waiting.

## Grace (P54)

A footballer who leaves the active pool (no club tonight, or past 38) keeps 60 days of grace: on the first night he is missing, his `pools` gains `graceUntil`, that build's day (Tunis) plus 60 days, and later builds keep the date until it has passed; then it goes and he leaves the pool as anyone would. Back in the active pool, the date goes at once. Meanwhile he stays in the pool with every field as the merge read it, even in neither pool and whatever the candidate rule says now, and keeps his last `fame`. He can still be guessed in Chkoun? (the name list and the guess endpoint take the active pool and anyone in grace), so a frozen puzzle whose answer just left can still be won, but he is never drawn as a day's answer: `pools.active` stays `false`, and the calendar requires it. The database keeps the date in `players.pool_grace_until`; `/admin/pool` shows it in the pools column, and the report counts and lists those in grace under the pool counts.

## An override

Keyed by the footballer's Wikidata id. Every value says who decided and when:

    {
      "players": {
        "Q2836275": {
          "club": { "value": "Q1024482", "by": "jalel", "at": "2026-10-05", "note": "CS Sfaxien again since 2025" },
          "position": { "value": "defender", "by": "jalel", "at": "2026-10-05" }
        }
      },
      "clubTitles": { "en:Esperance de Tunis": "Q44897" }
    }

Fields: `club` (a club's Wikidata id, or `null` for none), `position`, `positionDetail`, `caps`, `goals`, `capsAsOf`, `birthDate` (`YYYY-MM-DD`, decision P37), `governorate`, `birthCountry`, `nameArabic`, `aliases`, `pools` (`{ "active": true, "legend": false }`), `exclude`, `localStar` (`true` adds 0.5 to his fame, D-S2-4: a footballer known at home beyond his page views; the report's "one field away" list helps choose). `clubTitles` pins a Wikipedia link title to a club. Edit overrides on `main`, never on the `data/nightly` branch, which is rebuilt every night.

## Confidence

Every field in `pool.json` carries `confidence` (high, medium or low), `agreeing` (the sources that give the chosen value) and a short `confidenceNote` (decision P26). High: two sources agree and none newer says otherwise. Medium: one source under 12 months old, or older sources whose lower numbers their dates explain. Low: one undated or old source, or a conflict. An override is always high. When two sources agree and the third differs, the agreed value wins, rated medium and flagged; only unanimous sources give high (P38). The birth date is the one two or three of the English page, the French page and Wikidata give (P37); one page against Wikidata, the page wins, rated low and flagged (P39). The governorate, birthplace, Arabic name and photo have one source: a birthplace Wikidata resolves to a Tunisian town (and so to one governorate), or to a place abroad with its country, is medium (P36); "Tunisia" with no town, or a place with no country, stays low; the Arabic name and the photo stay low until an override confirms them. The report lists low fields first, and counts the active footballers ready to be a daily answer (P27).

Caps are also judged at band level for the game (D-S2-6), because the caps tile shows a band (0, 1-9, 10-29, 30-59, 60+), not the count. A caps entry gets `"bandAgreed": true` when at least two sources give a count, every count falls in one band, and nothing else contradicts it (no count above the matches Tunisia played, no closed national career the dates cannot explain, no skipped national row, no "differs" from the private witness). Its confidence stays what P26 says, but a footballer whose only doubtful field is such a caps count is ready to be a daily answer; the report counts these separately.

The squad lists (P42, P47) add votes, never a chosen club. A list counts only while current by its own date, never the page's last edit: an English "Current squad" dated (by `{{updated}}` or an "as of" line) on or after 1 July of this season and within 120 days; a French "Effectif professionnel" labelled with this season, dated 1 July of its first year; the English national team's "Current squad" table, within 120 days for its club column and at any date for its caps. Stale and undated lists, loans and other players under contract give no vote. A row is a footballer's only when its link leads to his Wikidata id, or its name and birth date are his; a name alone never counts. A current row naming his club is one more agreeing source (`enwiki-squad`, `frwiki-squad`, `enwiki-national`), so with the infobox it makes high; naming another club, it is flagged `club-squad-list-differs` and, being newer, rates the chosen club low until Jalel settles it with an override. The national table's caps are a candidate like an infobox's: the newest dated count wins (D-S1-3). Also flagged, with no vote: a footballer missing from his chosen club's current list (`club-not-on-squad-list`), named on two clubs' lists (`squad-lists-disagree`), or linked from a list of the club his namesake already has (`squad-namesake`). Squad lists and infoboxes share editors, so "high" here means consistent, not proven.

## The private witness (P43, P44)

Transfermarkt (current club) and national-football-teams.com (caps) are a second, private opinion on two fields. Both sites' terms forbid copying their content, so nothing they say is published: the repository keeps only verdicts, in `witness.json`. Jalel chose this knowingly (P43); the command is built never to get around a block.

**What it is.** `pnpm data:witness` is a command run by hand on Jalel's PC, weekly. No workflow, script or scheduled job runs it, and it refuses to run under CI, GitHub Actions or a test (`CI`, `GITHUB_ACTIONS`, `VITEST`), or when its private folder is inside the repository. It sends an honest User-Agent (`KoraWitness/0.1 (+https://github.com/JalelDridi/kora; weekly check run by hand)`) and no browser-like header, reads each site's robots.txt first, waits 30 s between Transfermarkt requests (at most 20 a run) and 60 s or the site's Crawl-delay on national-football-teams.com (at most 40 a run), never retries, and stops a site for the rest of the run at its first refusal (403, 429, 503, a redirect, or a challenge page). A refused site is not retried that week.

**Running it.**

    pnpm data:witness                          the plan: hosts, paths, gaps, longest duration; no request
    pnpm data:witness --live                   the weekly check: about 9 min on Transfermarkt, up to 40 min on national-football-teams.com
    pnpm data:witness --live --site transfermarkt
    pnpm data:witness --live --backfill 39     the next 39 national-football-teams player pages, low-confidence caps first
    pnpm data:witness --live --sample          the one-off sample of 6 pages, saved privately, no verdict

A weekly run asks Wikidata once for the sites' ids (P2446, P2574, P7223), reads Transfermarkt's Ligue 1 page and its 16 squad pages, then national-football-teams.com's Tunisia page for the year and only the player pages whose matches this year changed. Ctrl+C stops after the current request and keeps what arrived. The backfill fills the private state; the next weekly run turns it into verdicts.

**The private folder.** `%USERPROFILE%\.kora-witness\` (or the folder `KORA_WITNESS_DIR` names, outside the repository): the pages as they arrived, the id mapping, and what each player page said. It is never committed and never shared through a CI cache.

**What is committed.** The run rewrites `witness.json` and says so; it never runs git. Jalel reviews the file and commits it alone, in a small pull request on `main`, like an override. Each entry is `{ site, checkedOn, verdict, checked }` (plus `reason` for a caps difference): `checked` is our own published value when the site was read (the club's Wikidata id, or the caps), so a verdict stops counting as soon as our value changes. `data:check` refuses any other key.

**What a verdict does** in the nightly build (P48). It counts for 21 days. `agrees`: one more agreeing source, named `transfermarkt` or `national-football-teams` in `agreeing`, so a medium club or caps can become high. `differs`: a flag (`club-witness-differs` or `caps-witness-differs`, "<site> checked on <date>: differs from <our value>") and the field is rated low, so the footballer is not a daily answer until Jalel settles it (S21 = b). For caps, `differs` carries `same-date` (our count is dated after Tunisia's latest A match on the site) or `older` (our count has no date); when Tunisia played after our count's date the verdict is `not-comparable` and does nothing. `not-found`: his Ligue 1 club's page does not list him, or his player page is missing; it does nothing but appears in the report. The report's "Private checks (P43)" section counts the verdicts by field and site and lists each "differs" with our value only.

**Fixing a "differs".** Look the footballer up by hand, then write the right value as an override in `overrides.json` (with who decided and when) in a small pull request on `main`. An override always wins and stays high; the next weekly run checks the new value.

## Sources and licences

The pool data and the hints written from it are under [CC BY-SA 4.0](LICENSE) (decision P29). Photos, cropped or not, stay under each Commons file's own licence and are credited per file. The code keeps the repository's MIT licence.

- **Wikidata**: identity, names, birth, position, clubs. CC0.
- **English and French Wikipedia**: current club, career and caps, read from infoboxes. Wikipedia's text is CC BY-SA 4.0; the pool records which article each value came from, so the site can credit it.
- **Wikipedia squad lists** (decision P42): the English and French squad lists of this season's Ligue 1 clubs and the English national team's current squad table, a dated witness for the club and the caps. CC BY-SA 4.0, like the infoboxes; a caps value taken from the national table names its article in `ref`.
- **Wikimedia Commons**: photos, each under its own file's licence. Each keeps its author, licence, licence link and file page, shown wherever the photo appears. The nightly job copies each one into the repository (decision P30, below).
- **martj42/international_results**: Tunisia's results and goalscorers, to tell when caps are out of date and to catch impossible caps or goals. CC0. The scorer list covers about a third of Tunisia's goals, so it is only a lower bound.
