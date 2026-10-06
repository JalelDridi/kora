import {
  addDays,
  dayDiff,
  FIRST_DAY,
  isFrozen,
  puzzleNumber,
  weekday,
} from "@/engine/chkoun/day.ts";
import {
  drawOne,
  MAX_WINDOW,
  repeats,
  TIER_WEIGHTS,
} from "@/engine/chkoun/schedule.ts";
import type { CalendarRow } from "@/engine/chkoun/schedule.ts";
import type { Day } from "@/engine/chkoun/types.ts";
import {
  CALENDAR_DAYS,
  readCalendar,
  readCandidates,
  topUpCalendar,
} from "@/pipeline/calendar.ts";
import type { SqlClient } from "@/pipeline/calendar.ts";
import { ANSWER_READY_SQL } from "@/pipeline/confidence.ts";

// Jalel's Chkoun? calendar (/admin/chkoun, D-S2-2, D-S2-5): the last 7 and
// the next 30 days, and the three changes he can make to a day that is not
// frozen: swap (another footballer, still the generator's day), pin (his
// choice, kept by every top-up, any fame tier) and redraw (the seed draws
// again, without the current footballer). A frozen day refuses every change
// here and in the database (puzzles_frozen). English: a tool, not the game.

export const PAST_DAYS = 7;

export type AdminDay = {
  day: Day;
  number: number;
  weekday: number;
  playerId: string | null;
  nameLatin: string | null;
  nameArabic: string | null;
  tier: string | null;
  source: string | null;
  note: string | null;
  frozen: boolean;
  warnings: string[];
};

export type Pickable = { id: string; nameLatin: string; tier: string | null };

export type AdminCalendar = {
  today: Day;
  window: number;
  counts: { A: number; B: number; C: number };
  days: AdminDay[];
  /** Answer-ready, tier A to C: may be swapped in. */
  swappable: Pickable[];
  /** Answer-ready, tier A to D: may be pinned. */
  pinnable: Pickable[];
};

const PICKABLE_SQL = `
SELECT p.id, p.name_latin, p.fame_tier
FROM (${ANSWER_READY_SQL}) ready
JOIN players p ON p.id = ready.id
WHERE p.fame_tier IN ('A', 'B', 'C', 'D')
ORDER BY p.fame_tier, p.name_latin, p.id`;

const NAMES_SQL = `
SELECT id, name_latin, name_arabic, fame_tier FROM players WHERE id = ANY($1::text[])`;

const ROWS_SQL = `
SELECT to_char(day, 'YYYY-MM-DD') AS day, player_id, source, note
FROM puzzles
WHERE game = 'chkoun' AND day >= $1::date AND day < $2::date
ORDER BY day`;

function windowOf(eligible: number): number {
  return Math.max(0, Math.min(MAX_WINDOW, eligible - 1));
}

export async function loadAdminCalendar(
  db: SqlClient,
  today: Day,
  firstDay: Day = FIRST_DAY,
): Promise<AdminCalendar> {
  const candidates = await readCandidates(db);
  const eligible = new Set(candidates.map((c) => c.id));
  const window = windowOf(eligible.size);
  const counts = { A: 0, B: 0, C: 0 };
  for (const c of candidates) counts[c.tier as "A" | "B" | "C"]++;

  const from = addDays(today, -PAST_DAYS);
  const to = addDays(today, CALENDAR_DAYS);
  const { rows } = await db.query(ROWS_SQL, [from, to]);
  const byDay = new Map(rows.map((r) => [String(r.day), r]));
  // The window looks both ways: read the calendar around the shown days.
  const around = await readCalendar(
    db,
    addDays(from, -window),
    addDays(to, window),
  );
  const repeated = new Set(repeats(around, window).flat());
  const ids = [...new Set(rows.map((r) => String(r.player_id)))];
  const { rows: named } = await db.query(NAMES_SQL, [ids]);
  const names = new Map(named.map((r) => [String(r.id), r]));

  const days: AdminDay[] = [];
  for (let i = -PAST_DAYS; i < CALENDAR_DAYS; i++) {
    const day = addDays(today, i);
    const row = byDay.get(day);
    const playerId = row ? String(row.player_id) : null;
    const who = playerId ? names.get(playerId) : undefined;
    const warnings: string[] = [];
    if (i >= 0 && !row) warnings.push("empty");
    if (row && i >= 0 && !eligible.has(playerId!) && row.source !== "pin")
      warnings.push("no longer eligible");
    if (row && repeated.has(day)) warnings.push("repeated within the window");
    days.push({
      day,
      number: puzzleNumber(day, firstDay),
      weekday: weekday(day),
      playerId,
      nameLatin: who ? String(who.name_latin) : null,
      nameArabic: who?.name_arabic ? String(who.name_arabic) : null,
      tier: who?.fame_tier ? String(who.fame_tier) : null,
      source: row ? String(row.source) : null,
      note: row?.note ? String(row.note) : null,
      frozen: isFrozen(day, today),
      warnings,
    });
  }

  const { rows: picks } = await db.query(PICKABLE_SQL);
  const pinnable = picks.map((r) => ({
    id: String(r.id),
    nameLatin: String(r.name_latin),
    tier: r.fame_tier ? String(r.fame_tier) : null,
  }));
  return {
    today,
    window,
    counts,
    days,
    swappable: pinnable.filter((p) => eligible.has(p.id)),
    pinnable,
  };
}

/** A refused change; `code` maps to an English message on the page. */
export class CalendarActionError extends Error {
  constructor(readonly code: CalendarErrorCode) {
    super(CALENDAR_ERRORS[code]);
  }
}

export const CALENDAR_ERRORS = {
  "bad-day": "That is not a day of the calendar.",
  frozen: "This day is frozen: it starts in less than 48 hours.",
  "not-ready":
    "This footballer is not answer-ready with a fame tier that allows it (swap: A to C; pin: A to D).",
  "bad-note": "A note is 1 to 200 characters.",
  "no-seed": "CHKOUN_SEED is not set: nothing can be drawn.",
  "nobody-left": "No other footballer can be drawn for this day.",
} as const;

export type CalendarErrorCode = keyof typeof CALENDAR_ERRORS;

/**
 * The page's message for `?error=`: own keys only, so "__proto__" or
 * "toString" reads as unknown (review 2a). Null for anything unknown.
 */
export function calendarErrorMessage(code: unknown): string | null {
  if (typeof code !== "string") return null;
  if (Object.hasOwn(CALENDAR_ERRORS, code))
    return CALENDAR_ERRORS[code as CalendarErrorCode];
  return code === "failed" ? "The change failed; nothing was written." : null;
}

export type CalendarChange =
  | { action: "swap"; day: string; playerId: string }
  | { action: "pin"; day: string; playerId: string; note?: string }
  | { action: "redraw"; day: string };

const UPSERT_SQL = `
INSERT INTO puzzles (id, game, day, player_id, source, note)
VALUES (gen_random_uuid(), 'chkoun', $1::date, $2, $3, $4)
ON CONFLICT (game, day) DO UPDATE
  SET player_id = EXCLUDED.player_id, source = EXCLUDED.source, note = EXCLUDED.note`;

function checkDay(day: string, today: Day): Day {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    Number.isNaN(Date.parse(`${day}T00:00:00Z`)) ||
    addDays(day, 0) !== day
  )
    throw new CalendarActionError("bad-day");
  const ahead = dayDiff(today, day);
  if (ahead < 0 || ahead >= CALENDAR_DAYS)
    throw new CalendarActionError("bad-day");
  if (isFrozen(day, today)) throw new CalendarActionError("frozen");
  return day;
}

async function write(
  db: SqlClient,
  day: Day,
  playerId: string,
  source: "generator" | "pin",
  note: string,
): Promise<void> {
  try {
    await db.query(UPSERT_SQL, [day, playerId, source, note]);
  } catch (error) {
    // The trigger's own refusal: the day froze since the page was drawn.
    if ((error as { code?: unknown })?.code === "23514")
      throw new CalendarActionError("frozen");
    throw error;
  }
}

/**
 * Applies one change to an unfrozen day. A pin is followed by a top-up, so
 * a generator day near it that holds the same footballer is redrawn (review
 * L2). Returns nothing; refusals throw CalendarActionError.
 */
export async function changeDay(
  db: SqlClient,
  change: CalendarChange,
  context: { today: Day; seed: string | undefined },
): Promise<void> {
  const day = checkDay(change.day, context.today);
  if (change.action === "redraw") {
    if (!context.seed) throw new CalendarActionError("no-seed");
    const candidates = await readCandidates(db);
    const window = windowOf(candidates.length);
    const near = await readCalendar(
      db,
      addDays(day, -window),
      addDays(day, window + 1),
    );
    const current = near.find((r) => r.day === day)?.playerId;
    let drawn: string | null = null;
    for (let span = window; span >= 0 && drawn === null; span--) {
      const recent = near
        .filter(
          (r: CalendarRow) =>
            r.day !== day && Math.abs(dayDiff(day, r.day)) <= span,
        )
        .map((r) => r.playerId);
      drawn = drawOne({
        seed: context.seed,
        day,
        candidates,
        recent: current ? [...recent, current] : recent,
        tiers: TIER_WEIGHTS[weekday(day)],
      });
    }
    if (drawn === null) throw new CalendarActionError("nobody-left");
    await write(db, day, drawn, "generator", "redrawn by Jalel");
    return;
  }
  const { rows } = await db.query(PICKABLE_SQL);
  const allowed = new Set(
    rows
      .filter((r) =>
        change.action === "pin"
          ? true
          : ["A", "B", "C"].includes(String(r.fame_tier)),
      )
      .map((r) => String(r.id)),
  );
  if (!allowed.has(change.playerId)) throw new CalendarActionError("not-ready");
  if (change.action === "swap") {
    await write(db, day, change.playerId, "generator", "swapped by Jalel");
    return;
  }
  const note = change.note?.trim() || "pinned by Jalel";
  if (note.length > 200) throw new CalendarActionError("bad-note");
  await write(db, day, change.playerId, "pin", note);
  if (context.seed)
    await topUpCalendar({
      db,
      seed: context.seed,
      today: context.today,
      log: () => {},
    });
}
