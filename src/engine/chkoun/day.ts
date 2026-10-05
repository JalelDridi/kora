// The Tunis day. Every daily rule (the puzzle, the freeze, the streak) is
// keyed on the date in Africa/Tunis; nothing here assumes its offset.

import type { Day } from "./types.ts";

/** Puzzle #1. Moved to the go-live day at release (Task 16). */
export const FIRST_DAY: Day = "2026-10-05";

const TIME_ZONE = "Africa/Tunis";
const DAY_MS = 86_400_000;

const dateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const offsetFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  timeZoneName: "longOffset",
});

/** The date in Tunis at an instant. */
export function tunisDay(now: Date): Day {
  return dateFormat.format(now);
}

function utcMs(day: Day): number {
  return Date.parse(`${day}T00:00:00Z`);
}

/** Tunis minus UTC at an instant, in milliseconds ("GMT+01:00" → 3,600,000). */
function offsetMs(at: Date): number {
  const name =
    offsetFormat.formatToParts(at).find((p) => p.type === "timeZoneName")
      ?.value ?? "GMT";
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return (match[1] === "-" ? -1 : 1) * minutes * 60_000;
}

/** The instant the day after `day` starts in Tunis. */
export function nextMidnight(day: Day): Date {
  const wall = utcMs(addDays(day, 1));
  let instant = wall - offsetMs(new Date(wall));
  // A change of offset between the two instants: measure again where we landed.
  instant = wall - offsetMs(new Date(instant));
  return new Date(instant);
}

export function addDays(day: Day, n: number): Day {
  return new Date(utcMs(day) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Days from `from` to `to`: positive when `to` is later. */
export function dayDiff(from: Day, to: Day): number {
  return Math.round((utcMs(to) - utcMs(from)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday, from the date alone. */
export function weekday(day: Day): number {
  return new Date(utcMs(day)).getUTCDay();
}

/** 1 on `first`; 0 or less before it (callers read that as "not yet"). */
export function puzzleNumber(day: Day, first: Day = FIRST_DAY): number {
  return dayDiff(first, day) + 1;
}

export function dayOfNumber(n: number, first: Day = FIRST_DAY): Day {
  return addDays(first, n - 1);
}

/** Age in whole years on `day`. */
export function ageOn(birth: Day, day: Day): number {
  const years = Number(day.slice(0, 4)) - Number(birth.slice(0, 4));
  return day.slice(5) < birth.slice(5) ? years - 1 : years;
}

/** A day freezes 48 hours before it starts (D-S2-2): today and the next two days. */
export function isFrozen(day: Day, today: Day): boolean {
  return dayDiff(today, day) <= 2;
}
