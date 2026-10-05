// The Chkoun? calendar in Postgres (D-S2-2): the next 30 days drawn from the
// secret seed, at every deploy (scripts/vercel-build.sh) and, from Task 10,
// every night. Frozen days, pins and reserves are never changed (schedule.ts
// and the puzzles_frozen trigger). Logs say how many days were written and
// the window, never which footballer: the calendar is the game's answers.

import { addDays } from "../engine/chkoun/day.ts";
import { schedule } from "../engine/chkoun/schedule.ts";
import type {
  CalendarRow,
  CalendarSource,
  Candidate,
} from "../engine/chkoun/schedule.ts";
import type { Day } from "../engine/chkoun/types.ts";
import { ANSWER_READY_SQL } from "./confidence.ts";

/** A pg client, or anything that answers like one. */
export type SqlClient = {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
};

export const CALENDAR_DAYS = 30;
/** The draw must see this far back to keep the repeat window (D-S2-5). */
export const HISTORY_DAYS = 120;
/** A deploy that cannot fill today and the next two days fails (stop rule). */
export const MUST_FILL_DAYS = 3;

/** A refusal the build prints and exits 1 on. Its message names no footballer. */
export class CalendarRefusal extends Error {}

/**
 * Footballers who may be a day's answer: ready (P27, D-S2-6) and tier A, B
 * or C (D-S2-4). Shared with today's reserve (src/chkoun/puzzle.server.ts).
 */
export const CANDIDATES_SQL = `
SELECT p.id, p.fame_tier AS tier
FROM (${ANSWER_READY_SQL}) ready
JOIN players p ON p.id = ready.id
WHERE p.fame_tier IN ('A', 'B', 'C')
ORDER BY p.id`;

/** The calendar's rows from `from` (inclusive) to `to` (exclusive). */
export const CALENDAR_SQL = `
SELECT to_char(day, 'YYYY-MM-DD') AS day, player_id, source
FROM puzzles
WHERE game = 'chkoun' AND day >= $1::date AND day < $2::date
ORDER BY day`;

// New and redrawn days in one statement. A day another writer filled
// meanwhile is overwritten only when it is still the generator's; the
// trigger refuses any change to a frozen day.
const UPSERT_SQL = `
INSERT INTO puzzles (id, game, day, player_id, source, note)
SELECT gen_random_uuid(), 'chkoun', r.day, r.player_id, 'generator', NULL
FROM jsonb_to_recordset($1::jsonb) AS r(day date, player_id text)
ON CONFLICT (game, day) DO UPDATE
  SET player_id = EXCLUDED.player_id, note = NULL
  WHERE puzzles.source = 'generator'
    AND puzzles.player_id IS DISTINCT FROM EXCLUDED.player_id`;

export async function readCandidates(db: SqlClient): Promise<Candidate[]> {
  const { rows } = await db.query(CANDIDATES_SQL);
  return rows.map((r) => ({ id: String(r.id), tier: String(r.tier) }));
}

export async function readCalendar(
  db: SqlClient,
  from: Day,
  to: Day,
): Promise<CalendarRow[]> {
  const { rows } = await db.query(CALENDAR_SQL, [from, to]);
  return rows.map((r) => ({
    day: String(r.day),
    playerId: String(r.player_id),
    source: String(r.source) as CalendarSource,
  }));
}

/**
 * Tops the calendar up to `days` days from `today` (a Tunis date). Refuses,
 * writing nothing, without a seed or when one of the first three days would
 * stay empty.
 */
export async function topUpCalendar(input: {
  db: SqlClient;
  seed: string | undefined;
  today: Day;
  days?: number;
  log: (line: string) => void;
}): Promise<{ written: number; window: number; notes: string[] }> {
  const { db, today, log } = input;
  const days = input.days ?? CALENDAR_DAYS;
  if (!input.seed)
    throw new CalendarRefusal(
      "CHKOUN_SEED is not set: the Chkoun? calendar cannot be drawn. Set it in Vercel for Production and Preview (decision D-S2-2)",
    );
  const candidates = await readCandidates(db);
  const existing = await readCalendar(
    db,
    addDays(today, -HISTORY_DAYS),
    addDays(today, days),
  );
  const out = schedule({
    seed: input.seed,
    today,
    days,
    candidates,
    existing,
  });
  const filled = new Set([
    ...existing.map((r) => r.day),
    ...out.write.map((r) => r.day),
  ]);
  const empty = Array.from({ length: MUST_FILL_DAYS }, (_, i) =>
    addDays(today, i),
  ).filter((d) => !filled.has(d));
  if (empty.length > 0)
    throw new CalendarRefusal(
      `the Chkoun? calendar cannot fill ${empty.join(", ")}: ${candidates.length} eligible footballers (answer-ready, tiers A to C); nothing written`,
    );
  const counts = { A: 0, B: 0, C: 0 } as Record<string, number>;
  for (const c of candidates) counts[c.tier]++;
  log(
    `calendar: ${candidates.length} eligible footballers (A ${counts.A}, B ${counts.B}, C ${counts.C}), window ${out.window} days`,
  );
  for (const note of out.notes) log(`calendar: ${note}`);
  let written = 0;
  if (out.write.length > 0) {
    await db.query("BEGIN");
    try {
      const result = await db.query(UPSERT_SQL, [
        JSON.stringify(
          out.write.map((r) => ({ day: r.day, player_id: r.playerId })),
        ),
      ]);
      written = result.rowCount ?? 0;
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK").catch(() => {});
      throw error;
    }
  }
  log(
    `calendar: ${written} day${written === 1 ? "" : "s"} written, ${today} to ${addDays(today, days - 1)}`,
  );
  return { written, window: out.window, notes: out.notes };
}
