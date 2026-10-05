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
/**
 * A refusal the build prints and exits 1 on: only a missing seed (P50). Its
 * message names no footballer.
 */
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

/** check_violation (the frozen-day trigger) or unique_violation. */
function isRace(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "23514" || code === "23505";
}

/**
 * Today's date in Tunis as Postgres sees it, so the top-up and the frozen
 * day trigger agree on "today" (review L4).
 */
export async function tunisToday(db: SqlClient): Promise<Day> {
  const { rows } = await db.query(
    "SELECT to_char((now() AT TIME ZONE 'Africa/Tunis')::date, 'YYYY-MM-DD') AS today",
  );
  return String(rows[0].today);
}

/** Why some days stay empty, in a few words; no footballer named. */
async function shortage(db: SqlClient, eligible: number): Promise<string> {
  if (eligible > 0)
    return `only ${eligible} eligible footballer${eligible === 1 ? "" : "s"} (answer-ready, tiers A to C), too few for every day's tiers and the repeat window`;
  const { rows } = await db.query(
    "SELECT count(*)::int AS n FROM players WHERE pool_active AND fame_tier IS NOT NULL",
  );
  return Number(rows[0]?.n ?? 0) === 0
    ? "no footballer has a fame tier yet"
    : "no answer-ready footballer has a tier A to C";
}

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
 * Tops the calendar up to `days` days from `today` (a Tunis date). Refuses
 * only without a seed. A data shortage, or a day that froze meanwhile, never
 * fails it (P50): it writes the days it can and prints one line saying how
 * many of the `days` are filled and why not all.
 */
export async function topUpCalendar(input: {
  db: SqlClient;
  seed: string | undefined;
  today: Day;
  days?: number;
  log: (line: string) => void;
}): Promise<{
  written: number;
  filled: number;
  window: number;
  notes: string[];
}> {
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
  const counts = { A: 0, B: 0, C: 0 } as Record<string, number>;
  for (const c of candidates) counts[c.tier]++;
  // Review L5: one summary line, plus one line per day whose window had to
  // shrink; never a footballer.
  for (const note of out.notes)
    if (note.includes("window shrunk")) log(`calendar: ${note}`);
  let written = 0;
  let race = false;
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
      // Review L4: a day froze between the read and the write (a deploy
      // around midnight in Tunis, or two Preview builds at once). That is a
      // data reason, so it never fails the build (P50): nothing is written
      // and the next top-up tries again.
      if (!isRace(error)) throw error;
      race = true;
    }
  }
  const filledDays = new Set([
    ...existing.map((r) => r.day),
    ...(race ? [] : out.write.map((r) => r.day)),
  ]);
  const filled = Array.from({ length: days }, (_, i) =>
    addDays(today, i),
  ).filter((d) => filledDays.has(d)).length;
  const summary = `chkoun calendar: ${filled} of ${days} days filled, ${written} written, ${candidates.length} eligible (A ${counts.A}, B ${counts.B}, C ${counts.C}), window ${out.window} days`;
  const why = race
    ? "a day froze or another deploy wrote it meanwhile; nothing written, the next top-up tries again"
    : filled < days
      ? await shortage(db, candidates.length)
      : null;
  log(why ? `${summary}: ${why}` : summary);
  return { written, filled, window: out.window, notes: out.notes };
}
