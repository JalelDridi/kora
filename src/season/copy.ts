import { COPY_DAYS } from "@/chkoun/copy.ts";
import type { CopyResult } from "@/chkoun/copy.ts";
import type { Kv } from "@/chkoun/kv.ts";
import { addDays } from "@/engine/chkoun/day.ts";
import type { Day } from "@/engine/chkoun/types.ts";
import type { SqlClient } from "@/pipeline/calendar.ts";
import { parseSeasonEntry, seasonResultsKey } from "./store.ts";

// The nightly copy of 30–0's first seasons from Redis to Postgres, like
// Chkoun?'s (src/chkoun/copy.ts): the last 7 days before today, one INSERT
// per day, each visitor's season at most once (ON CONFLICT (game, day,
// visitor_id) DO NOTHING), so a failed night is caught up the next one while
// Redis keeps the day (8 days). Nothing is deleted from Redis. Postgres keeps
// per season: day, visitor id, points as the score, solved when all 30
// matches are won, no puzzle, and in detail the squad's share code and its
// record (xi, w, d, l, gf, ga, rating). Notes name days and counts only.

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const INSERT_SQL = `
INSERT INTO results (id, game, day, visitor_id, puzzle_id, solved, score, detail)
SELECT gen_random_uuid(), 'season', $1::date, r.visitor_id, NULL, r.w = 30,
       r.points,
       jsonb_build_object('xi', r.xi, 'w', r.w, 'd', r.d, 'l', r.l,
                          'gf', r.gf, 'ga', r.ga, 'rating', r.rating)
FROM jsonb_to_recordset($2::jsonb)
  AS r(visitor_id uuid, xi text, w int, d int, l int, gf int, ga int,
       points int, rating numeric)
ON CONFLICT (game, day, visitor_id) DO NOTHING`;

export async function copySeasons(input: {
  kv: Kv | null;
  db: SqlClient;
  env: string;
  today: Day;
  days?: number;
}): Promise<CopyResult> {
  const out: CopyResult = { copied: 0, already: 0, skipped: 0, notes: [] };
  if (!input.kv) {
    out.notes.push("Redis is off: nothing to copy");
    return out;
  }
  const days = input.days ?? COPY_DAYS;
  for (let back = days; back >= 1; back--) {
    const day = addDays(input.today, -back);
    const all = Object.entries(
      await input.kv.hgetall(seasonResultsKey(input.env, day)),
    );
    if (all.length === 0) continue;
    const rows = [];
    for (const [visitorId, text] of all) {
      const season = parseSeasonEntry(text);
      if (!season || !UUID_V4.test(visitorId)) continue;
      rows.push({ visitor_id: visitorId, ...season });
    }
    const malformed = all.length - rows.length;
    if (malformed > 0) {
      out.skipped += malformed;
      out.notes.push(`${day}: ${malformed} malformed season(s) skipped`);
    }
    if (rows.length === 0) continue;
    const result = await input.db.query(INSERT_SQL, [
      day,
      JSON.stringify(rows),
    ]);
    const written = result.rowCount ?? 0;
    out.copied += written;
    out.already += rows.length - written;
  }
  return out;
}
