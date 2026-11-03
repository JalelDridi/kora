import type { GitHub, JobInfo, PullInfo, RunInfo } from "./github/types.ts";

// Where a "Rebuild now" stands (Task 7), from what GitHub lists: the nightly
// run dispatched at `dispatchedAt`, its jobs, the failed job's log tail, the
// data pull request and the CI runs on its head. Pure: the page reads
// GitHub, this decides the stage, and the page refreshes itself every 15 s
// while `refresh` is true.

/** A run as the stage reads it (GitHub's statuses, unnarrowed). */
export type RebuildRun = Omit<RunInfo, "status"> & { status: string };

export type RebuildStage =
  | "idle"
  | "queued"
  | "building"
  | "refused"
  | "failed"
  | "no-change"
  | "checking"
  | "ci-failed"
  | "merging"
  | "merged";

export type RebuildState = {
  stage: RebuildStage;
  run?: RebuildRun;
  /** The guard's lines from the build job's log, timestamps cut. */
  refusal?: string[];
  pull?: PullInfo;
  ciRun?: RebuildRun;
  /** GitHub refused auto-merge: "Allow auto-merge" is off in the settings. */
  autoMergeRefused?: boolean;
  refresh: boolean;
};

export type RebuildInput = {
  dispatchedAt: string | null;
  /** The nightly workflow's runs, newest first. */
  runs: RebuildRun[];
  jobs: JobInfo[];
  /** The tail of the failed job's log (the build's when it failed). */
  log: string[];
  pull: PullInfo | null;
  /** ci.yml's runs on the pull request's head, newest first. */
  ci: RebuildRun[];
};

/** GitHub's clock and the server's may differ by a few seconds. */
const SLACK_MS = 10_000;

const time = (iso: string) => Date.parse(iso);

/** The run a click started: the newest dispatched one from `since` minus 10 s on. */
export function findRun<R extends RebuildRun>(
  runs: R[],
  since: string,
): R | undefined {
  const from = time(since) - SLACK_MS;
  return runs
    .filter((r) => r.event === "workflow_dispatch" && time(r.createdAt) >= from)
    .sort((a, b) => time(b.createdAt) - time(a.createdAt))[0];
}

const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z ?/;
const GUARD = /data:build refused:|data:check: \d+ error/;
const MAX_LINES = 10;

/**
 * The guard's own words in a job log: the `data:build refused:` and
 * `data:check: N errors` lines, with the `data/…` lines printed next to
 * them (data:check prints its errors just before the count). At most 10,
 * the guard lines first kept; nothing when no guard line is there.
 */
export function refusalLines(log: string[]): string[] {
  const lines = log.map((l) => l.replace(STAMP, ""));
  const kept = new Set<number>();
  lines.forEach((line, i) => {
    if (!GUARD.test(line)) return;
    kept.add(i);
    for (let j = i - 1; j >= 0 && lines[j]!.startsWith("data/"); j--)
      kept.add(j);
    for (let j = i + 1; j < lines.length && lines[j]!.startsWith("data/"); j++)
      kept.add(j);
  });
  const order = [...kept].sort((a, b) => a - b);
  const guards = order.filter((i) => GUARD.test(lines[i]!)).length;
  let room = MAX_LINES - guards;
  return order
    .filter((i) => GUARD.test(lines[i]!) || room-- > 0)
    .slice(0, MAX_LINES)
    .map((i) => lines[i]!);
}

const AUTO_MERGE_REFUSED = /auto[- ]?merge is not allowed/i;

export function rebuildState(input: RebuildInput): RebuildState {
  if (input.dispatchedAt === null || Number.isNaN(time(input.dispatchedAt)))
    return { stage: "idle", refresh: false };
  const run = findRun(input.runs, input.dispatchedAt);
  if (!run) return { stage: "queued", refresh: true };
  if (run.status === "queued") return { stage: "queued", run, refresh: true };
  if (run.status !== "completed")
    return { stage: "building", run, refresh: true };

  const build = input.jobs.find((j) => j.name === "build");
  if (run.conclusion !== "success") {
    const refusal =
      build?.conclusion === "failure" ? refusalLines(input.log) : [];
    if (refusal.length > 0)
      return { stage: "refused", run, refusal, refresh: false };
    const autoMergeRefused = input.log.some((l) => AUTO_MERGE_REFUSED.test(l));
    return {
      stage: "failed",
      run,
      // The pull request only when the build passed: the propose job ran.
      ...(build?.conclusion === "success" && input.pull?.state === "open"
        ? { pull: input.pull }
        : {}),
      ...(autoMergeRefused ? { autoMergeRefused } : {}),
      refresh: false,
    };
  }

  // A green run: the pull request it opened or updated, if any. An open one
  // is this run's (a night that changes nothing closes it); a closed one
  // only when CI ran on its head after the click (else an earlier night's).
  const pull = input.pull;
  const from = time(input.dispatchedAt) - SLACK_MS;
  const ours = input.ci.filter(
    (r) => pull && r.headSha === pull.headSha && time(r.createdAt) >= from,
  );
  if (!pull || (pull.state === "closed" && ours.length === 0))
    return { stage: "no-change", run, refresh: false };
  const ciRun = input.ci.find((r) => r.headSha === pull.headSha);
  const withCi = ciRun ? { ciRun } : {};
  if (pull.merged)
    return { stage: "merged", run, pull, ...withCi, refresh: false };
  if (pull.state === "closed")
    return { stage: "failed", run, pull, ...withCi, refresh: false };
  if (!ciRun || ciRun.status !== "completed")
    return { stage: "checking", run, pull, ...withCi, refresh: true };
  if (!["success", "neutral", "skipped"].includes(ciRun.conclusion ?? ""))
    return { stage: "ci-failed", run, pull, ciRun, refresh: false };
  // Green: GitHub merges it when auto-merge is on; else it waits for a hand.
  return { stage: "merging", run, pull, ciRun, refresh: pull.autoMerge };
}

/** Enough of a log to hold data:check's errors and the post-job steps after them. */
const LOG_LINES = 200;

export type RebuildView = {
  state: RebuildState;
  /** The rebuild's run's jobs (build, propose). */
  jobs: JobInfo[];
  /** The last five nightly runs, newest first. */
  recent: RunInfo[];
  /** The newest nightly run is queued or in progress. */
  busy: boolean;
};

/**
 * What the rebuild page shows, read from GitHub: one call for the nightly's
 * runs, and only what the run's stage needs after that (its jobs; the
 * failed job's log; the data pull request and CI on its head).
 */
export async function readRebuild(
  github: GitHub,
  since: string | null,
): Promise<RebuildView> {
  const runs = await github.workflowRuns("nightly-data.yml", { perPage: 10 });
  const busy = runs[0] !== undefined && runs[0].status !== "completed";
  const run = since ? findRun(runs, since) : undefined;
  let jobs: JobInfo[] = [];
  let log: string[] = [];
  let pull: PullInfo | null = null;
  let ci: RunInfo[] = [];
  if (run && run.status !== "queued") jobs = await github.runJobs(run.id);
  if (run?.status === "completed") {
    const failed =
      jobs.find((j) => j.name === "build" && j.conclusion === "failure") ??
      jobs.find((j) => j.conclusion === "failure");
    // An unreadable log (expired, not there yet) is not the page's failure.
    if (run.conclusion !== "success" && failed)
      log = await github.jobLogTail(failed.id, LOG_LINES).catch(() => []);
    if (jobs.some((j) => j.name === "build" && j.conclusion === "success"))
      pull = await github.dataPullRequest();
    if (pull && run.conclusion === "success")
      ci = await github.workflowRuns("ci.yml", {
        headSha: pull.headSha,
        perPage: 5,
      });
  }
  return {
    state: rebuildState({ dispatchedAt: since, runs, jobs, log, pull, ci }),
    jobs,
    recent: runs.slice(0, 5),
    busy,
  };
}
