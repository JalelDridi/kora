// P54: a footballer who leaves the active pool stays guessable in Chkoun?
// for 60 days. He is never a day's answer during his grace (the calendar
// requires the active pool). No imports: the game page reads this too.

export const GRACE_DAYS = 60;

type Pools = { active: boolean; graceUntil?: string };

/** "YYYY-MM-DD" plus n days. */
export function addDays(day: string, n: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

/**
 * Tonight's grace: none when active; today + 60 days on the first night out
 * of the active pool; the same date afterwards while it is today or later;
 * none once it has passed.
 */
export function graceUntilFor(
  previous: Pools | undefined,
  activeTonight: boolean,
  today: string,
): string | undefined {
  if (activeTonight || !previous) return undefined;
  if (previous.active) return addDays(today, GRACE_DAYS);
  if (previous.graceUntil !== undefined && previous.graceUntil >= today)
    return previous.graceUntil;
  return undefined;
}

/**
 * Whether a footballer's grace still holds on the build day. Without a build
 * day, the presence of the date is enough: the nightly build removes it once
 * it has passed.
 */
export function graceInEffect(pools: Pools, buildDay?: string | null): boolean {
  if (pools.graceUntil === undefined) return false;
  return buildDay ? pools.graceUntil >= buildDay : true;
}

/** Who a visitor may guess: the active pool, and footballers in grace. */
export function isGuessable(pools: Pools, buildDay?: string | null): boolean {
  return pools.active || graceInEffect(pools, buildDay);
}
