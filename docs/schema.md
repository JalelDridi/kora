# Database schema

Eight tables. A **player** is a footballer; the person playing a game is a **visitor**, known only by an anonymous id kept in their browser.

| Table          | Holds                                                                                                                                                                                                                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `players`      | The pool: names (Latin, Arabic, French, aliases), position and its detail, birth date, place, country and governorate, caps and goals with their "as of" date, current club, photo with its credit, Wikipedia titles, the two pool flags, and the provenance of each field; fame score, fame tier and the local star tag; the copied photo's path |
| `player_clubs` | Each player's senior career, one row per spell, in order                                                                                                                                                                                                                                                                                          |
| `clubs`        | Clubs with country, confederation, league and whether they play the current Ligue 1 season                                                                                                                                                                                                                                                        |
| `governorates` | The 24 governorates with their names and region                                                                                                                                                                                                                                                                                                   |
| `honours`      | Which club won which competition in which season                                                                                                                                                                                                                                                                                                  |
| `puzzles`      | The day's answer for each game, with how it was chosen (generator, pin, reserve) and a note. Chkoun? puzzle numbers are computed from the day, not stored                                                                                                                                                                                         |
| `results`      | A finished game, copied from Redis once a night (Chkoun?: guesses 1 to 8, the colour grid in `detail.grid`)                                                                                                                                                                                                                                       |
| `reports`      | Corrections sent by visitors; nothing changes until Jalel accepts one                                                                                                                                                                                                                                                                             |

The pool tables are written only by the data sync (`src/pipeline/sync.ts`), from `data/pool.json`, when a deploy builds. A player who leaves the pool keeps his row with both pool flags off, so puzzles and results that point at him stay valid.

Every deploy runs the sync in one transaction, after `prisma migrate deploy` and before `next build` (`scripts/vercel-build.sh`); a `wake` step first starts a suspended Neon compute. A row is written only when it differs from the file, so a second sync of the same pool rewrites nothing. Footballer and club ids never change once given (the append-only registry `data/ids.json`), so the sync upserts by id; a changed id for the same Wikidata id breaks `players_wikidata_id_key` or `clubs_wikidata_id_key` and fails the deploy rather than duplicate a row. Each provenance entry also holds `confidence` (high, medium or low), `agreeing` and `confidenceNote` (decision P26). A footballer's career is the file's, position by position. Honours are upserted on (competition, season_start, season_end); an edition no longer in the pool is deleted (nothing references honours). Clubs are never deleted; one no longer in the file loses its Ligue 1 mark.

## Rules the database enforces

Each is proven by a test in `src/db/invariants.db.test.ts` or `src/db/pool.db.test.ts`.

| Rule                                                                                                                                     | How                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| One result per visitor, game and day                                                                                                     | unique index on `results (game, day, visitor_id)`                                                                            |
| One puzzle per game and day                                                                                                              | unique index on `puzzles (game, day)`                                                                                        |
| A Wikidata id belongs to one player, and to one club                                                                                     | unique indexes                                                                                                               |
| Caps, goals and scores are never negative                                                                                                | `players_caps_non_negative`, `players_goals_non_negative`, `results_score_non_negative`                                      |
| A country is two capital letters                                                                                                         | `clubs_country_iso`, `players_birth_country_iso`                                                                             |
| A governorate exists, and only for players born in Tunisia                                                                               | foreign key; `players_governorate_in_tunisia`                                                                                |
| A photo always carries its file, licence and source page                                                                                 | `players_photo_credited`                                                                                                     |
| A career has one spell per position, deleted with its player                                                                             | primary key `(player_id, seq)`; `ON DELETE CASCADE`                                                                          |
| A spell's years are plausible and in order, its numbers not negative                                                                     | `player_clubs_years_range`, `player_clubs_years_ordered`, `player_clubs_stats_non_negative`, `player_clubs_seq_non_negative` |
| One winner per competition and edition; an edition is a start year and an end year                                                       | unique index on `honours (competition, season_start, season_end)`                                                            |
| An honour comes from Wikidata or the curated file                                                                                        | `honours_source`, `honours_season_range`                                                                                     |
| An edition ends the year it starts or the year after                                                                                     | `honours_season_end_not_before_start`, `honours_season_end_within_a_year`                                                    |
| A report is 1 to 500 characters                                                                                                          | `reports_message_length`                                                                                                     |
| A Chkoun? puzzle names a footballer                                                                                                      | `puzzles_chkoun_has_player`                                                                                                  |
| A puzzle comes from the generator, a pin or the reserve; its note is 1 to 200 characters                                                 | `puzzles_source`, `puzzles_note_length`                                                                                      |
| A day cannot change less than 48 hours before it starts, and no row can be moved onto such a day (an empty day can still be filled once) | `puzzles_frozen` trigger (`puzzles_refuse_frozen`) on UPDATE and DELETE; checks the old day and, for UPDATE, the new one     |
| A fame tier is A to D; a fame score is 0 to 10                                                                                           | `players_fame_tier`, `players_fame_range`                                                                                    |
| A copied photo is credited and lives under `/photos/`                                                                                    | `players_photo_path_credited`, `players_photo_path_shape`                                                                    |
| A Chkoun? result has 1 to 8 guesses                                                                                                      | `results_chkoun_score`                                                                                                       |

Check constraints are SQL at the end of each migration, because Prisma's schema language cannot express them.

Days are dates in Africa/Tunis, stored without a time.

## Chkoun? calendar

The day's footballer is generated 30 days ahead, at deploy and every night, from a secret seed (`CHKOUN_SEED`); the seed is not in the repo. Jalel can swap, pin or redraw a day in `/admin/chkoun` until it freezes, 48 hours before it starts. When today has no row, the server writes one reserve row once. A footballer who leaves the pool keeps his past puzzles.

## Results

Finished games are kept in Redis for 8 days under `kora:{env}:chkoun:r:{day}` and copied to `results` every night with `ON CONFLICT (game, day, visitor_id) DO NOTHING`.

Not stored: search keys and tile facts (built from the public `pool.json`), the seed, the token key, raw network addresses.
