import {
  addDays,
  isFrozen,
  puzzleNumber,
  weekday,
} from "@/engine/chkoun/day.ts";
import type { Day } from "@/engine/chkoun/types.ts";
import { CANDIDATES_SQL } from "@/pipeline/calendar.ts";
import type { SqlClient } from "@/pipeline/calendar.ts";
import type { AdminDay } from "./calendar.ts";

// Today's and tomorrow's Chkoun? answers, for the admin's game view: a thin
// read of the calendar table, one query, shaped as /admin/chkoun shows a
// day. Its warnings are the ones a single day can tell (not eligible any
// more); "repeated within the window" needs the whole window, and stays
// the calendar page's.

const AROUND_SQL = `
SELECT to_char(z.day, 'YYYY-MM-DD') AS day, z.player_id, z.source, z.note,
       p.name_latin, p.name_arabic, p.fame_tier, (c.id IS NOT NULL) AS eligible
FROM puzzles z
LEFT JOIN players p ON p.id = z.player_id
LEFT JOIN (${CANDIDATES_SQL}) c ON c.id = z.player_id
WHERE z.game = 'chkoun' AND z.day >= $1::date AND z.day < $2::date
ORDER BY z.day`;

export async function answersAround(
  db: SqlClient,
  today: Day,
): Promise<{ today: AdminDay | null; tomorrow: AdminDay | null }> {
  const { rows } = await db.query(AROUND_SQL, [today, addDays(today, 2)]);
  const byDay = new Map(rows.map((r) => [String(r.day), r]));
  const dayOf = (day: Day): AdminDay | null => {
    const row = byDay.get(day);
    if (!row) return null;
    return {
      day,
      number: puzzleNumber(day),
      weekday: weekday(day),
      playerId: String(row.player_id),
      nameLatin: row.name_latin ? String(row.name_latin) : null,
      nameArabic: row.name_arabic ? String(row.name_arabic) : null,
      tier: row.fame_tier ? String(row.fame_tier) : null,
      source: String(row.source),
      note: row.note ? String(row.note) : null,
      frozen: isFrozen(day, today),
      warnings:
        row.eligible || row.source === "pin" ? [] : ["no longer eligible"],
    };
  };
  return { today: dayOf(today), tomorrow: dayOf(addDays(today, 1)) };
}
