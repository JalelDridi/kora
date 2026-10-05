-- AlterTable
ALTER TABLE "players" ADD COLUMN     "fame" REAL,
ADD COLUMN     "fame_tier" CHAR(1),
ADD COLUMN     "local_star" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "photo_path" TEXT;

-- AlterTable
ALTER TABLE "puzzles" ADD COLUMN     "note" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'generator';

-- Invariants Prisma cannot express (described in docs/schema.md).
ALTER TABLE "puzzles" ADD CONSTRAINT "puzzles_source"
  CHECK ("source" IN ('generator', 'pin', 'reserve'));
ALTER TABLE "puzzles" ADD CONSTRAINT "puzzles_chkoun_has_player"
  CHECK ("game" <> 'chkoun' OR "player_id" IS NOT NULL);
ALTER TABLE "puzzles" ADD CONSTRAINT "puzzles_note_length"
  CHECK ("note" IS NULL OR char_length("note") BETWEEN 1 AND 200);

-- A day freezes 48 hours before it starts (D-S2-2): no UPDATE or DELETE of a
-- row whose day is at most two days after today in Tunis. INSERT stays open
-- so an empty day can be filled once (the reserve). TRUNCATE fires no row
-- trigger, so test resets keep working.
CREATE FUNCTION puzzles_refuse_frozen() RETURNS trigger AS $$
BEGIN
  IF OLD.day <= (now() AT TIME ZONE 'Africa/Tunis')::date + 2 THEN
    RAISE EXCEPTION 'puzzle day is frozen: %', OLD.day USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER puzzles_frozen BEFORE UPDATE OR DELETE ON "puzzles"
  FOR EACH ROW EXECUTE FUNCTION puzzles_refuse_frozen();

ALTER TABLE "players" ADD CONSTRAINT "players_fame_tier"
  CHECK ("fame_tier" IS NULL OR "fame_tier" IN ('A', 'B', 'C', 'D'));
ALTER TABLE "players" ADD CONSTRAINT "players_fame_range"
  CHECK ("fame" IS NULL OR ("fame" >= 0 AND "fame" <= 10));
ALTER TABLE "players" ADD CONSTRAINT "players_photo_path_credited"
  CHECK ("photo_path" IS NULL OR ("photo_file" IS NOT NULL AND "photo_licence" IS NOT NULL AND "photo_source_url" IS NOT NULL));
ALTER TABLE "players" ADD CONSTRAINT "players_photo_path_shape"
  CHECK ("photo_path" IS NULL OR "photo_path" ~ '^/photos/[a-z0-9-]+\.(jpg|png)$');

ALTER TABLE "results" ADD CONSTRAINT "results_chkoun_score"
  CHECK ("game" <> 'chkoun' OR "score" BETWEEN 1 AND 8);
