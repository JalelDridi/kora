-- CreateEnum
CREATE TYPE "Game" AS ENUM ('chkoun', 'season', 'aktar');

-- CreateEnum
CREATE TYPE "Position" AS ENUM ('goalkeeper', 'defender', 'midfielder', 'forward');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('open', 'accepted', 'rejected');

-- CreateTable
CREATE TABLE "clubs" (
    "id" TEXT NOT NULL,
    "wikidata_id" TEXT,
    "name_latin" TEXT NOT NULL,
    "name_arabic" TEXT,
    "country" CHAR(2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clubs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "players" (
    "id" TEXT NOT NULL,
    "wikidata_id" TEXT,
    "name_latin" TEXT NOT NULL,
    "name_arabic" TEXT,
    "position" "Position" NOT NULL,
    "birth_date" DATE NOT NULL,
    "governorate" TEXT,
    "caps" INTEGER NOT NULL DEFAULT 0,
    "goals" INTEGER NOT NULL DEFAULT 0,
    "club_id" TEXT,
    "photo_url" TEXT,
    "photo_credit" TEXT,
    "provenance" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "puzzles" (
    "id" UUID NOT NULL,
    "game" "Game" NOT NULL,
    "day" DATE NOT NULL,
    "player_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "puzzles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "results" (
    "id" UUID NOT NULL,
    "game" "Game" NOT NULL,
    "day" DATE NOT NULL,
    "visitor_id" UUID NOT NULL,
    "puzzle_id" UUID,
    "solved" BOOLEAN NOT NULL,
    "score" INTEGER NOT NULL,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "player_id" TEXT NOT NULL,
    "visitor_id" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clubs_wikidata_id_key" ON "clubs"("wikidata_id");

-- CreateIndex
CREATE UNIQUE INDEX "players_wikidata_id_key" ON "players"("wikidata_id");

-- CreateIndex
CREATE INDEX "players_club_id_idx" ON "players"("club_id");

-- CreateIndex
CREATE UNIQUE INDEX "puzzles_game_day_key" ON "puzzles"("game", "day");

-- CreateIndex
CREATE INDEX "results_game_day_score_idx" ON "results"("game", "day", "score");

-- CreateIndex
CREATE UNIQUE INDEX "results_game_day_visitor_id_key" ON "results"("game", "day", "visitor_id");

-- CreateIndex
CREATE INDEX "reports_status_created_at_idx" ON "reports"("status", "created_at");

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puzzles" ADD CONSTRAINT "puzzles_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_puzzle_id_fkey" FOREIGN KEY ("puzzle_id") REFERENCES "puzzles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Invariants Prisma cannot express (described in docs/schema.md).
ALTER TABLE "clubs"
  ADD CONSTRAINT "clubs_country_iso" CHECK ("country" ~ '^[A-Z]{2}$');
ALTER TABLE "players"
  ADD CONSTRAINT "players_caps_non_negative" CHECK ("caps" >= 0);
ALTER TABLE "players"
  ADD CONSTRAINT "players_goals_non_negative" CHECK ("goals" >= 0);
ALTER TABLE "results"
  ADD CONSTRAINT "results_score_non_negative" CHECK ("score" >= 0);
ALTER TABLE "reports"
  ADD CONSTRAINT "reports_message_length"
  CHECK (char_length("message") BETWEEN 1 AND 500);
