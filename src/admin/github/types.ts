// The admin dashboard's view of the repository on GitHub (decision P60):
// every save is one commit on main, every rebuild a dispatch of the nightly
// workflow. Two implementations: HttpGitHub (the REST API, with the token)
// and FakeGitHub (in memory or in a JSON file, for the tests).

export type RepoFile = { path: string; text: string; sha: string };
export type CommitInfo = {
  sha: string;
  parent: string | null;
  message: string;
  date: string;
  url: string;
  files: string[];
};
export type RunInfo = {
  id: number;
  status: "queued" | "in_progress" | "completed";
  conclusion: string | null;
  event: string;
  createdAt: string;
  url: string;
  headSha: string;
};
export type JobInfo = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  url: string;
};
export type PullInfo = {
  number: number;
  state: "open" | "closed";
  merged: boolean;
  autoMerge: boolean;
  headSha: string;
  url: string;
  title: string;
};

/**
 * A failed call: the HTTP status (0 when GitHub was not reached), the
 * client method that failed and GitHub's request id when it sent one. Never
 * the URL, a header or the response body, so it can be shown and logged.
 */
export class GitHubError extends Error {
  constructor(
    readonly status: number,
    readonly what: string,
    readonly requestId: string | null = null,
  ) {
    super(
      `GitHub ${what}: ${status}${requestId ? ` (request ${requestId})` : ""}`,
    );
    this.name = "GitHubError";
  }
}

export type Workflow = "nightly-data.yml" | "ci.yml";

export interface GitHub {
  readFile(path: string, ref?: string): Promise<RepoFile>;
  /** One file, one commit on main; `sha` is the blob read before (409 when main moved). */
  commitFile(input: {
    path: string;
    text: string;
    sha: string;
    message: string;
  }): Promise<CommitInfo>;
  /** Newest first; `files` lists the asked paths each commit touched. */
  listCommits(input: {
    paths: string[];
    perPage: number;
  }): Promise<CommitInfo[]>;
  getCommit(sha: string): Promise<CommitInfo>;
  dispatchWorkflow(
    file: "nightly-data.yml",
    inputs: Record<string, string>,
  ): Promise<void>;
  workflowRuns(
    file: Workflow,
    query: { headSha?: string; perPage: number },
  ): Promise<RunInfo[]>;
  runJobs(runId: number): Promise<JobInfo[]>;
  /** The last `lines` lines of a job's log (plain text). */
  jobLogTail(jobId: number, lines: number): Promise<string[]>;
  /** The newest pull request from data/nightly, open or not. */
  dataPullRequest(): Promise<PullInfo | null>;
  /** Days until the token expires, from GitHub's response header; null when it never does. */
  tokenDaysLeft(): number | null;
}

export const REPO = {
  owner: "JalelDridi",
  repo: "kora",
  branch: "main",
} as const;

/** The last `lines` non-empty-at-the-end lines of a log text. */
export function tailLines(text: string, lines: number): string[] {
  const all = text.replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n");
  return lines > 0 ? all.slice(-lines) : [];
}
