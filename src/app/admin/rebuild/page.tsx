import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { adminAccess } from "@/admin/access";
import { getGitHub, GitHubError, type JobInfo } from "@/admin/github";
import {
  readRebuild,
  type RebuildRun,
  type RebuildState,
  type RebuildView,
} from "@/admin/rebuild";
import { rebuildNow } from "./actions";

// Rebuild now (Task 7): dispatch the nightly on main with merge_when_green,
// then follow it: the run, its two jobs, a guard's refusal in its own
// words, the pull request, CI and the merge. While something is under way
// the page reloads itself every 15 s (a <meta refresh>; no client script).

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Rebuild" };

const one = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value.at(-1) : value;

const SETTING = "Settings → General → Pull Requests → Allow auto-merge";

const ERRORS: Record<string, string> = {
  running: "Not started: a nightly run was already under way.",
  off: "GitHub is not connected on this deployment: Rebuild now is off.",
};

const when = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Tunis",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function stageWords(state: RebuildState): [string, string] {
  switch (state.stage) {
    case "idle":
      return ["Idle", "no rebuild started from this page."];
    case "queued":
      return ["Queued", "GitHub has the request; the run starts shortly."];
    case "building":
      return [
        "Building",
        "the nightly is reading the sources and checking the pool.",
      ];
    case "refused":
      return [
        "Refused",
        "a guard stopped the build; no pull request was opened.",
      ];
    case "failed":
      if (state.autoMergeRefused)
        return [
          "Failed",
          `GitHub refused auto-merge for this repository. Tick ${SETTING}, then merge the pull request by hand.`,
        ];
      if (state.pull?.state === "closed")
        return ["Failed", "the pull request was closed without merging."];
      return ["Failed", "the run did not finish; its page on GitHub says why."];
    case "no-change":
      return [
        "No change",
        "the rebuilt pool equals main's; no pull request to merge.",
      ];
    case "checking":
      return ["Checking", "CI is running on the pull request."];
    case "ci-failed":
      return [
        "CI failed",
        "the pull request stays open and does not merge; CI's run says why.",
      ];
    case "merging":
      return state.pull?.autoMerge
        ? ["Merging", "CI passed; GitHub merges the pull request shortly."]
        : [
            "CI passed",
            `auto-merge is off on this pull request: merge it by hand on GitHub (or tick ${SETTING} and rebuild).`,
          ];
    case "merged":
      return [
        "Merged",
        "the new pool is on main; the Production deploy follows.",
      ];
  }
}

function runResult(run: RebuildRun | JobInfo): string {
  if (run.status === "queued") return "queued";
  if (run.status !== "completed") return "in progress";
  return run.conclusion ?? "done";
}

function ciWords(ci: RebuildRun | undefined): string {
  if (!ci) return "not started";
  if (ci.status !== "completed") return "running";
  return ["success", "neutral", "skipped"].includes(ci.conclusion ?? "")
    ? "passed"
    : "failed";
}

type Read =
  | { kind: "off" }
  | { kind: "error"; error: GitHubError }
  | { kind: "read"; view: RebuildView };

async function read(since: string | null): Promise<Read> {
  const github = getGitHub();
  if (!github) return { kind: "off" };
  try {
    return { kind: "read", view: await readRebuild(github, since) };
  } catch (error) {
    if (error instanceof GitHubError) return { kind: "error", error };
    throw error;
  }
}

export default async function RebuildPage({
  searchParams,
}: PageProps<"/admin/rebuild">) {
  // The password again, never the proxy alone.
  const authorization = (await headers()).get("authorization");
  if (adminAccess(authorization, process.env.ADMIN_PASSWORD) !== "allow")
    notFound();
  const query = await searchParams;
  const sinceParam = one(query.since) ?? "";
  const since = Number.isNaN(Date.parse(sinceParam)) ? null : sinceParam;
  const error = one(query.error) ?? "";
  const status = Number(one(query.status));

  const result = await read(since);
  const view = result.kind === "read" ? result.view : null;
  const state = view?.state ?? { stage: "idle" as const, refresh: false };
  // A GitHub that did not answer this time: try again while following a run.
  const following =
    state.refresh || (result.kind === "error" && since !== null);
  // The visitor can stop the reloads (WCAG 2.2.1: a timed refresh the
  // reader can turn off).
  const stopped = one(query.reload) === "off";
  const refresh = following && !stopped;
  const here = (extra: Record<string, string>) =>
    `/admin/rebuild?${new URLSearchParams({ ...(since ? { since } : {}), ...extra })}`;
  const reason =
    result.kind === "off"
      ? "GitHub is not connected on this deployment (no KORA_GITHUB_TOKEN): Rebuild now is off."
      : view?.busy
        ? "A nightly run is under way: Rebuild now waits until it finishes."
        : null;
  const [stage, words] = stageWords(state);
  const errorText =
    ERRORS[error] ??
    (error === "github"
      ? `GitHub refused the request${Number.isInteger(status) && status > 0 ? ` (${status})` : ""}: nothing was started.`
      : null);

  return (
    <main className="rebuild">
      {refresh ? <meta httpEquiv="refresh" content="15" /> : null}
      <h1>Rebuild</h1>
      <p className="dim">
        Runs the nightly data workflow on main now. A night the guards refuse
        opens no pull request; otherwise the pull request merges itself once CI
        passes. The scheduled night still waits for review.
      </p>
      {errorText ? (
        <p role="alert" className="notice notice-error">
          {errorText}
        </p>
      ) : null}

      <form action={rebuildNow} className="actions">
        <button
          type="submit"
          disabled={reason !== null}
          aria-describedby={reason ? "busy" : undefined}
        >
          Rebuild now
        </button>
        {reason ? (
          <p id="busy" data-testid="busy" className="dim">
            {reason}
          </p>
        ) : null}
      </form>

      {result.kind === "error" ? (
        <p className="notice notice-error">
          GitHub did not answer as expected ({result.error.message})
          {result.error.status === 401 ? ": the token may have expired." : "."}
          {since ? " The page tries again in 15 seconds." : null}
        </p>
      ) : null}

      {since !== null || state.stage !== "idle" ? (
        <section aria-labelledby="this-rebuild">
          <h2 id="this-rebuild">This rebuild</h2>
          <p data-testid="stage" role="status">
            <strong>{stage}</strong>: {words}
          </p>
          {following ? (
            <div className="actions reload">
              <p className="dim">
                {refresh
                  ? "This page reloads itself every 15 seconds."
                  : "Reloading is off."}
              </p>
              {refresh ? (
                <a href={here({ reload: "off" })}>Stop reloading</a>
              ) : (
                <a href={here({})}>Reload and keep reloading</a>
              )}
            </div>
          ) : null}
          {state.run ? (
            <p className="run">
              <a href={state.run.url}>Run #{state.run.id} on GitHub</a>
            </p>
          ) : null}
          {view && view.jobs.length > 0 ? (
            <ul className="jobs">
              {view.jobs.map((job) => (
                <li key={job.id}>
                  <a href={job.url}>{job.name}</a>: {runResult(job)}
                </li>
              ))}
            </ul>
          ) : null}
          {state.refusal ? (
            <div role="alert" className="notice notice-error refusal">
              <p>The guard&apos;s words, from the build&apos;s log:</p>
              <pre>{state.refusal.join("\n")}</pre>
              <p>
                A drop you expect: run the workflow by hand with allow_pool_drop
                (Actions tab).
              </p>
            </div>
          ) : null}
          {state.pull ? (
            <ul className="pull" data-testid="pull">
              <li>
                Pull request{" "}
                <a href={state.pull.url}>
                  #{state.pull.number} {state.pull.title}
                </a>
              </li>
              <li>
                CI:{" "}
                {state.ciRun ? (
                  <a href={state.ciRun.url}>{ciWords(state.ciRun)}</a>
                ) : (
                  ciWords(undefined)
                )}
              </li>
              <li>Auto-merge: {state.pull.autoMerge ? "on" : "off"}</li>
            </ul>
          ) : null}
        </section>
      ) : null}

      {view ? (
        <div className="scroll">
          <table>
            <caption>Last nightly runs</caption>
            <thead>
              <tr>
                <th scope="col">Started (Tunis)</th>
                <th scope="col">By</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {view.recent.length === 0 ? (
                <tr>
                  <td colSpan={3}>No run yet.</td>
                </tr>
              ) : (
                view.recent.map((run) => (
                  <tr key={run.id}>
                    <td>
                      <a href={run.url}>
                        {when.format(new Date(run.createdAt))}
                      </a>
                    </td>
                    <td>
                      {run.event === "schedule"
                        ? "scheduled"
                        : run.event === "workflow_dispatch"
                          ? "dispatched"
                          : run.event}
                    </td>
                    <td>{runResult(run)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </main>
  );
}
