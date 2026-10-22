import { constantTimeEqual } from "@/admin/access";
import type { ApiResult } from "./guess.ts";
import { chkounKey } from "./kv.ts";
import type { Kv } from "./kv.ts";
import type { CopyResult } from "./copy.ts";

// GET /api/cron/nightly, without Next (N2 (a)): Vercel Cron calls it once a
// day with `Authorization: Bearer <CRON_SECRET>`. It copies the last 7 days
// of finished Chkoun? games, then of 30–0's first seasons, from Redis to
// Postgres, then tops up the calendar, and keeps the outcome in Redis
// (job:nightly, 30 days) for /admin/chkoun. A missing or wrong secret does
// nothing at all. Each step runs in its own try: a failed one still runs the
// next and the answer is 500. Outcomes hold counts, days and error codes,
// never a footballer.

export const JOB_TTL_SECONDS = 30 * 86_400;

export type TopUpResult = { written: number; filled: number; window: number };

export type NightlyJob = {
  at: string;
  ok: boolean;
  copied: number | null;
  skipped: number | null;
  /** First seasons of 30–0 copied; null when the season copy failed. */
  seasons: number | null;
  written: number | null;
  filled: number | null;
  window: number | null;
  notes: string[];
};

export const jobKey = (env: string) => chkounKey(env, "job:nightly");

export async function runNightly(deps: {
  authorization: string | null;
  secret: string | undefined;
  kv: Kv | null;
  env: string;
  now: Date;
  copy: () => Promise<CopyResult>;
  copySeasons: () => Promise<CopyResult>;
  topUp: () => Promise<TopUpResult>;
  /** An error's code or class, never its message's data. */
  describe: (error: unknown) => string;
}): Promise<ApiResult> {
  if (!deps.secret)
    return { status: 503, body: { ok: false, error: "notConfigured" } };
  if (!constantTimeEqual(deps.authorization ?? "", `Bearer ${deps.secret}`))
    return { status: 401, body: { ok: false, error: "unauthorized" } };

  const job: NightlyJob = {
    at: deps.now.toISOString(),
    ok: true,
    copied: null,
    skipped: null,
    seasons: null,
    written: null,
    filled: null,
    window: null,
    notes: [],
  };
  try {
    const copy = await deps.copy();
    job.copied = copy.copied;
    job.skipped = copy.skipped;
    job.notes.push(...copy.notes);
  } catch (error) {
    job.ok = false;
    job.notes.push(`copy failed (${deps.describe(error)})`);
  }
  try {
    const seasons = await deps.copySeasons();
    job.seasons = seasons.copied;
    // "Redis is off" is said once for both copies.
    for (const note of seasons.notes)
      if (!job.notes.includes(note)) job.notes.push(note);
  } catch (error) {
    job.ok = false;
    job.notes.push(`season copy failed (${deps.describe(error)})`);
  }
  try {
    const topUp = await deps.topUp();
    job.written = topUp.written;
    job.filled = topUp.filled;
    job.window = topUp.window;
  } catch (error) {
    job.ok = false;
    job.notes.push(`calendar top-up failed (${deps.describe(error)})`);
  }
  if (deps.kv)
    await deps.kv
      .set(jobKey(deps.env), JSON.stringify(job), { ex: JOB_TTL_SECONDS })
      .catch(() => job.notes.push("the outcome could not be kept in Redis"));
  return { status: job.ok ? 200 : 500, body: { ...job } };
}

/** The last night's outcome, for /admin/chkoun; null when none is kept. */
export async function readNightly(
  kv: Kv,
  env: string,
): Promise<NightlyJob | null> {
  const text = await kv.get(jobKey(env));
  if (!text) return null;
  try {
    return JSON.parse(text) as NightlyJob;
  } catch {
    return null;
  }
}
