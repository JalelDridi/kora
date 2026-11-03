import "server-only";
import {
  GitHubError,
  REPO,
  tailLines,
  type CommitInfo,
  type GitHub,
  type JobInfo,
  type PullInfo,
  type RepoFile,
  type RunInfo,
  type Workflow,
} from "./types.ts";

// The GitHub REST API (v2022-11-28) for JalelDridi/kora only, over an
// injected fetch. The token goes out only as the bearer header; it is never
// logged and never in an error (GitHubError carries the status, the method
// and GitHub's request id). Request shapes: .superpowers research note
// "GitHub REST flow", confirmed read-only against the repository.

const API = `https://api.github.com/repos/${REPO.owner}/${REPO.repo}`;
const JSON_TYPE = "application/vnd.github+json";
const RAW_TYPE = "application/vnd.github.raw+json";

/**
 * A repository path, segment by segment. Empty, "." and ".." segments are
 * refused: the URL parser would resolve them and the request could leave
 * repos/JalelDridi/kora.
 */
function encodePath(path: string, what: string): string {
  const segments = path.split("/");
  if (segments.some((s) => s === "" || s === "." || s === ".."))
    throw new GitHubError(400, what);
  return segments.map(encodeURIComponent).join("/");
}

type RawCommit = {
  sha: string;
  html_url: string;
  parents: { sha: string }[];
  commit: {
    message: string;
    author?: { date?: string } | null;
    committer?: { date?: string } | null;
  };
  files?: { filename: string }[];
};

const toCommit = (c: RawCommit, files: string[]): CommitInfo => ({
  sha: c.sha,
  parent: c.parents[0]?.sha ?? null,
  message: c.commit.message,
  date: c.commit.committer?.date ?? c.commit.author?.date ?? "",
  url: c.html_url,
  files,
});

// The PUT contents answer's `commit` is a git commit object (GitHub's docs,
// "Create or update file contents", 200 example): message, committer and
// parents at its top level, no nested `commit`.
type RawGitCommit = {
  sha: string;
  message: string;
  author?: { date?: string } | null;
  committer?: { date?: string } | null;
  parents: { sha: string }[];
};

const fromGitCommit = (c: RawGitCommit, files: string[]): CommitInfo => ({
  sha: c.sha,
  parent: c.parents[0]?.sha ?? null,
  message: c.message,
  date: c.committer?.date ?? c.author?.date ?? "",
  // Its html_url is the git object's page; the commit page is this one.
  url: `https://github.com/${REPO.owner}/${REPO.repo}/commit/${c.sha}`,
  files,
});

type RawRun = {
  id: number;
  status: string;
  conclusion: string | null;
  event: string;
  created_at: string;
  html_url: string;
  head_sha: string;
};

const runStatus = (status: string): RunInfo["status"] =>
  status === "completed" || status === "in_progress" ? status : "queued";

/** "2027-11-01 10:00:00 UTC" → milliseconds; NaN when unreadable. */
function parseExpiration(value: string): number {
  return Date.parse(value.trim().replace(" ", "T").replace(/ UTC$/, "Z"));
}

export class HttpGitHub implements GitHub {
  // Private fields: neither JSON.stringify nor a spread ever shows them.
  readonly #token: string;
  readonly #fetch: typeof fetch;
  #expiresAt: number | null = null;

  constructor(token: string, fetchImpl: typeof fetch) {
    this.#token = token;
    this.#fetch = fetchImpl;
  }

  private async call(
    what: string,
    route: string,
    init: { method?: string; accept?: string; body?: unknown } = {},
  ): Promise<Response> {
    let response: Response;
    try {
      response = await this.#fetch(`${API}/${route}`, {
        method: init.method ?? "GET",
        headers: {
          accept: init.accept ?? JSON_TYPE,
          authorization: `Bearer ${this.#token}`,
          "x-github-api-version": "2022-11-28",
          "user-agent": "kora-admin",
          ...(init.body === undefined
            ? {}
            : { "content-type": "application/json" }),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        cache: "no-store",
      });
    } catch {
      // The fetch error may hold the URL; none of it goes further.
      throw new GitHubError(0, what);
    }
    const expiration = response.headers.get(
      "github-authentication-token-expiration",
    );
    if (expiration) {
      const at = parseExpiration(expiration);
      if (Number.isFinite(at)) this.#expiresAt = at;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new GitHubError(
        response.status,
        what,
        response.headers.get("x-github-request-id"),
      );
    }
    return response;
  }

  private async json<T>(
    what: string,
    route: string,
    init?: { method?: string; body?: unknown },
  ): Promise<T> {
    const response = await this.call(what, route, init);
    try {
      return (await response.json()) as T;
    } catch {
      throw new GitHubError(response.status, what);
    }
  }

  async readFile(path: string, ref: string = REPO.branch): Promise<RepoFile> {
    // The blob sha first, then that very blob's text: the two always match,
    // even when main moves between the calls. The raw media type has no
    // 1 MB limit (data/pool.json is never read through here anyway).
    const meta = await this.json<{ sha: string; type: string }>(
      "readFile",
      `contents/${encodePath(path, "readFile")}?ref=${encodeURIComponent(ref)}`,
    );
    if (meta.type !== "file") throw new GitHubError(404, "readFile");
    const raw = await this.call("readFile", `git/blobs/${meta.sha}`, {
      accept: RAW_TYPE,
    });
    return { path, text: await raw.text(), sha: meta.sha };
  }

  async commitFile(input: {
    path: string;
    text: string;
    sha: string;
    message: string;
  }): Promise<CommitInfo> {
    const answer = await this.json<{ commit: RawGitCommit }>(
      "commitFile",
      `contents/${encodePath(input.path, "commitFile")}`,
      {
        method: "PUT",
        body: {
          message: input.message,
          content: Buffer.from(input.text, "utf8").toString("base64"),
          ...(input.sha ? { sha: input.sha } : {}),
          branch: REPO.branch,
        },
      },
    );
    return fromGitCommit(answer.commit, [input.path]);
  }

  async listCommits(input: {
    paths: string[];
    perPage: number;
  }): Promise<CommitInfo[]> {
    // The API filters by one path a call; merge, newest first.
    const byPath = await Promise.all(
      input.paths.map((path) =>
        this.json<RawCommit[]>(
          "listCommits",
          `commits?path=${encodeURIComponent(path)}&sha=${REPO.branch}&per_page=${input.perPage}`,
        ).then((list) => list.map((c) => ({ c, path }))),
      ),
    );
    const merged = new Map<string, CommitInfo>();
    for (const { c, path } of byPath.flat()) {
      const known = merged.get(c.sha);
      if (known) known.files.push(path);
      else merged.set(c.sha, toCommit(c, [path]));
    }
    return [...merged.values()]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, input.perPage);
  }

  async getCommit(sha: string): Promise<CommitInfo> {
    const c = await this.json<RawCommit>(
      "getCommit",
      `commits/${encodeURIComponent(sha)}`,
    );
    return toCommit(
      c,
      (c.files ?? []).map((f) => f.filename),
    );
  }

  async dispatchWorkflow(
    file: "nightly-data.yml",
    inputs: Record<string, string>,
  ): Promise<number | null> {
    const response = await this.call(
      "dispatchWorkflow",
      `actions/workflows/${file}/dispatches`,
      {
        method: "POST",
        body: { ref: REPO.branch, inputs, return_run_details: true },
      },
    );
    // 200 with the run's id since February 2026; 204 and no body before.
    const text = await response.text().catch(() => "");
    try {
      const id = (JSON.parse(text) as { workflow_run_id?: unknown })
        .workflow_run_id;
      return typeof id === "number" ? id : null;
    } catch {
      return null;
    }
  }

  async workflowRuns(
    file: Workflow,
    query: { headSha?: string; perPage: number },
  ): Promise<RunInfo[]> {
    const params = new URLSearchParams({ per_page: String(query.perPage) });
    if (query.headSha) params.set("head_sha", query.headSha);
    const answer = await this.json<{ workflow_runs: RawRun[] }>(
      "workflowRuns",
      `actions/workflows/${file}/runs?${params}`,
    );
    return answer.workflow_runs.map((r) => ({
      id: r.id,
      status: runStatus(r.status),
      conclusion: r.conclusion,
      event: r.event,
      createdAt: r.created_at,
      url: r.html_url,
      headSha: r.head_sha,
    }));
  }

  async runJobs(runId: number): Promise<JobInfo[]> {
    const answer = await this.json<{
      jobs: {
        id: number;
        name: string;
        status: string;
        conclusion: string | null;
        html_url: string;
      }[];
    }>("runJobs", `actions/runs/${runId}/jobs?per_page=100`);
    return answer.jobs.map((j) => ({
      id: j.id,
      name: j.name,
      status: j.status,
      conclusion: j.conclusion,
      url: j.html_url,
    }));
  }

  async jobLogTail(jobId: number, lines: number): Promise<string[]> {
    // GitHub answers with a redirect to a signed download address; fetch
    // follows it and drops the authorization header on the way.
    const response = await this.call(
      "jobLogTail",
      `actions/jobs/${jobId}/logs`,
    );
    return tailLines(await response.text(), lines);
  }

  async dataPullRequest(): Promise<PullInfo | null> {
    const params = new URLSearchParams({
      head: `${REPO.owner}:data/nightly`,
      base: REPO.branch,
      state: "all",
      sort: "created",
      direction: "desc",
      per_page: "1",
    });
    const [pull] = await this.json<
      {
        number: number;
        state: "open" | "closed";
        merged_at: string | null;
        auto_merge: unknown;
        head: { sha: string };
        html_url: string;
        title: string;
      }[]
    >("dataPullRequest", `pulls?${params}`);
    if (!pull) return null;
    return {
      number: pull.number,
      state: pull.state,
      merged: pull.merged_at !== null,
      autoMerge: pull.auto_merge != null,
      headSha: pull.head.sha,
      url: pull.html_url,
      title: pull.title,
    };
  }

  tokenDaysLeft(): number | null {
    if (this.#expiresAt === null) return null;
    return Math.floor((this.#expiresAt - Date.now()) / 86_400_000);
  }
}
