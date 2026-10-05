-- Review L3: the freeze also guards the day a row moves to. An UPDATE that
-- moved an open row onto an empty frozen day passed, because only OLD.day
-- was checked. Same rule as before: today and the next two days in Tunis.
CREATE OR REPLACE FUNCTION puzzles_refuse_frozen() RETURNS trigger AS $$
DECLARE
  last_frozen date := (now() AT TIME ZONE 'Africa/Tunis')::date + 2;
BEGIN
  IF OLD.day <= last_frozen THEN
    RAISE EXCEPTION 'puzzle day is frozen: %', OLD.day USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.day <= last_frozen THEN
    RAISE EXCEPTION 'puzzle day is frozen: %', NEW.day USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$ LANGUAGE plpgsql;
