-- A 30–0 result (T-S3-10, D-S3-11): the season's points, 0 to 90;
-- no puzzle (the day has no answer); detail names the squad (xi, its share
-- code). Prisma's schema cannot express a check constraint.
ALTER TABLE results ADD CONSTRAINT results_season_score
  CHECK (game <> 'season' OR (score BETWEEN 0 AND 90 AND puzzle_id IS NULL AND detail ? 'xi'));
