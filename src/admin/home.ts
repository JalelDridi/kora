import {
  addDays,
  isFrozen,
  puzzleNumber,
  weekday,
} from "@/engine/chkoun/day.ts";
import type { Day } from "@/engine/chkoun/types.ts";
import { CANDIDATES_SQL } from "@/pipeline/calendar.ts";
import type { SqlClient } from "@/pipeline/calendar.ts";
import { CROSS_CHECKED } from "@/pipeline/confidence.ts";
import type { Pool } from "@/pipeline/types.ts";
import type { AdminDay } from "./calendar.ts";
import { chkounView } from "./games.ts";
import { GitHubError, type GitHub } from "./github/types.ts";
import { FIELD_LABEL, flagKinds, summarize, toQuery } from "./pool.ts";
import { readRebuild, type RebuildState } from "./rebuild.ts";

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

// The dashboard home (/admin, Task 9): six cards, each read here so the
// page only lays them out. One calendar query; GitHub only when it is on.

export type PoolCounts = {
  active: number;
  legend: number;
  answerReady: number;
  grace: number;
  leftOut: number;
};

/** The pool card: the review's counts and Chkoun?'s (answer-ready, grace). */
export function poolCounts(pool: Pool): PoolCounts {
  const summary = summarize(pool);
  const chkoun = chkounView(pool, "").counts;
  return {
    active: summary.active,
    legend: summary.legend,
    answerReady: chkoun.answerReady,
    grace: chkoun.grace,
    leftOut: summary.dropped.reduce((sum, [, n]) => sum + n, 0),
  };
}

export type ReviewItem = { label: string; count: number; href: string };

const REVIEW_TOP = 5;

/**
 * The review card: each flag kind and each cross-checked field rated low,
 * with how many footballers have it, most first, the top five; each links
 * the pool review filtered to them.
 */
export function reviewItems(pool: Pool): ReviewItem[] {
  const blank = {
    confidence: null,
    field: null,
    pool: null,
    flag: null,
    q: "",
    page: 1,
  } as const;
  const lows: ReviewItem[] = CROSS_CHECKED.map((field) => ({
    label: `${FIELD_LABEL[field]}: low confidence`,
    count: pool.players.filter((p) => p.provenance[field]?.confidence === "low")
      .length,
    href: `/admin/pool${toQuery({ ...blank, confidence: "low", field })}`,
  }));
  const flags: ReviewItem[] = flagKinds(pool).map(([kind, count]) => ({
    label: `Flag ${kind}`,
    count,
    href: `/admin/pool${toQuery({ ...blank, flag: kind })}`,
  }));
  return [...lows, ...flags]
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "en"))
    .slice(0, REVIEW_TOP);
}

export type LastRebuild =
  | { kind: "none" }
  | { kind: "error"; status: number }
  | {
      kind: "run";
      stage: string;
      /** When the run started (GitHub's ISO time). */
      date: string;
      /** The scheduled night, not a Rebuild now. */
      scheduled: boolean;
      url: string;
      pull: { number: number; url: string; state: string } | null;
    };

/** The stage in a word or three, as the rebuild page heads it. */
function stageLabel(state: RebuildState, scheduled: boolean): string {
  switch (state.stage) {
    case "idle":
      return "No run";
    case "queued":
      return "Queued";
    case "building":
      return "Building";
    case "refused":
      return "Refused";
    case "failed":
      return "Failed";
    case "no-change":
      return "No change";
    case "checking":
      return "Checking";
    case "ci-failed":
      return "CI failed";
    case "merging":
      // The scheduled night's pull request waits for review by design.
      if (scheduled && state.noRequiredCheck) return "Waiting for review";
      return state.noRequiredCheck ? "Not merged by itself" : "Merging";
    case "merged":
      return "Merged";
  }
}

/** The newest nightly run, scheduled or dispatched, and where it stands. */
export async function lastRebuild(github: GitHub): Promise<LastRebuild> {
  const view = await readRebuild(github, null, { newest: true });
  const run = view.state.run;
  if (!run) return { kind: "none" };
  const scheduled = run.event !== "workflow_dispatch";
  const pull = view.state.pull;
  return {
    kind: "run",
    stage: stageLabel(view.state, scheduled),
    date: run.createdAt,
    scheduled,
    url: run.url,
    pull: pull
      ? { number: pull.number, url: pull.url, state: pull.state }
      : null,
  };
}

export type GitHubCard = { text: string; warn: boolean };

/** A token this close to its end is shown red. */
export const TOKEN_WARN_DAYS = 30;

const RENEW = "make a new one and replace KORA_GITHUB_TOKEN in Vercel.";
const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

/**
 * The GitHub card's words: null when no GitHub is configured; else the
 * token's days left (null when GitHub sent no expiry) and the status of a
 * call that failed.
 */
export function githubCard(
  github: { daysLeft: number | null; status?: number } | null,
): GitHubCard {
  if (!github)
    return {
      text: "Not connected: no KORA_GITHUB_TOKEN on this deployment. Every page reads; saves, undo and Rebuild now are off.",
      warn: false,
    };
  const { daysLeft, status } = github;
  if (status !== undefined)
    return {
      text:
        status === 401
          ? "Connected, but GitHub refused the token (401): it may have expired."
          : status === 0
            ? "Connected, but GitHub could not be reached."
            : `Connected, but GitHub did not answer (${status}).`,
      warn: true,
    };
  if (daysLeft === null)
    return {
      text: "Connected. GitHub sent no expiry date for the token.",
      warn: false,
    };
  if (daysLeft < 0)
    return {
      text: `Connected, but the token expired ${days(-daysLeft)} ago: ${RENEW}`,
      warn: true,
    };
  if (daysLeft < TOKEN_WARN_DAYS)
    return {
      text: `Connected. The token expires in ${days(daysLeft)}: ${RENEW}`,
      warn: true,
    };
  return {
    text: `Connected. The token expires in ${days(daysLeft)}.`,
    warn: false,
  };
}

export type HomeSummary = {
  /** Null when the calendar could not be read. */
  around: { today: AdminDay | null; tomorrow: AdminDay | null } | null;
  pool: PoolCounts;
  review: ReviewItem[];
  /** Null when GitHub is off. */
  rebuild: LastRebuild | null;
  github: GitHubCard;
};

/**
 * Everything the home shows: one calendar query (today's and tomorrow's
 * answers), the pool's counts, and GitHub's newest nightly run only when
 * GitHub is on; the token's days are read after that call, from its
 * answer's header.
 */
export async function homeSummary(input: {
  db: SqlClient;
  today: Day;
  pool: Pool;
  github: GitHub | null;
}): Promise<HomeSummary> {
  const { db, today, pool, github } = input;
  const [around, rebuild] = await Promise.all([
    answersAround(db, today).catch(() => null),
    github
      ? lastRebuild(github).catch((error: unknown): LastRebuild => {
          if (error instanceof GitHubError)
            return { kind: "error", status: error.status };
          throw error;
        })
      : null,
  ]);
  return {
    around,
    pool: poolCounts(pool),
    review: reviewItems(pool),
    rebuild,
    github: github
      ? githubCard({
          daysLeft: github.tokenDaysLeft(),
          ...(rebuild?.kind === "error" ? { status: rebuild.status } : {}),
        })
      : githubCard(null),
  };
}
