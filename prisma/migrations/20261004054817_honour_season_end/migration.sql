-- An honour is keyed by edition (start and end year), not by start year alone:
-- the CAF Champions League had both a "2018" and a "2018–19" edition.
-- The hosted databases have no honours rows yet, so a plain NOT NULL column
-- without a default is safe here.

-- DropIndex
DROP INDEX "honours_competition_season_start_key";

-- AlterTable
ALTER TABLE "honours" ADD COLUMN     "season_end" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "honours_competition_season_start_season_end_key" ON "honours"("competition", "season_start", "season_end");

-- Invariants Prisma cannot express (described in docs/schema.md).
-- A single-year edition ends the year it starts; a split season a year later.
ALTER TABLE "honours"
  ADD CONSTRAINT "honours_season_end_not_before_start"
  CHECK ("season_end" >= "season_start");
ALTER TABLE "honours"
  ADD CONSTRAINT "honours_season_end_within_a_year"
  CHECK ("season_end" <= "season_start" + 1);
