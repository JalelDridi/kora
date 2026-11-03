import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
import type { FakeSearch } from "../wikidata-search.ts";

// GitHub in memory, with the same contract as HttpGitHub: blob shas as git
// computes them, a 409 on a stale sha, a history that reads any file as it
// was at any commit. With `file`, every call reads and writes that JSON
// state, so the server under test (KORA_ADMIN_FAKES) and the browser spec
// that seeds and checks it share one repository.

export type FakeCommit = CommitInfo & {
  /** Each touched file's text before the commit; null when it was new. */
  before: Record<string, string | null>;
};
export type FakeRun = RunInfo & {
  workflow: Workflow;
  inputs: Record<string, string>;
};
export type FakeState = {
  /** main's file texts now. */
  files: Record<string, string>;
  /** Newest first. */
  commits: FakeCommit[];
  /** Newest first. */
  runs: FakeRun[];
  /** Jobs by run id. */
  jobs: Record<string, JobInfo[]>;
  /** Log texts by job id. */
  logs: Record<string, string>;
  pull: PullInfo | null;
  /** The Wikidata search fake's answers (the add page, src/admin/wikidata.ts). */
  search: FakeSearch;
};

const sha1 = (text: string) => createHash("sha1").update(text).digest("hex");

/** The blob sha git (and GitHub) gives a file's text. */
export const blobSha = (text: string) =>
  sha1(`blob ${Buffer.byteLength(text)}\0${text}`);

/** The parent of the fake's first commit: main before any dashboard edit. */
export const FAKE_ROOT = sha1("kora fake root");

const commitUrl = (sha: string) =>
  `https://github.com/${REPO.owner}/${REPO.repo}/commit/${sha}`;

const info = (c: FakeCommit): CommitInfo => ({
  sha: c.sha,
  parent: c.parent,
  message: c.message,
  date: c.date,
  url: c.url,
  files: [...c.files],
});

export class FakeGitHub implements GitHub {
  readonly #file: string | undefined;
  #memory: FakeState;

  constructor(options: { files: Record<string, string>; file?: string }) {
    this.#file = options.file;
    this.#memory = {
      files: { ...options.files },
      commits: [],
      runs: [],
      jobs: {},
      logs: {},
      pull: null,
      search: {},
    };
    if (this.#file && !existsSync(this.#file)) this.#save(this.#memory);
  }

  /** The current state; with a file, a fresh read of it (write with `update`). */
  get state(): FakeState {
    if (!this.#file) return this.#memory;
    return JSON.parse(readFileSync(this.#file, "utf8")) as FakeState;
  }

  /** Reads the state, lets `change` edit it, writes it back. */
  update<T>(change: (state: FakeState) => T): T {
    const state = this.state;
    const result = change(state);
    this.#save(state);
    return result;
  }

  #save(state: FakeState) {
    if (this.#file) writeFileSync(this.#file, JSON.stringify(state, null, 2));
    else this.#memory = state;
  }

  #head(state: FakeState) {
    return state.commits[0]?.sha ?? FAKE_ROOT;
  }

  /** main's files as they were at `ref`; null for an unknown ref. */
  #treeAt(state: FakeState, ref: string): Record<string, string> | null {
    const tree = { ...state.files };
    if (ref === REPO.branch || ref === this.#head(state)) return tree;
    for (const commit of state.commits) {
      if (commit.sha === ref) return tree;
      for (const [path, text] of Object.entries(commit.before)) {
        if (text === null) delete tree[path];
        else tree[path] = text;
      }
    }
    return ref === FAKE_ROOT ? tree : null;
  }

  async readFile(path: string, ref: string = REPO.branch): Promise<RepoFile> {
    const text = this.#treeAt(this.state, ref)?.[path];
    if (text === undefined) throw new GitHubError(404, "readFile");
    return { path, text, sha: blobSha(text) };
  }

  async commitFile(input: {
    path: string;
    text: string;
    sha: string;
    message: string;
  }): Promise<CommitInfo> {
    return this.update((state) => {
      const current = state.files[input.path];
      // As GitHub: no sha for an existing file (or one for a new file) is
      // 422; a stale sha is 409.
      if (current === undefined ? input.sha !== "" : input.sha === "")
        throw new GitHubError(422, "commitFile");
      if (current !== undefined && input.sha !== blobSha(current))
        throw new GitHubError(409, "commitFile");
      const parent = this.#head(state);
      const sha = sha1(
        `${parent}\0${input.path}\0${input.text}\0${input.message}`,
      );
      const commit: FakeCommit = {
        sha,
        parent,
        message: input.message,
        date: new Date().toISOString(),
        url: commitUrl(sha),
        files: [input.path],
        before: { [input.path]: current ?? null },
      };
      state.files[input.path] = input.text;
      state.commits.unshift(commit);
      return info(commit);
    });
  }

  async listCommits(input: {
    paths: string[];
    perPage: number;
  }): Promise<CommitInfo[]> {
    return this.state.commits
      .filter((c) => c.files.some((f) => input.paths.includes(f)))
      .slice(0, input.perPage)
      .map((c) => ({
        ...info(c),
        files: c.files.filter((f) => input.paths.includes(f)),
      }));
  }

  async getCommit(sha: string): Promise<CommitInfo> {
    const commit = this.state.commits.find((c) => c.sha === sha);
    // As GitHub: "No commit found for SHA" is 422.
    if (!commit) throw new GitHubError(422, "getCommit");
    return info(commit);
  }

  async dispatchWorkflow(
    file: "nightly-data.yml",
    inputs: Record<string, string>,
  ): Promise<number | null> {
    return this.update((state) => {
      const id = Math.max(0, ...state.runs.map((r) => r.id)) + 1;
      state.runs.unshift({
        id,
        workflow: file,
        inputs: { ...inputs },
        status: "queued",
        conclusion: null,
        event: "workflow_dispatch",
        createdAt: new Date().toISOString(),
        url: `https://github.com/${REPO.owner}/${REPO.repo}/actions/runs/${id}`,
        headSha: this.#head(state),
      });
      return id;
    });
  }

  async workflowRuns(
    file: Workflow,
    query: { headSha?: string; perPage: number },
  ): Promise<RunInfo[]> {
    return this.state.runs
      .filter((r) => r.workflow === file)
      .filter((r) => !query.headSha || r.headSha === query.headSha)
      .slice(0, query.perPage)
      .map((r) => ({
        id: r.id,
        status: r.status,
        conclusion: r.conclusion,
        event: r.event,
        createdAt: r.createdAt,
        url: r.url,
        headSha: r.headSha,
      }));
  }

  async runJobs(runId: number): Promise<JobInfo[]> {
    return this.state.jobs[String(runId)] ?? [];
  }

  async jobLogTail(jobId: number, lines: number): Promise<string[]> {
    const log = this.state.logs[String(jobId)];
    if (log === undefined) throw new GitHubError(404, "jobLogTail");
    return tailLines(log, lines);
  }

  async dataPullRequest(): Promise<PullInfo | null> {
    return this.state.pull;
  }

  tokenDaysLeft(): number | null {
    return null;
  }
}
