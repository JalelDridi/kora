# Database schema

Five tables. A **player** is a footballer; the person playing a game is a **visitor**, known only by an anonymous id kept in their browser.

| Table     | Holds                                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `clubs`   | Clubs players belong to; the slug is the id                                                                                                                  |
| `players` | The pool: names in Latin and Arabic script, position, birth date, governorate, caps, goals, current club, photo and credit, and the provenance of each field |
| `puzzles` | What is played on a given day, per game                                                                                                                      |
| `results` | What a visitor did in a game on a day                                                                                                                        |
| `reports` | Corrections sent by visitors; nothing changes until Jalel accepts one                                                                                        |

## Rules the database enforces

Each is proven by a test in `src/db/invariants.db.test.ts`.

| Rule                                                 | How                                                                                     |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| One result per visitor, game and day                 | unique index on `results (game, day, visitor_id)`                                       |
| One puzzle per game and day                          | unique index on `puzzles (game, day)`                                                   |
| A Wikidata id belongs to one player, and to one club | unique indexes                                                                          |
| Caps, goals and scores are never negative            | `players_caps_non_negative`, `players_goals_non_negative`, `results_score_non_negative` |
| A club's country is two capital letters              | `clubs_country_iso`                                                                     |
| A report is 1 to 500 characters                      | `reports_message_length`                                                                |

The check constraints are SQL at the end of the first migration, because Prisma's schema language cannot express them.

Days are dates in Africa/Tunis, stored without a time.
