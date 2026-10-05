# Data

| File                        | Written by                          | What it is                                                                                                                                                                        |
| --------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pool.json`                 | the nightly job (`pnpm data:build`) | Footballers, clubs and honours the games use; every field names its source                                                                                                        |
| `ids.json`                  | the nightly job                     | Every id ever given, keyed by Wikidata id; ids are permanent                                                                                                                      |
| `report.md`                 | the nightly job                     | What changed, coverage, and flags to review; also the nightly pull request's description                                                                                          |
| `overrides.json`            | Jalel                               | Corrections that always win, each with who decided and when                                                                                                                       |
| `curated/governorates.json` | Jalel                               | The 24 governorates, their names and their region                                                                                                                                 |
| `curated/ligue1-clubs.json` | Jalel                               | This season's Ligue 1 clubs, as English Wikipedia titles                                                                                                                          |
| `curated/honours.json`      | Jalel                               | Club titles Wikidata does not have                                                                                                                                                |
| `cache/` (not committed)    | the job                             | The last good raw answer from each source (wikitext, SPARQL results, Commons pages, CSV rows, squad pages and their link lookups), used when a source fails and by offline builds |
| `LICENSE`                   | Jalel                               | The data's licence: CC BY-SA 4.0                                                                                                                                                  |

Nothing here reaches the database until a pull request is merged: the deploy that follows writes `pool.json` to that environment's database.

## The nightly pull request

Every night at 01:17 UTC (02:17 in Tunis) the `Nightly data` workflow (`.github/workflows/nightly-data.yml`) runs `pnpm data:build` online, then `pnpm data:check`. If the build refuses or a check fails, the run fails in the Actions tab and no pull request is opened. Otherwise, when `pool.json` or `ids.json` changed, it commits `pool.json`, `ids.json` and `report.md` to the branch `data/nightly` as `github-actions[bot]`, force-pushes it, and opens or updates one pull request into `main`, whose description is `report.md`. It never merges by itself. When nothing changed it does nothing (`report.md` alone changes every night: it carries the date). It can also be started by hand: Actions → Nightly data → Run workflow, on `main`.

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

Fields: `club` (a club's Wikidata id, or `null` for none), `position`, `positionDetail`, `caps`, `goals`, `capsAsOf`, `birthDate` (`YYYY-MM-DD`, decision P37), `governorate`, `birthCountry`, `nameArabic`, `aliases`, `pools` (`{ "active": true, "legend": false }`), `exclude`. `clubTitles` pins a Wikipedia link title to a club. Edit overrides on `main`, never on the `data/nightly` branch, which is rebuilt every night.

## Confidence

Every field in `pool.json` carries `confidence` (high, medium or low), `agreeing` (the sources that give the chosen value) and a short `confidenceNote` (decision P26). High: two sources agree and none newer says otherwise. Medium: one source under 12 months old, or older sources whose lower numbers their dates explain. Low: one undated or old source, or a conflict. An override is always high. When two sources agree and the third differs, the agreed value wins, rated medium and flagged; only unanimous sources give high (P38). The birth date is the one two or three of the English page, the French page and Wikidata give (P37); one page against Wikidata, the page wins, rated low and flagged (P39). The governorate, birthplace, Arabic name and photo have one source: a birthplace Wikidata resolves to a Tunisian town (and so to one governorate), or to a place abroad with its country, is medium (P36); "Tunisia" with no town, or a place with no country, stays low; the Arabic name and the photo stay low until an override confirms them. The report lists low fields first, and counts the active footballers ready to be a daily answer (P27).

The squad lists (P42, P47) add votes, never a chosen club. A list counts only while current by its own date, never the page's last edit: an English "Current squad" dated (by `{{updated}}` or an "as of" line) on or after 1 July of this season and within 120 days; a French "Effectif professionnel" labelled with this season, dated 1 July of its first year; the English national team's "Current squad" table, within 120 days for its club column and at any date for its caps. Stale and undated lists, loans and other players under contract give no vote. A row is a footballer's only when its link leads to his Wikidata id, or its name and birth date are his; a name alone never counts. A current row naming his club is one more agreeing source (`enwiki-squad`, `frwiki-squad`, `enwiki-national`), so with the infobox it makes high; naming another club, it is flagged `club-squad-list-differs` and, being newer, rates the chosen club low until Jalel settles it with an override. The national table's caps are a candidate like an infobox's: the newest dated count wins (D-S1-3). Also flagged, with no vote: a footballer missing from his chosen club's current list (`club-not-on-squad-list`), named on two clubs' lists (`squad-lists-disagree`), or linked from a list of the club his namesake already has (`squad-namesake`). Squad lists and infoboxes share editors, so "high" here means consistent, not proven.

## Sources and licences

The pool data and the hints written from it are under [CC BY-SA 4.0](LICENSE) (decision P29). Photos, cropped or not, stay under each Commons file's own licence and are credited per file. The code keeps the repository's MIT licence.

- **Wikidata**: identity, names, birth, position, clubs. CC0.
- **English and French Wikipedia**: current club, career and caps, read from infoboxes. Wikipedia's text is CC BY-SA 4.0; the pool records which article each value came from, so the site can credit it.
- **Wikipedia squad lists** (decision P42): the English and French squad lists of this season's Ligue 1 clubs and the English national team's current squad table, a dated witness for the club and the caps. CC BY-SA 4.0, like the infoboxes; a caps value taken from the national table names its article in `ref`.
- **Wikimedia Commons**: photos, each under its own file's licence. Each keeps its author, licence, licence link and file page, shown wherever the photo appears. Sprint 1 stores the thumbnail address as Commons gives it and downloads no image; photos are copied into the repository in Sprint 2 (decision P30).
- **martj42/international_results**: Tunisia's results and goalscorers, to tell when caps are out of date and to catch impossible caps or goals. CC0. The scorer list covers about a third of Tunisia's goals, so it is only a lower bound.
