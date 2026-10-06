import { addDays } from "@/engine/chkoun/day.ts";
import type { Day } from "@/engine/chkoun/types.ts";
import type { SqlClient } from "@/pipeline/calendar.ts";
import type { Kv } from "./kv.ts";
import { parseEntry, resultsKey } from "./store.ts";

// The nightly copy of finished games from Redis to Postgres (D-S2-1, N2,
// N3): the last 7 days before today, one INSERT per day, each game at most
// once (ON CONFLICT (game, day, visitor_id) DO NOTHING), so a failed night
// is caught up the next one, for as long as Redis keeps the day (8 days).
// Nothing is deleted from Redis. Postgres keeps per game: day, visitor id,
// solved, guesses and the colour grid; never a guessed footballer. Notes
// name days and counts only.

export const COPY_DAYS = 7;

export type CopyResult = {
  /** Games written to Postgres this run. */
  copied: number;
  /** Games already in Postgres from an earlier night. */
  already: number;
  /** Games that cannot be copied: malformed, or a day without a puzzle. */
  skipped: number;
  notes: string[];
};

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const PUZZLE_SQL = `
SELECT id FROM puzzles WHERE game = 'chkoun' AND day = $1::date`;

const INSERT_SQL = `
INSERT INTO results (id, game, day, visitor_id, puzzle_id, solved, score, detail)
SELECT gen_random_uuid(), 'chkoun', $1::date, r.visitor_id, $2::uuid,
       r.solved, r.score, jsonb_build_object('grid', r.grid)
FROM jsonb_to_recordset($3::jsonb)
  AS r(visitor_id uuid, solved boolean, score int, grid jsonb)
ON CONFLICT (game, day, visitor_id) DO NOTHING`;

export async function copyResults(input: {
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
    const entries = await input.kv.hgetall(resultsKey(input.env, day));
    const all = Object.entries(entries);
    if (all.length === 0) continue;
    const rows: {
      visitor_id: string;
      solved: boolean;
      score: number;
      grid: string[];
    }[] = [];
    for (const [visitorId, text] of all) {
      const game = parseEntry(text);
      if (!game || !UUID_V4.test(visitorId)) continue;
      rows.push({
        visitor_id: visitorId,
        solved: game.solved,
        score: game.guesses,
        grid: game.grid,
      });
    }
    const malformed = all.length - rows.length;
    if (malformed > 0) {
      out.skipped += malformed;
      out.notes.push(`${day}: ${malformed} malformed game(s) skipped`);
    }
    if (rows.length === 0) continue;
    const { rows: puzzle } = await input.db.query(PUZZLE_SQL, [day]);
    if (puzzle.length === 0) {
      out.skipped += rows.length;
      out.notes.push(`${day}: no puzzle row, ${rows.length} game(s) skipped`);
      continue;
    }
    const result = await input.db.query(INSERT_SQL, [
      day,
      String(puzzle[0].id),
      JSON.stringify(rows),
    ]);
    const written = result.rowCount ?? 0;
    out.copied += written;
    out.already += rows.length - written;
  }
  return out;
}
