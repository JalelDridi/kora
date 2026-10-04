# Database schema

Eight tables. A **player** is a footballer; the person playing a game is a **visitor**, known only by an anonymous id kept in their browser.

| Table          | Holds                                                                                                                                                                                                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `players`      | The pool: names (Latin, Arabic, French, aliases), position and its detail, birth date, place, country and governorate, caps and goals with their "as of" date, current club, photo with its credit, Wikipedia titles, the two pool flags, and the provenance of each field |
| `player_clubs` | Each player's senior career, one row per spell, in order                                                                                                                                                                                                                   |
| `clubs`        | Clubs with country, confederation, league and whether they play the current Ligue 1 season                                                                                                                                                                                 |
| `governorates` | The 24 governorates with their names and region                                                                                                                                                                                                                            |
| `honours`      | Which club won which competition in which season                                                                                                                                                                                                                           |
| `puzzles`      | What is played on a given day, per game                                                                                                                                                                                                                                    |
| `results`      | What a visitor did in a game on a day                                                                                                                                                                                                                                      |
| `reports`      | Corrections sent by visitors; nothing changes until Jalel accepts one                                                                                                                                                                                                      |

The pool tables are written only by the data sync (`src/pipeline/sync.ts`), from `data/pool.json`, when a deploy builds. A player who leaves the pool keeps his row with both pool flags off, so puzzles and results that point at him stay valid.

## Rules the database enforces

Each is proven by a test in `src/db/invariants.db.test.ts` or `src/db/pool.db.test.ts`.

| Rule                                                                               | How                                                                                                                          |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| One result per visitor, game and day                                               | unique index on `results (game, day, visitor_id)`                                                                            |
| One puzzle per game and day                                                        | unique index on `puzzles (game, day)`                                                                                        |
| A Wikidata id belongs to one player, and to one club                               | unique indexes                                                                                                               |
| Caps, goals and scores are never negative                                          | `players_caps_non_negative`, `players_goals_non_negative`, `results_score_non_negative`                                      |
| A country is two capital letters                                                   | `clubs_country_iso`, `players_birth_country_iso`                                                                             |
| A governorate exists, and only for players born in Tunisia                         | foreign key; `players_governorate_in_tunisia`                                                                                |
| A photo always carries its file, licence and source page                           | `players_photo_credited`                                                                                                     |
| A career has one spell per position, deleted with its player                       | primary key `(player_id, seq)`; `ON DELETE CASCADE`                                                                          |
| A spell's years are plausible and in order, its numbers not negative               | `player_clubs_years_range`, `player_clubs_years_ordered`, `player_clubs_stats_non_negative`, `player_clubs_seq_non_negative` |
| One winner per competition and edition; an edition is a start year and an end year | unique index on `honours (competition, season_start, season_end)`                                                            |
| An honour comes from Wikidata or the curated file                                  | `honours_source`, `honours_season_range`                                                                                     |
| An edition ends the year it starts or the year after                               | `honours_season_end_not_before_start`, `honours_season_end_within_a_year`                                                    |
| A report is 1 to 500 characters                                                    | `reports_message_length`                                                                                                     |

Check constraints are SQL at the end of each migration, because Prisma's schema language cannot express them.

Days are dates in Africa/Tunis, stored without a time.
