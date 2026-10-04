/*
  Warnings:

  - You are about to drop the column `photo_credit` on the `players` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "Region" AS ENUM ('grand_tunis', 'north_east', 'north_west', 'centre_east', 'centre_west', 'south_east', 'south_west');

-- CreateEnum
CREATE TYPE "Confederation" AS ENUM ('CAF', 'UEFA', 'AFC', 'CONCACAF', 'CONMEBOL', 'OFC');

-- CreateEnum
CREATE TYPE "Competition" AS ENUM ('tn_ligue1', 'tn_cup', 'caf_cl', 'caf_cc');

-- AlterTable
ALTER TABLE "clubs" ADD COLUMN     "confederation" "Confederation",
ADD COLUMN     "league_wikidata_id" TEXT,
ADD COLUMN     "ligue1" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "name_french" TEXT;

-- AlterTable
ALTER TABLE "players" DROP COLUMN "photo_credit",
ADD COLUMN     "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "birth_country" CHAR(2),
ADD COLUMN     "birth_place" TEXT,
ADD COLUMN     "caps_as_of" DATE,
ADD COLUMN     "name_french" TEXT,
ADD COLUMN     "photo_author" TEXT,
ADD COLUMN     "photo_file" TEXT,
ADD COLUMN     "photo_licence" TEXT,
ADD COLUMN     "photo_licence_url" TEXT,
ADD COLUMN     "photo_source_url" TEXT,
ADD COLUMN     "pool_active" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pool_legend" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "position_detail" TEXT,
ADD COLUMN     "wiki_ar" TEXT,
ADD COLUMN     "wiki_en" TEXT,
ADD COLUMN     "wiki_fr" TEXT;

-- CreateTable
CREATE TABLE "governorates" (
    "id" TEXT NOT NULL,
    "name_latin" TEXT NOT NULL,
    "name_arabic" TEXT NOT NULL,
    "name_french" TEXT NOT NULL,
    "region" "Region" NOT NULL,

    CONSTRAINT "governorates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_clubs" (
    "player_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "club_id" TEXT,
    "club_name" TEXT NOT NULL,
    "from_year" INTEGER,
    "to_year" INTEGER,
    "apps" INTEGER,
    "goals" INTEGER,
    "loan" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "player_clubs_pkey" PRIMARY KEY ("player_id","seq")
);

-- CreateTable
CREATE TABLE "honours" (
    "id" UUID NOT NULL,
    "competition" "Competition" NOT NULL,
    "season_start" INTEGER NOT NULL,
    "club_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "honours_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "player_clubs_club_id_idx" ON "player_clubs"("club_id");

-- CreateIndex
CREATE UNIQUE INDEX "honours_competition_season_start_key" ON "honours"("competition", "season_start");

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_governorate_fkey" FOREIGN KEY ("governorate") REFERENCES "governorates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_clubs" ADD CONSTRAINT "player_clubs_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_clubs" ADD CONSTRAINT "player_clubs_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "honours" ADD CONSTRAINT "honours_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Invariants Prisma cannot express (described in docs/schema.md).
ALTER TABLE "players"
  ADD CONSTRAINT "players_birth_country_iso"
  CHECK ("birth_country" ~ '^[A-Z]{2}$');
ALTER TABLE "players"
  ADD CONSTRAINT "players_governorate_in_tunisia"
  CHECK ("governorate" IS NULL OR "birth_country" IS NULL OR "birth_country" = 'TN');
ALTER TABLE "players"
  ADD CONSTRAINT "players_photo_credited"
  CHECK ("photo_url" IS NULL OR ("photo_file" IS NOT NULL AND "photo_licence" IS NOT NULL AND "photo_source_url" IS NOT NULL));
ALTER TABLE "player_clubs"
  ADD CONSTRAINT "player_clubs_seq_non_negative" CHECK ("seq" >= 0);
ALTER TABLE "player_clubs"
  ADD CONSTRAINT "player_clubs_years_range"
  CHECK (("from_year" IS NULL OR "from_year" BETWEEN 1900 AND 2100)
     AND ("to_year" IS NULL OR "to_year" BETWEEN 1900 AND 2100));
ALTER TABLE "player_clubs"
  ADD CONSTRAINT "player_clubs_years_ordered"
  CHECK ("from_year" IS NULL OR "to_year" IS NULL OR "from_year" <= "to_year");
ALTER TABLE "player_clubs"
  ADD CONSTRAINT "player_clubs_stats_non_negative"
  CHECK (("apps" IS NULL OR "apps" >= 0) AND ("goals" IS NULL OR "goals" >= 0));
ALTER TABLE "honours"
  ADD CONSTRAINT "honours_season_range" CHECK ("season_start" BETWEEN 1900 AND 2100);
ALTER TABLE "honours"
  ADD CONSTRAINT "honours_source" CHECK ("source" IN ('wikidata', 'curated'));
