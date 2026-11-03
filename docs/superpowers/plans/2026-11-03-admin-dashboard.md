# Kora admin dashboard implementation plan: editing the data from a phone

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Draft for Jalel, 3 November 2026.** Built on Jalel's answers of 3 November 2026 through the question tool: dashboard edits are commits to the repository through GitHub (`data/overrides.json` and the curated files, validated with the pipeline's own validators before the commit; a GitHub fine-grained token in Vercel, `KORA_GITHUB_TOKEN`, Production only); a "Rebuild now" button dispatches the nightly workflow and its data pull request auto-merges once CI and the guards are green (the dashboard shows the run and the pull request status); v1 scope: the footballer editor with every override field, add a footballer by Wikidata search (an include override), exclude, local star, the six curated files, the Chkoun? calendar as today, the per-game views, a changes log with undo; live switches and tuning constants stay in code. Nothing here was run: no build, no test. Next.js references point at `node_modules/next/dist/docs/` (Next 16.3.8). Build on branch `admin-dashboard` from `main` c282cc4.

**Goal:** From his phone at 360 px, behind the admin password, Jalel corrects any footballer's override field, adds a footballer found on Wikidata, excludes one, tags a local star, edits the six curated files row by row, sees what each game makes of the pool, starts a rebuild whose data pull request merges itself when CI and the guards are green, and undoes any dashboard change. Every save is one validated commit on `main`; nothing is written anywhere else.

**Architecture:**
- **GitHub behind an interface** (`src/admin/github/`, server only): `GitHub` with `readFile`, `commitFile`, `listCommits`, `getCommit`, `dispatchWorkflow`, `workflowRuns`, `runJobs`, `jobLogTail`, `dataPullRequest`. `HttpGitHub` talks to the REST API with `KORA_GITHUB_TOKEN` and an injected `fetch`; `FakeGitHub` keeps the repository in memory or, for the browser tests, in a JSON file named by `KORA_ADMIN_FAKES` (refused when `VERCEL` is set). `getGitHub()` returns `null` without a token: every page still reads, every save button says "edits are off here" (Preview deployments, local runs).
- **Pure patch modules** (`src/admin/edit/`): read the file text from `main`, apply a change (one footballer's fields, one curated row), stamp `by: "jalel"` and `at` (today in Tunis), write the text in the file's own layout and Prettier's (T-AD-2), produce a human diff and the commit message. Validation runs the pipeline's own `inspectData` over an overlay (the deployment's data files with the edited file replaced), in `check` mode, as CI's `data:check` does.
- **No client script**, as the existing admin: server components, plain HTML forms. A preview is a GET of the same page with the form's values in the query (nothing stored); "Save" posts the same values to a server action that re-reads `main`, re-applies, re-validates and commits with the file's blob sha (a conflict re-reads once). Each server action checks the admin password itself (as `src/app/admin/chkoun/actions.ts`). The rebuild page refreshes itself with `<meta http-equiv="refresh" content="15">` while a run or a check is under way.
- **Pipeline:** a new override field `include` (T-AD-5) adds a Wikidata id to the three footballer queries, so the nightly fetches a footballer outside the Tunisia selection; the rest of the build treats him as any other.
- **Auto-merge** is enabled by the nightly workflow itself when dispatched with a new input `merge_when_green` (Open 2): `gh pr merge --auto --squash` on `data/nightly`; GitHub merges when `main`'s required check `check` passes. The guards run before the pull request exists: a refused night opens none, and the dashboard shows the refusal line from the job log.
- **Boundary:** public code (`src/app/[locale]`, `src/components`, `src/chkoun`, `src/season`, `src/engine`) never imports `@/admin/*`: an ESLint `no-restricted-imports` rule. `src/admin/github/*` and `src/admin/edit/commit.server.ts` start with `import "server-only"`.

**Tech Stack:** Next.js 16.3.8 (App Router, server actions), React 19.2.8, Prettier 3.9 at run time (moved from devDependencies to dependencies, Open 5; no new package), Vitest 5 (`fetch` throws in every unit test, `src/pipeline/no-network.ts`), Playwright 1.63 + `@axe-core/playwright`, Postgres through `withPg` for the calendar. GitHub REST API v2022-11-28, Wikidata `wbsearchentities` and `wbgetentities`. No new dependency.

**Done for the round means:** with `KORA_GITHUB_TOKEN` set in Vercel Production, Jalel on `/admin` at 360 px edits a footballer's club and sees the commit on `main`, adds a footballer by name and sees him in the pool after "Rebuild now" and the auto-merge, undoes the club edit with a revert commit, and edits a club's short label; every admin page is axe clean at 360 and 1280 px; no public page imports admin code; `bash check.sh` passes; Jalel has the screenshots, the decision rows (P60, T-AD-1 to T-AD-8) and the "once, in the settings" steps.

> **Approved by Jalel on 3 November 2026** through the question tool: edits are commits straight to `main` (unprotected) through GitHub with a fine-grained token in Vercel; Rebuild now dispatches the nightly and GitHub auto-merge, set by the workflow, merges its pull request when green (Jalel ticks "Allow auto-merge" in the repository settings); v1 scope as planned; every recommendation of the "Open for Jalel" list taken, recorded by Task 1 (P60) and Task 10 (T-AD-1 to T-AD-8). Token permissions: Contents, Actions and Pull requests read and write; Metadata, Checks and Commit statuses read; one year; `KORA_GITHUB_TOKEN` in Vercel, Production only, Sensitive.

## Global Constraints

From `CLAUDE.md` (verbatim where quoted):
- "**Jalel decides wording and architecture.** Propose with a recommendation, then wait. Record the outcome in `docs/decisions.md`." Every choice not decided on 3 November is in **Open for Jalel**, with the plan's recommendation, and recorded as a T-AD reading he may overrule. The admin's labels (nav, buttons, headings) are wording: listed in Open 11.
- The admin is **English only and not translated** (as `/admin/pool` and `/admin/chkoun`: nothing in `messages/`, `lang="en" dir="ltr"` from `src/app/admin/layout.tsx`). No Derja strings this round, so nothing for `docs/strings-for-jalel.md`, except the Arabic values Jalel types into the curated files.
- "**Western digits everywhere.** No letter-spacing or uppercase on translated text. Logical CSS properties only." Applies to `admin.css` too: `margin-inline`, `padding-block`, `inset-inline-end`.
- "**Vocabulary:** a player is a footballer; the person playing is a visitor."
- "**No secrets in the repo.**" `KORA_GITHUB_TOKEN` lives in Vercel Production only; `.env.example` documents it empty. The token is read only in `src/admin/github/index.ts`, used only in server actions and server components, never logged, never in an error message, never sent to the browser (a unit test pins each). Tests use no token; `HttpGitHub` tests get a fake `fetch` and the string `test-token`.
- "**Free tiers only.**" GitHub API (5,000 requests an hour for a token), Actions (public repository), Wikidata's API, Vercel Hobby: see **Free-tier arithmetic**.
- "Small conventional commits, one concern each. Tests accompany behaviour; database rules are tested against real Postgres, never mocks." The calendar reads (home card, Chkoun? view) get a `*.db.test.ts`.
- "Cut features before cutting tests or docs. If something goes wrong mid-task, stop and re-plan."
- "This is NOT the Next.js you know": read `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md` (server actions, `redirect`, `revalidatePath`) before T3, and `06-fetching-data.md` before T5.

Carried from earlier rounds:
- Tests never touch the network: Vitest's `fetch` throws; the browser tests run the built server with `KORA_ADMIN_FAKES` (GitHub and Wikidata fakes in one JSON file), never a token.
- One implementer at a time. Check free RAM before a build; stop under about 2 GB; build with `CIRCLE_NODE_TOTAL=2`. Never run checks with uncommitted changes in `data/pool.json`, `data/ids.json` or `data/report.md`.
- Lighthouse is not required on admin pages (`lighthouserc.json` is not edited; its five URLs are public). Axe is: every new admin page has an axe assertion.
- **Phones:** every admin page works at 360 px (no sideways scroll except inside a table's own scroll box, tap targets ≥ 44 px, inputs ≥ 16 px so iOS does not zoom).
- **Screenshots:** every task that changes something visible leaves PNGs under `.superpowers/sdd/2026-11-03-admin-dashboard/screens/task-N/` named `<page>-<width>-<state>.png` (360 and 1280), listed in the task report.
- **Shorthands:** **FAST** = `pnpm format && bash check-fast.sh` (expect `fast checks passed`). **COMMIT "msg" files** = FAST, then `git add <files> && git commit -m "msg" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"` (plus the session line the system reminder gives). **E2E spec** = `NEXT_PUBLIC_POSTHOG_KEY= CIRCLE_NODE_TOTAL=2 pnpm build && pnpm test:e2e <spec>`. Pull request description ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Dashboard commits** are Jalel's (his token): no co-author line, conventional subject `data(<file>): …`, an `Admin-Edit:` trailer (T-AD-3).

## File structure

New: `src/admin/github/{types.ts,http.ts,fake.ts,index.ts}` (+ `http.test.ts`, `fake.test.ts`), `src/admin/edit/{json-text.ts,overrides-patch.ts,curated-patch.ts,validate.ts,message.ts,undo.ts,commit.server.ts}` (+ tests), `src/admin/wikidata-search.ts` (+ test), `src/admin/games.ts` (+ test), `src/admin/rebuild.ts` (+ test), `src/admin/home.ts` (+ `home.db.test.ts`), `src/app/admin/page.tsx`, `src/app/admin/footballers/[qid]/{page.tsx,actions.ts}`, `src/app/admin/add/{page.tsx,actions.ts}`, `src/app/admin/games/{chkoun,season}/page.tsx`, `src/app/admin/settings/[file]/{page.tsx,actions.ts}`, `src/app/admin/rebuild/{page.tsx,actions.ts}`, `src/app/admin/changes/{page.tsx,actions.ts}`, `e2e/fixtures/admin-fakes.ts`, `e2e/admin-edit.spec.ts`, `e2e/admin-rebuild.spec.ts`. Everything else is a change to an existing file, listed per task.

---

### Task 1: The decision row, the GitHub client and the token (M)

**Files:**
- Create: `src/admin/github/types.ts`, `src/admin/github/http.ts`, `src/admin/github/fake.ts`, `src/admin/github/index.ts`, `src/admin/github/http.test.ts`, `src/admin/github/fake.test.ts`
- Modify: `docs/decisions.md` (section "3 November 2026: the admin dashboard", row P60), `.env.example` (`KORA_GITHUB_TOKEN`, `KORA_ADMIN_FAKES`), `.gitignore` (`/.e2e/`), `eslint.config.mjs` (the boundary), `next.config.ts` (`/admin/**` also traces `data/ids.json`, `data/witness.json`, `data/overrides.json`, `data/curated/*.json`)

**Interfaces:**
- Produces (`types.ts`):

```ts
export type RepoFile = { path: string; text: string; sha: string };
export type CommitInfo = { sha: string; parent: string | null; message: string; date: string; url: string; files: string[] };
export type RunInfo = { id: number; status: "queued" | "in_progress" | "completed"; conclusion: string | null; event: string; createdAt: string; url: string; headSha: string };
export type JobInfo = { id: number; name: string; status: string; conclusion: string | null; url: string };
export type PullInfo = { number: number; state: "open" | "closed"; merged: boolean; autoMerge: boolean; headSha: string; url: string; title: string };
export class GitHubError extends Error { constructor(readonly status: number, readonly what: string) { super(`GitHub ${what}: ${status}`); } }
export interface GitHub {
  readFile(path: string, ref?: string): Promise<RepoFile>;
  /** One file, one commit on main; `sha` is the blob read before (409 when main moved). */
  commitFile(input: { path: string; text: string; sha: string; message: string }): Promise<CommitInfo>;
  listCommits(input: { paths: string[]; perPage: number }): Promise<CommitInfo[]>;
  getCommit(sha: string): Promise<CommitInfo>;
  dispatchWorkflow(file: "nightly-data.yml", inputs: Record<string, string>): Promise<void>;
  workflowRuns(file: "nightly-data.yml" | "ci.yml", query: { headSha?: string; perPage: number }): Promise<RunInfo[]>;
  runJobs(runId: number): Promise<JobInfo[]>;
  /** The last `lines` lines of a job's log (plain text). */
  jobLogTail(jobId: number, lines: number): Promise<string[]>;
  /** The newest pull request from data/nightly, open or not. */
  dataPullRequest(): Promise<PullInfo | null>;
  /** Days until the token expires, from GitHub's response header; null when it never does. */
  tokenDaysLeft(): number | null;
}
export const REPO = { owner: "JalelDridi", repo: "kora", branch: "main" } as const;
```
- `HttpGitHub(token: string, fetchImpl: typeof fetch)`: `readFile` uses `Accept: application/vnd.github.raw+json` for the text and a second metadata call for the blob sha (the contents API refuses base64 over 1 MB; `pool.json` is never read through it); `commitFile` is `PUT /repos/{o}/{r}/contents/{path}` with `branch: "main"`; errors are `GitHubError(status, what)` only: never the URL with a query, a header, or the response body.
- `FakeGitHub({ files, file? })`: the same contract in memory; with `file`, every call reads and writes that JSON state (`{ files, commits, runs, jobs, logs, pull, search }`), so the server under test and the spec share it.
- `getGitHub(): GitHub | null` (`index.ts`, `import "server-only"`): `KORA_ADMIN_FAKES` set → throws when `process.env.VERCEL` is set, else `new FakeGitHub({ file })`; `KORA_GITHUB_TOKEN` set → `HttpGitHub`; else `null`.

- [ ] **Step 1: Decision row.** Append to `docs/decisions.md`:

| # | Decision | Outcome |
| --- | --- | --- |
| P60 | Admin dashboard | Dashboard edits are commits to the repository through GitHub: `data/overrides.json` and the curated files, validated with the pipeline's own validators before the commit; a GitHub fine-grained token in Vercel, `KORA_GITHUB_TOKEN`, Production only. A "Rebuild now" button dispatches the nightly workflow; its data pull request auto-merges once CI and the guards are green; the dashboard shows the run and the pull request status. v1: the footballer editor with every override field, add a footballer by Wikidata search (an include override the nightly fetches), exclude, local star, the six curated files, the Chkoun? calendar as today, per-game views (Chkoun?, 30–0), a changes log with undo (a commit restoring the previous content). Live switches and tuning constants stay in code. Decided by Jalel on 3 November 2026 through the question tool |

COMMIT `"docs: the admin dashboard decision (P60)"` with `docs/decisions.md`.
- [ ] **Step 2: Write the failing tests.** `src/admin/github/fake.test.ts` runs one contract against both clients (the HTTP one over a fake `fetch` that answers like GitHub from a `Map`):

```ts
import { describe, expect, it } from "vitest";
import { FakeGitHub } from "./fake.ts";
import { HttpGitHub } from "./http.ts";
import { fakeGitHubFetch } from "./http.test.ts";
import { GitHubError } from "./types.ts";

const seed = { "data/overrides.json": '{ "players": {}, "clubTitles": {} }\n' };
for (const [name, make] of [
  ["fake", () => new FakeGitHub({ files: { ...seed } })],
  ["http", () => new HttpGitHub("test-token", fakeGitHubFetch({ ...seed }).fetch)],
] as const) {
  describe(`GitHub contract: ${name}`, () => {
    it("reads a file with its sha and commits on top of it", async () => {
      const gh = make();
      const before = await gh.readFile("data/overrides.json");
      const commit = await gh.commitFile({ path: before.path, text: "{}\n", sha: before.sha, message: "data(overrides): test" });
      expect(commit.files).toEqual(["data/overrides.json"]);
      expect((await gh.readFile("data/overrides.json")).text).toBe("{}\n");
      expect((await gh.readFile("data/overrides.json", commit.parent!)).text).toBe(before.text);
      expect((await gh.listCommits({ paths: ["data/overrides.json"], perPage: 5 }))[0].sha).toBe(commit.sha);
    });
    it("refuses a commit on a stale sha with 409", async () => {
      const gh = make();
      const { sha } = await gh.readFile("data/overrides.json");
      await gh.commitFile({ path: "data/overrides.json", text: "{}\n", sha, message: "one" });
      await expect(gh.commitFile({ path: "data/overrides.json", text: "[]\n", sha, message: "two" })).rejects.toMatchObject({ status: 409 });
    });
    it("records a dispatch as a queued nightly run", async () => {
      const gh = make();
      await gh.dispatchWorkflow("nightly-data.yml", { merge_when_green: "true" });
      expect((await gh.workflowRuns("nightly-data.yml", { perPage: 1 }))[0]).toMatchObject({ event: "workflow_dispatch", status: "queued" });
    });
  });
}
```
`src/admin/github/http.test.ts` (exports `fakeGitHubFetch`, which also records every request):

```ts
it("sends the token as a bearer header and never puts it in an error", async () => {
  const gh = new HttpGitHub("test-token", fakeGitHubFetch({}, { status: 500 }).fetch);
  const error = await gh.readFile("data/overrides.json").catch((e: unknown) => e);
  expect(error).toBeInstanceOf(GitHubError);
  expect(String(error) + JSON.stringify(error)).not.toContain("test-token");
});
it("asks only for JalelDridi/kora and main", async () => {
  const f = fakeGitHubFetch({ "data/curated/honours.json": "[]\n" });
  await new HttpGitHub("test-token", f.fetch).readFile("data/curated/honours.json");
  expect(f.requests.every((r) => r.url.startsWith("https://api.github.com/repos/JalelDridi/kora/"))).toBe(true);
  expect(f.requests[0].headers.authorization).toBe("Bearer test-token");
});
it("reads the token's expiry from the response header", async () => {
  const f = fakeGitHubFetch({ "a.json": "1\n" }, { expiration: "2027-11-01 10:00:00 UTC" });
  const gh = new HttpGitHub("test-token", f.fetch);
  await gh.readFile("a.json");
  expect(gh.tokenDaysLeft()).toBeGreaterThan(300);
});
```
and in `src/admin/github/index.test.ts`: `getGitHub()` is `null` with neither variable; throws `"KORA_ADMIN_FAKES is for tests only"` when `VERCEL=1` and `KORA_ADMIN_FAKES` are both set.
- [ ] **Step 3: Run** `pnpm exec vitest run src/admin/github`. Expected: FAIL (modules missing).
- [ ] **Step 4: Implement** the four files. `.env.example` gains, after `ADMIN_PASSWORD`:

```
# Optional: the admin dashboard's GitHub token (decision P60). A fine-grained
# token for JalelDridi/kora only: Contents read and write, Actions read and
# write, Pull requests read, Metadata read. Set in Vercel, Production only,
# never here or in .env.local. Without it the dashboard reads but cannot save.
KORA_GITHUB_TOKEN=

# Tests only: a JSON file standing in for GitHub and Wikidata (the browser
# tests set it). Refused on Vercel. Leave it empty.
KORA_ADMIN_FAKES=
```
ESLint: `{ files: ["src/app/[[]locale]/**", "src/components/**", "src/chkoun/**", "src/season/**", "src/engine/**"], rules: { "no-restricted-imports": ["error", { patterns: ["@/admin/*", "**/admin/*"] }] } }`; a deliberate import in a scratch file must fail lint once (then delete it).
- [ ] **Step 5: Run** `pnpm exec vitest run src/admin/github`, `pnpm lint`. Expected: PASS.
- [ ] **Step 6:** COMMIT `"feat(admin): a GitHub client behind an interface, with a fake (P60)"` with `src/admin/github/ .env.example .gitignore eslint.config.mjs next.config.ts`.

### Task 2: The override and curated-file patch modules (L)

**Files:**
- Create: `src/admin/edit/json-text.ts`, `src/admin/edit/overrides-patch.ts`, `src/admin/edit/curated-patch.ts`, `src/admin/edit/validate.ts`, `src/admin/edit/message.ts`, `src/admin/edit/commit.server.ts`, and a `*.test.ts` beside each pure one
- Modify: `src/pipeline/check.ts` (extract `validateGovernorates`, `validateLigue1Clubs`, `validateHonours` from `inspectData`, unchanged rules; `inspectData(root)` becomes a wrapper of `inspectSource(source, options)`), `src/pipeline/check.test.ts` (the three extracted validators), `package.json` (`prettier` to `dependencies`, Open 5)

**Interfaces:**
- `json-text.ts`: `layoutOf(text: string): Layout` (for each object path, whether the text opens it on one line; new paths take the layout of their siblings); `writeJson(value: unknown, layout: Layout): Promise<string>` (writes with that layout, then `prettier/standalone` with the `babel` and `estree` plugins, parser `json`: the same text `pnpm format` would leave).
- `overrides-patch.ts`:

```ts
export type FieldChange = { field: keyof PlayerOverride; to: unknown } | { field: keyof PlayerOverride; remove: true };
export type OverridePatch = { qid: string; changes: FieldChange[]; note: string };
export type Applied = { text: string; json: unknown; diff: DiffLine[]; changed: boolean };
export type DiffLine = { path: string; before: string; after: string };
/** Pure: today is the Tunis day, by is "jalel". Exclude replaces the entry (validateOverrides refuses exclude beside other fields); include and exclude are one choice. */
export function applyOverridePatch(text: string, patch: OverridePatch, today: string): Promise<Applied>;
/** The form's strings to typed values: "" keeps, "none" is null for club and governorate, aliases one per line, pools from two checkboxes. */
export function parseOverrideForm(form: Record<string, string | string[]>): { patch: OverridePatch | null; errors: string[] };
```
- `curated-patch.ts`: one `CuratedFile` per file, `CURATED: Record<CuratedId, CuratedFile>` with `CuratedId = "ligue1-strength" | "club-short" | "honours" | "afcon-2004" | "ligue1-clubs" | "governorates"`; each `{ path, rows(json): Row[], key(row), apply(json, op: { kind: "set" | "add" | "remove"; key: string; row?: Row }, today): unknown, stamp: "file" | "row" | "none" }` (strength, club-short and afcon stamp `by`/`at` on the file; honours on the row; ligue1-clubs and governorates carry none). an edit by Jalel to `club-short` sets `by: "jalel"` and leaves the note alone, `DRAFT` included; Jalel removes the word himself on the settings page (Open 9, recommendation taken: the file records no author per row, so the dashboard cannot tell which rows are still Claude's).
- `validate.ts`: `validateEdit(path: string, nextText: string, base: DataSource): Promise<{ errors: string[]; warnings: string[] }>` = `inspectSource(overlay(base, { [path]: nextText }), { photos: false })`, keeping the lines about `path`'s file and any new cross-file error (the season slots, `seasonProblems`).
- `message.ts`: `commitMessage(input: { file: "overrides" | CuratedId; subject: string; lines: DiffLine[]; note: string; reverts?: string }): string`: subject `data(<file>): <subject>` (≤ 72 characters, cut with `…`), a blank line, one `- path: before → after` line per change, the note, then the trailer `Admin-Edit: <file>` (and `Reverts: <sha>` for an undo).
- `commit.server.ts`: `saveEdit({ path, make }: { path: string; make: (text: string) => Promise<Applied & { message: string }> }): Promise<{ ok: true; commit: CommitInfo } | { ok: false; errors: string[] }>`: read from `main`, `make`, `validateEdit`, `commitFile`; on 409 once more from the start.

- [ ] **Step 1: Write the failing tests.** `src/admin/edit/overrides-patch.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyOverridePatch, parseOverrideForm } from "./overrides-patch.ts";
import { commitMessage } from "./message.ts";

const text = readFileSync("data/overrides.json", "utf8");
const today = "2026-11-03";

describe("an override patch", () => {
  it("sets a field with by jalel, today and the note, and touches nothing else", async () => {
    const out = await applyOverridePatch(text, { qid: "Q2409513", changes: [{ field: "caps", to: 102 }], note: "FTF page" }, today);
    const players = (out.json as { players: Record<string, Record<string, unknown>> }).players;
    expect(players.Q2409513.caps).toEqual({ value: 102, by: "jalel", at: today, note: "FTF page" });
    expect(players.Q2409513.governorate).toEqual(JSON.parse(text).players.Q2409513.governorate);
    expect(out.diff).toEqual([{ path: "players.Q2409513.caps", before: "none", after: "102" }]);
    // Only the new lines differ: the rest of the file keeps its layout.
    const added = out.text.split("\n").filter((l) => !text.split("\n").includes(l));
    expect(added.length).toBeLessThanOrEqual(7);
  });
  it("removes a field, and the footballer when it was his last", async () => {
    const out = await applyOverridePatch(text, { qid: "Q2409513", changes: [{ field: "governorate", remove: true }], note: "" }, today);
    expect((out.json as { players: object }).players).not.toHaveProperty("Q2409513");
  });
  it("exclude replaces the whole entry; the diff lists what goes", async () => {
    const out = await applyOverridePatch(text, { qid: "Q58815643", changes: [{ field: "exclude", to: true }], note: "not Tunisian" }, today);
    expect(Object.keys((out.json as { players: Record<string, object> }).players.Q58815643)).toEqual(["exclude"]);
    expect(out.diff.some((d) => d.path === "players.Q58815643.club" && d.after === "none (excluded)")).toBe(true);
  });
  it("no change is no commit", async () => {
    const same = JSON.parse(text).players.Q2409513.governorate.value;
    expect((await applyOverridePatch(text, { qid: "Q2409513", changes: [{ field: "governorate", to: same }], note: "" }, today)).changed).toBe(false);
  });
  it("reads the form: none, aliases per line, pools, and refuses a bad caps", () => {
    expect(parseOverrideForm({ qid: "Q1", club: "none", aliases: "Msakni\nYoussef M.\n", "pools.active": "on", note: "x" }).patch?.changes).toEqual([
      { field: "club", to: null },
      { field: "aliases", to: ["Msakni", "Youssef M."] },
      { field: "pools", to: { active: true, legend: false } },
    ]);
    expect(parseOverrideForm({ qid: "Q1", caps: "-3", note: "" }).errors).toEqual(["caps: a whole number, 0 or more"]);
  });
  it("writes a short conventional subject with a trailer", () => {
    const m = commitMessage({ file: "overrides", subject: "Q2409513 Youssef Msakni: caps 102", lines: [{ path: "players.Q2409513.caps", before: "none", after: "102" }], note: "FTF page" });
    expect(m.split("\n")[0]).toBe("data(overrides): Q2409513 Youssef Msakni: caps 102");
    expect(m).toMatch(/\n\nAdmin-Edit: overrides$/);
  });
});
```
`src/admin/edit/json-text.test.ts` pins the layout against Prettier on every file the dashboard writes:

```ts
import { readFileSync } from "node:fs";
import { format } from "prettier";
import { expect, it } from "vitest";
import { layoutOf, writeJson } from "./json-text.ts";

const FILES = ["data/overrides.json", ...["ligue1-strength", "club-short", "honours", "afcon-2004", "ligue1-clubs", "governorates"].map((f) => `data/curated/${f}.json`)];
for (const file of FILES)
  it(`${file}: parse then write gives the file back, as Prettier leaves it`, async () => {
    const text = readFileSync(file, "utf8");
    expect(await writeJson(JSON.parse(text), layoutOf(text))).toBe(text);
    expect(await format(text, { parser: "json" })).toBe(text);
  });
it("a new club-short row takes its siblings' one-line layout", async () => {
  const text = readFileSync("data/curated/club-short.json", "utf8");
  const json = JSON.parse(text);
  json.clubs["new-club"] = { latin: "NEW", arabic: "الجديد" };
  expect(await writeJson(json, layoutOf(text))).toContain('"new-club": { "latin": "NEW", "arabic": "الجديد" }');
});
```
`src/admin/edit/curated-patch.test.ts`: per file, one `set`, one `add`, one `remove` against the committed file, each passing the file's own validator (`validateStrength`, `validateClubShort`, `validateAfcon`, and the three extracted ones), plus the refusals: a strength of 91, a short label of three words, a 24th AFCON footballer, a 25th governorate, a 21st Ligue 1 club, an honour edition twice. `src/admin/edit/validate.test.ts`: an overlay with a governorate id the overrides use removed gives the overrides error; an overlay with a strength entry removed gives `no strength for <id>`; the photo check does not run. `src/pipeline/check.test.ts`: the extracted validators give the same messages as before (copy the existing `inspectData` cases).
- [ ] **Step 2: Run** `pnpm exec vitest run src/admin/edit src/pipeline/check.test.ts`. Expected: FAIL (modules missing; validators not exported).
- [ ] **Step 3: Implement.** Extract the validators first (`refactor(data)`, no behaviour change: `pnpm exec vitest run src/pipeline` green before going on). `inspectSource(source: DataSource, options: { against?; allowPoolDrop?; photos?: boolean })` with `DataSource = { read(name: string): Promise<string | undefined>; publicFileExists(p: string): Promise<boolean> }`; `inspectData(root, options)` = `inspectSource(fsSource(root), options)`; `cli.ts` unchanged. The deployment's base source reads `process.cwd()/data` (traced since T1). Diff values print as the editor shows them (club ids with their pool name, `none`, `none (excluded)`).
- [ ] **Step 4: Run** `pnpm exec vitest run src/admin src/pipeline`. Expected: PASS.
- [ ] **Step 5:** COMMIT `"refactor(data): the governorates, Ligue 1 clubs and honours validators as functions"` with `src/pipeline/check.ts src/pipeline/check.test.ts`, then COMMIT `"feat(admin): override and curated-file patches, validated by data:check's rules"` with `src/admin/edit/ package.json pnpm-lock.yaml`.

### Task 3: The footballer editor (L)

**Files:**
- Create: `src/app/admin/footballers/[qid]/page.tsx`, `src/app/admin/footballers/[qid]/actions.ts`, `e2e/fixtures/admin-fakes.ts`, `e2e/admin-edit.spec.ts`
- Modify: `src/app/admin/pool/[id]/page.tsx` (an "Edit overrides" link), `src/app/admin/admin.css` (form rows, the diff), `playwright.config.ts` (`E2E_ENV.KORA_ADMIN_FAKES = ".e2e/admin-fakes.json"`), `src/admin/pool.ts` (`overrideRows(player, entry)`: per field, today's value, its source and confidence, the override in force with by, at and note)

**Interfaces:**
- Route `/admin/footballers/[qid]` (T-AD-4: by Wikidata id, so it also serves a footballer left out, excluded or just included). GET without `preview`: the form. GET with `preview=1` and the fields: the diff, the validation result, and a "Save" form with the same values hidden. Server action `saveFootballer(form: FormData): Promise<void>` (password check, `parseOverrideForm`, `saveEdit` on `data/overrides.json`, then `redirect("/admin/footballers/<qid>?saved=<sha>")` or `?error=<code>`).
- The form, one row per field of `PlayerOverride` (fourteen): label; today's value with its source and confidence (from the deployed pool); the override in force (value, by, at, note) with a "remove" checkbox; the input, pre-filled with the override's value or else today's: `club` a `<select>` of the pool's clubs by name (value = the club's Wikidata id) plus "none"; `position` a `<select>` of the four lines; `positionDetail`, `nameArabic` (`dir="rtl"`), `birthCountry` (2 letters) text; `caps`, `goals` `type="number" inputmode="numeric"`; `capsAsOf`, `birthDate` `type="date"`; `governorate` a `<select>` of the 24 plus "none"; `aliases` a `<textarea>`, one per line; `pools` two checkboxes; `exclude`, `localStar` checkboxes. One `note` for the save (required when a value changes, as P46 to P56 always had one). An input left at today's value with no override in force writes nothing.
- The saved page: "Saved as <short sha>" linking the commit on GitHub, the diff, and "The games change after a rebuild: Rebuild now" linking `/admin/rebuild` (T7).

- [ ] **Step 1: Read** `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`.
- [ ] **Step 2: Write the failing test** `e2e/admin-edit.spec.ts` (the fixture `resetFakes()` writes `.e2e/admin-fakes.json` from the working tree's `data/overrides.json` and curated files; `fakeCommits()` reads the state back):

```ts
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { E2E_ENV } from "../playwright.config";
import type { Pool } from "../src/pipeline/types";
import { fakeCommits, fakeFile, resetFakes } from "./fixtures/admin-fakes";

const pool = JSON.parse(readFileSync("data/pool.json", "utf8")) as Pool;
const basic = `Basic ${Buffer.from(`jalel:${E2E_ENV.ADMIN_PASSWORD}`).toString("base64")}`;
test.use({ extraHTTPHeaders: { Authorization: basic } });
test.beforeEach(() => resetFakes());
const someone = pool.players.find((p) => p.pools.active && p.clubId)!;

test("the editor shows today's values with their sources, previews a diff, saves one commit", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/admin/footballers/${someone.wikidataId}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(someone.nameLatin);
  await expect(page.getByLabel("Caps", { exact: true })).toHaveValue(String(someone.caps));
  await expect(page.getByTestId("caps-source")).toContainText(someone.provenance.caps?.confidence ?? "");
  await page.getByLabel("Caps", { exact: true }).fill(String(someone.caps + 1));
  await page.getByLabel("Note").fill("FTF page, 3 November");
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("table", { name: "Changes" })).toContainText(`${someone.caps} → ${someone.caps + 1}`);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/^Saved as [0-9a-f]{7}/)).toBeVisible();
  const [commit] = fakeCommits();
  expect(commit.message).toMatch(new RegExp(`^data\\(overrides\\): ${someone.wikidataId} `));
  expect(JSON.parse(fakeFile("data/overrides.json")).players[someone.wikidataId].caps).toMatchObject({ value: someone.caps + 1, by: "jalel", note: "FTF page, 3 November" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test("a value the validators refuse is shown, and nothing is committed", async ({ page }) => {
  await page.goto(`/admin/footballers/${someone.wikidataId}?preview=1&nameArabic=Msakni&note=x`);
  await expect(page.getByRole("alert")).toContainText("nameArabic: invalid value");
  await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
  expect(fakeCommits()).toEqual([]);
});

test("the save action refuses a request without the password", async ({ request }) => {
  const response = await request.post(`/admin/footballers/${someone.wikidataId}`, {
    headers: { Authorization: "", "Next-Action": "0".repeat(42) },
    multipart: { qid: someone.wikidataId, caps: "1", note: "x" },
  });
  expect(response.status()).toBe(401);
  expect(fakeCommits()).toEqual([]);
});
```
- [ ] **Step 3: Run** **E2E spec** `e2e/admin-edit.spec.ts`. Expected: FAIL (404: no route).
- [ ] **Step 4: Implement.** The page reads the overrides from `getGitHub()?.readFile("data/overrides.json")` (main's copy, so a save made a minute ago shows), falling back to the deployed file with a line "GitHub not connected: showing the deployed overrides; saving is off". Fields as `<div class="field">` rows stacking at 360 px (label, value and source on one line, input full width below). The diff is a `<table aria-label="Changes">` of path, before, after; errors in a `role="alert"` list; warnings (for example "not seen by the last build; the next build will decide") in a plain list.
- [ ] **Step 5: Run** **E2E spec** `e2e/admin-edit.spec.ts e2e/admin.spec.ts`. Expected: PASS. Screenshots `editor-360-form.png`, `editor-360-preview.png`, `editor-360-saved.png`, `editor-1280-form.png`.
- [ ] **Step 6:** COMMIT `"feat(admin): edit a footballer's overrides, previewed and saved as one commit"` with the files above.

### Task 4: Add a footballer from Wikidata, and exclude one (L)

**Files:**
- Create: `src/admin/wikidata-search.ts` (+ `wikidata-search.test.ts`), `src/app/admin/add/page.tsx`, `src/app/admin/add/actions.ts`
- Modify (pipeline): `src/pipeline/overrides.ts` (+ test), `src/pipeline/wikidata/queries.ts` (+ test), `src/pipeline/run.ts` (+ `run.test.ts`), `data/README.md` ("An override": `include`)
- Modify (admin): `src/admin/edit/overrides-patch.ts` (the `include` field), `src/app/admin/footballers/[qid]/page.tsx` (an "Exclude" form with its own note, and the include state), `e2e/admin-edit.spec.ts`

**What the pipeline does today (read on c282cc4):** the three footballer queries share `BASE` (`src/pipeline/wikidata/queries.ts`): occupation association football player (P106 Q937857) and citizenship Tunisia (P27) or country for sport Tunisia (P1532). In `run.ts` the build validates overrides against `players` = the ids that query returned: an id outside it is a **stale warning, not applied** when the id registry or the last pool's `dropped` list has seen him, else an **error that refuses the whole build** ("not a footballer in the pool"). `data:check` (`check.ts`, `knownIds`, mode `check`) only warns ("not seen by the last build; the next build will decide"). So an override alone can never bring a man in, and one for an unseen id breaks the nightly. **An `include` mechanism is needed.**

**Interfaces:**
- `PlayerOverride.include?: OverrideValue<true>` (T-AD-5). Rules in `validateOverrides`: value `true` only; `include` beside `exclude` is an error ("included and excluded at once"); in build mode an included id the queries did not return is a warning `players.Q…: included, but Wikidata returned no footballer for this id; not applied` (a deleted or merged item must not stop the nightly), never an error; check mode as today.
- `queries.ts`: `playersQuery(include: string[])`, `aliasesQuery(include)`, `membershipsQuery(include)`; `base(include)` = `BASE` plus `UNION { VALUES ?p { wd:Q1 wd:Q2 } }` when the list is not empty (ids checked against `^Q\d+$` again, sorted, so the query text is stable); `PLAYERS_QUERY` etc. stay exported as `playersQuery([])` so existing tests hold.
- `run.ts`: `const include = Object.entries(shape.overrides.players).filter(([, o]) => o.include?.value === true).map(([q]) => q)` before the Wikidata source; passed to the three queries. The SPARQL cache keeps the answers as sent: an offline build with a newer include list simply lacks the man (the warning above). Everything after (infoboxes, the request budget, pools, fame) treats him as any footballer; if he fits no pool he is in `dropped` with the reason, which the editor shows. Include adds at most a handful of titles to the request plan.
- `wikidata-search.ts`: `searchFootballers(query: string, fetchImpl: typeof fetch): Promise<SearchHit[]>`: `wbsearchentities` (`language=en&uselang=en&type=item&limit=10`), then one `wbgetentities` (`props=claims|labels|descriptions|sitelinks`) for the hits; `SearchHit = { qid; label; description; footballer: boolean; tunisian: boolean; born: string | null; enwiki: string | null; inPool: string | null; seen: "dropped" | "registry" | null }` (`inPool` the Kora id; `seen` from the deployed `ids.json` and `pool.dropped`). `USER_AGENT` from `src/pipeline/http.ts`; at most 2 requests a search; the query trimmed to 80 characters.
- `/admin/add`: a GET form `q`; results as cards (label, description, born, the two checks, "already in the pool" linking the editor, else "Add" posting `includeFootballer` with `qid` and a required note). The action writes `players.<qid>.include` through `saveEdit` and redirects to the editor of that id with `saved`, whose page says "He joins the pool at the next rebuild if his data qualifies him: Rebuild now".
- Exclude: on the editor, a separate form "Exclude from every game" with a note, previewed like any change (the diff lists every override of his that goes, T2); a footballer with `exclude` shows "Excluded since <at> (<note>)" and an "Include again" button that removes it.

- [ ] **Step 1: Write the failing tests.** In `src/pipeline/overrides.test.ts`:

```ts
const known = { players: new Set(["Q1"]), clubs: new Set<string>(), seen: new Set<string>() };
const v = (o: object) => ({ value: true, by: "jalel", at: "2026-11-03", ...o });
it("an include for an id Wikidata did not return is a warning in build mode, never a refusal", () => {
  const r = validateOverrides({ players: { Q9: { include: v({}) } }, clubTitles: {} }, new Set(), known);
  expect(r.ok && r.warnings).toEqual(["players.Q9: included, but Wikidata returned no footballer for this id; not applied"]);
});
it("include is true only, and never beside exclude", () => {
  expect(validateOverrides({ players: { Q1: { include: v({ value: false }) } }, clubTitles: {} }, new Set(), known).ok).toBe(false);
  const both = validateOverrides({ players: { Q1: { include: v({}), exclude: v({}) } }, clubTitles: {} }, new Set(), known);
  expect(!both.ok && both.errors).toEqual(["players.Q1: included and excluded at once"]);
});
```
In `src/pipeline/wikidata/queries.test.ts`:

```ts
it("an include list joins the selection of all three footballer queries, sorted", () => {
  for (const q of [playersQuery(["Q20", "Q3"]), aliasesQuery(["Q20", "Q3"]), membershipsQuery(["Q20", "Q3"])])
    expect(q).toContain("UNION { VALUES ?p { wd:Q3 wd:Q20 } }");
  expect(playersQuery([])).toBe(PLAYERS_QUERY);
  expect(() => playersQuery(["Q1 } ?x"])).toThrow();
});
```
In `src/pipeline/run.test.ts` (its fake `wdqs` already answers by label): `an included footballer outside the Tunisia selection is fetched and joins the pool` (the fake's players answer gains his row only when the posted query names `wd:Q999001`; the built pool holds him with `pools.active` from his data) and `an included id Wikidata does not return leaves the build going, with the warning in the log`. `src/admin/wikidata-search.test.ts` with a fake `fetch` (two canned answers): the hits keep Wikidata's order, `footballer`/`tunisian` read from P106 and P27/P1532, `inPool` from a small pool fixture, two requests in all, and a query of 200 characters is cut to 80.
- [ ] **Step 2: Run** `pnpm exec vitest run src/pipeline/overrides.test.ts src/pipeline/wikidata src/pipeline/run.test.ts src/admin/wikidata-search.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the pipeline part, then `data/README.md` (the `include` field in "An override": "`include` (`true`): fetch this Wikidata id with the Tunisian footballers even when Wikidata does not list him as one; he then joins whichever pool his data fits, or is left out with the reason, like anyone"). Run `pnpm exec vitest run src/pipeline` and `pnpm data:check`. Expected: PASS, no new warning.
- [ ] **Step 4:** COMMIT `"feat(data): an include override brings a footballer outside the Wikidata selection into the nightly"` with the pipeline files and `data/README.md`.
- [ ] **Step 5: Admin part.** The fakes file gains `search` (canned hits for "Msakni" and "Zzz"). Add to `e2e/admin-edit.spec.ts`: `search, add with a note, land on his editor with the include in the diff` (asserts the commit sets `players.<qid>.include.value === true`); `a footballer already in the pool links to his editor instead of Add`; `exclude previews every override that goes, saves, and Include again removes it` (two commits, the second restoring nothing else). Implement; **E2E spec** `e2e/admin-edit.spec.ts`. Expected: PASS. Screenshots `add-360-results.png`, `editor-360-exclude-preview.png`.
- [ ] **Step 6:** COMMIT `"feat(admin): add a footballer from a Wikidata search, exclude one"` with the admin files.

### Task 5: The per-game views (M)

**Files:**
- Create: `src/admin/games.ts` (+ `games.test.ts`), `src/admin/home.ts` (+ `home.db.test.ts`), `src/app/admin/games/chkoun/page.tsx`, `src/app/admin/games/season/page.tsx`
- Modify: `next.config.ts` (nothing more if T1 traced `data/curated/*.json`), `src/app/admin/admin.css`

**Interfaces:**
- `chkounView(pool: Pool, buildDay: string): ChkounView` = `{ counts: { active; answerReady; oneFieldAway; grace; tiers: Record<"A"|"B"|"C"|"D"|"unmeasured", number> }; rows: { id; qid; name; club; tier; fame; ready: boolean; away: string | null; graceUntil: string | null; localStar: boolean }[] }` from `isAnswerReady`, `oneFieldAway`, `graceInEffect`, `player.fame` (the build's own values: nothing recomputed).
- `answersAround(db, today): Promise<{ today: AdminDay | null; tomorrow: AdminDay | null }>` in `home.ts`, a thin read of the calendar table (the same rows `/admin/chkoun` shows).
- `seasonView(data: SeasonData): SeasonView` = per Ligue 1 club, per decade: the candidates (name, line, rating) best first, and the spin counts per line (`spinSummary`'s numbers as data, not text); `openTriples` and `total`.
- `/admin/games/chkoun`: the counts as a definition list; today's and tomorrow's answers with links to the calendar; a table (filters by `?show=ready|away|grace|tier-A…`) whose names link `/admin/footballers/<qid>`; "one field away" rows show the field and a "Local star" quick form (one checkbox, a note, Preview) when the field is fame.
- `/admin/games/season`: one `<details>` per club (name, strength, open triples), inside a table by decade and line with each candidate's rating; names link to the editor; the strength links `/admin/settings/ligue1-strength#<club>`.

- [ ] **Step 1: Write the failing tests.** `src/admin/games.test.ts` on a small pool built with the helpers of `src/pipeline/pool.test.ts`: the counts add up (`tiers` sums to `active`), a grace footballer counts once in `grace` and not in `answerReady` unless ready, `oneFieldAway` rows carry their field; `seasonView` on `buildSeasonData` of the committed files: every Ligue 1 club present, candidates sorted by rating descending, `openTriples` equals the number in `spinSummary(data).at(-1)`. `src/admin/home.db.test.ts` (real Postgres, the calendar fixtures of `src/admin/calendar.db.test.ts`): `answersAround` gives today's and tomorrow's rows, `null` for an empty day.
- [ ] **Step 2: Run** `pnpm exec vitest run src/admin/games.test.ts`, `pnpm test:db src/admin/home.db.test.ts`. Expected: FAIL.
- [ ] **Step 3: Read** `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md`; implement. Tables sit in a `.scroll` box (`overflow-x: auto`, `max-inline-size: 100%`, a `tabindex="0"` and an `aria-label` so axe accepts the scrollable region).
- [ ] **Step 4:** add to `e2e/admin-edit.spec.ts`: `the Chkoun? view counts the pool and links each footballer to his editor` (the counts read from `data/pool.json` in the spec), `the 30–0 view lists every Ligue 1 club with its candidates and ratings`, both axe clean at 360 px. **E2E spec** `e2e/admin-edit.spec.ts e2e/admin-chkoun.spec.ts`. Expected: PASS. Screenshots `chkoun-view-360.png`, `season-view-360-open.png`, both at 1280.
- [ ] **Step 5:** COMMIT `"feat(admin): what each game makes of the pool, with links to the editor"`.

### Task 6: The six curated files (L)

**Files:**
- Create: `src/app/admin/settings/[file]/page.tsx`, `src/app/admin/settings/[file]/actions.ts`, `src/app/admin/settings/page.tsx` (the list)
- Modify: `src/admin/edit/curated-patch.ts` (form readers), `src/app/admin/admin.css`, `e2e/admin-edit.spec.ts`

**Interfaces:**
- `/admin/settings/<id>` for the six `CuratedId`s; any other id is `notFound()`. The page reads main's copy, shows the file's header (`season`, `by`, `at`, `note` where it has them) and one table row per entry with an "Edit" link (`?edit=<key>`), "Remove" (`?remove=<key>`), and an "Add" link at the foot. Editing one row at a time keeps each preview's query short and each commit to one concern (T-AD-4).
- Row forms: **ligue1-strength** (club id from the pool's Ligue 1 clubs, a number 55 to 90); **club-short** (club from the pool's clubs, `latin`, `arabic` with `dir="rtl"`, the counts of words and letters shown beside each); **honours** (competition `<select>` of `competitions`, season start and end, the club by name, the row's `by`/`at` stamped); **afcon-2004** (a Wikidata id, with the name from the pool beside it when known); **ligue1-clubs** (an English Wikipedia title; the season as a header form); **governorates** (id, three names, region `<select>`; remove disabled: there are always 24, so only editing is offered).
- `saveCurated(form)`: password, `CURATED[id].apply`, `saveEdit`, redirect to `?saved=<sha>`. The commit subject: `data(club-short): es-zarzis ESZ / زرزيس`, `data(ligue1-strength): club-africain 77 → 79`.

- [ ] **Step 1: Write the failing tests** (e2e, the patch rules were unit-tested in T2): `club-short: edit a row, preview the diff, save one commit that passes data:check` (the spec then runs `inspectSource` over the fake's files: no error); `ligue1-strength: 91 is refused with the validator's message and no commit`; `honours: add an edition, then remove it`; `governorates: no Remove button; editing a name commits`; `an unknown settings page is 404`; each page axe clean at 360 px.
- [ ] **Step 2: Run** **E2E spec** `e2e/admin-edit.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** **E2E spec** `e2e/admin-edit.spec.ts`. Expected: PASS. Screenshots `settings-360-club-short.png`, `settings-360-club-short-preview.png`, `settings-360-strength-refused.png`, `settings-1280-honours.png`.
- [ ] **Step 5:** COMMIT `"feat(admin): edit the six curated files row by row"`.

### Task 7: Rebuild now, the run and the pull request (L)

**Files:**
- Create: `src/admin/rebuild.ts` (+ `rebuild.test.ts`), `src/app/admin/rebuild/page.tsx`, `src/app/admin/rebuild/actions.ts`, `e2e/admin-rebuild.spec.ts`
- Modify: `.github/workflows/nightly-data.yml` (input `merge_when_green`, passed to the propose job), `scripts/open-data-pr.sh` (`MERGE_WHEN_GREEN`), `src/pipeline/open-data-pr.test.ts`, `data/README.md` ("The nightly pull request": a dashboard rebuild)

**Interfaces:**
- Workflow: `merge_when_green: { description: "Merge the pull request by itself once CI passes (the admin dashboard's Rebuild now)", type: boolean, default: false }`; the propose job gets `env: MERGE_WHEN_GREEN: ${{ inputs.merge_when_green && '1' || '' }}`. The script, after `gh workflow run ci.yml`: `gh pr merge "$branch" --auto --squash` when `MERGE_WHEN_GREEN=1`, else `gh pr merge "$branch" --disable-auto || true` (a scheduled night never inherits an earlier auto-merge, Open 2); `--dry-run` prints which. The guards are unchanged: a refused build fails the build job and no pull request is proposed.
- `rebuildState(input: { dispatchedAt: string | null; runs: RunInfo[]; jobs: JobInfo[]; log: string[]; pull: PullInfo | null; ci: RunInfo[] }): RebuildState`, pure: `{ stage: "idle" | "queued" | "building" | "refused" | "failed" | "no-change" | "checking" | "ci-failed" | "merging" | "merged"; run?: RunInfo; refusal?: string[]; pull?: PullInfo; ciRun?: RunInfo; refresh: boolean }`. The refusal lines are those of the build job's log tail matching `data:build refused:`, `data:check: \d+ error`, or a line starting `data/` that follows them (at most 10, the log's timestamps cut).
- `rebuildNow()` action: password; refuses (`?error=running`) when the newest nightly run is queued or in progress; `dispatchWorkflow("nightly-data.yml", { allow_pool_drop: "false", merge_when_green: "true" })`; redirect to `/admin/rebuild?since=<ISO time>`. The run is the newest `workflow_dispatch` run created at or after `since` minus 10 seconds.
- `/admin/rebuild`: the "Rebuild now" button (disabled with the reason while one runs, or when GitHub is not connected), the stage in words, the run's link, its two jobs, the refusal lines in a `role="alert"` box with "A drop you expect: run the workflow by hand with allow_pool_drop (Actions tab)" (Open 7), the pull request's number, CI's state and auto-merge state, and the last five nightly runs. `<meta http-equiv="refresh" content="15">` while `refresh` is true.

- [ ] **Step 1: Write the failing tests.** `src/admin/rebuild.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { rebuildState } from "./rebuild.ts";

const run = (o: object) => ({ id: 7, status: "completed", conclusion: "success", event: "workflow_dispatch", createdAt: "2026-11-03T10:00:05Z", url: "u", headSha: "a", ...o });
const job = (name: string, conclusion: string | null) => ({ id: name === "build" ? 1 : 2, name, status: "completed", conclusion, url: "j" });
const base = { dispatchedAt: "2026-11-03T10:00:00Z", runs: [], jobs: [], log: [], pull: null, ci: [] };

describe("the rebuild stage", () => {
  it("queued until GitHub lists the run, and the page refreshes", () =>
    expect(rebuildState(base)).toMatchObject({ stage: "queued", refresh: true }));
  it("a refused build shows the guard's own words", () => {
    const s = rebuildState({ ...base, runs: [run({ conclusion: "failure" })], jobs: [job("build", "failure")],
      log: ["2026-11-03T10:03:00.1Z data:build refused: the night loses 14 of 230 active footballers (6.1%), over 5%", "2026-11-03T10:03:00.2Z ##[error]Process completed with exit code 1."] });
    expect(s).toMatchObject({ stage: "refused", refresh: false });
    expect(s.refusal).toEqual(["data:build refused: the night loses 14 of 230 active footballers (6.1%), over 5%"]);
  });
  it("no pull request after a green run is no change", () =>
    expect(rebuildState({ ...base, runs: [run({})], jobs: [job("build", "success"), job("propose", "success")] }).stage).toBe("no-change"));
  it("an open pull request with CI running is checking; green with auto-merge is merging; merged is merged", () => {
    const pull = { number: 43, state: "open" as const, merged: false, autoMerge: true, headSha: "b", url: "p", title: "data: nightly pool 2026-11-03" };
    const done = { ...base, runs: [run({})], jobs: [job("build", "success"), job("propose", "success")] };
    expect(rebuildState({ ...done, pull, ci: [run({ status: "in_progress", conclusion: null, headSha: "b" })] }).stage).toBe("checking");
    expect(rebuildState({ ...done, pull, ci: [run({ headSha: "b" })] }).stage).toBe("merging");
    expect(rebuildState({ ...done, pull: { ...pull, state: "closed", merged: true }, ci: [run({ headSha: "b" })] })).toMatchObject({ stage: "merged", refresh: false });
    expect(rebuildState({ ...done, pull, ci: [run({ conclusion: "failure", headSha: "b" })] }).stage).toBe("ci-failed");
  });
});
```
In `src/pipeline/open-data-pr.test.ts`: `--dry-run` with `MERGE_WHEN_GREEN=1` prints `would enable auto-merge (squash)`, without it `would turn auto-merge off`. `e2e/admin-rebuild.spec.ts`: the button dispatches one run in the fakes (`inputs.merge_when_green === "true"`); the page shows "Queued" with the refresh meta; the spec then writes a failed build with a refusal log into the fakes: reload shows the refusal in an alert and no refresh meta; then a green run, an open pull request with green CI and auto-merge: "Merging"; then merged: "Merged" with the pull request link; a second click while a run is in progress is refused; axe clean at 360 px.
- [ ] **Step 2: Run** `pnpm exec vitest run src/admin/rebuild.test.ts src/pipeline/open-data-pr.test.ts`, **E2E spec** `e2e/admin-rebuild.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `data/README.md`, after "Reviewing it": "**From the dashboard.** `/admin/rebuild` → Rebuild now runs this workflow on `main` with `merge_when_green`: the pull request merges itself once CI passes; a refused night shows the guard's words there. The scheduled night still waits for review." and under "Once, in the repository settings": "Settings → General → Pull Requests: tick **Allow auto-merge**."
- [ ] **Step 4: Run** the three again. Expected: PASS. Screenshots `rebuild-360-queued.png`, `rebuild-360-refused.png`, `rebuild-360-merging.png`, `rebuild-1280-merged.png`.
- [ ] **Step 5:** COMMIT `"ci(data): a dispatched rebuild can merge its pull request once CI passes"` with the workflow, script, script test and README, then COMMIT `"feat(admin): Rebuild now, with the run, the guards and the pull request"` with the rest.

### Task 8: The changes log and undo (M)

**Files:**
- Create: `src/admin/edit/undo.ts` (+ `undo.test.ts`), `src/app/admin/changes/page.tsx`, `src/app/admin/changes/actions.ts`
- Modify: `e2e/admin-edit.spec.ts`

**Interfaces:**
- `/admin/changes`: the last 30 commits on `main` touching `data/overrides.json` or `data/curated/` (`listCommits`), each with date (Tunis), subject, an "edited here" mark when it has the `Admin-Edit:` trailer, the GitHub link, and "Undo" (a GET preview `?undo=<sha>`, then a Save form).
- `undoPatch(input: { before: string; after: string; current: string; file: "overrides" | CuratedId }): Promise<{ ok: true; text: string; diff: DiffLine[] } | { ok: false; conflicts: string[] }>`, pure (T-AD-6): the entries the commit changed (overrides: `players.<qid>.<field>` and `clubTitles.<key>`; curated: rows by key, and the header fields) go back to their value in `before`, each only when `current` still holds the commit's value; any other entry is left as `current` has it. An entry changed again since is a conflict ("players.Q1.caps changed since; edit it instead"), and nothing is written.
- `undoChange(form)`: reads the commit (`getCommit`), the file at its parent and at it, main's copy; `undoPatch`; `validateEdit`; commits `revert(data): <original subject>` with `Reverts: <sha>` and `Admin-Edit: <file>`. A commit touching several files (a hand commit) offers no Undo: "made by hand; revert it on GitHub".

- [ ] **Step 1: Write the failing tests.** `src/admin/edit/undo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { undoPatch } from "./undo.ts";

const file = (players: object) => JSON.stringify({ players, clubTitles: {} }, null, 2) + "\n";
const o = (value: unknown, at = "2026-11-03") => ({ value, by: "jalel", at });

describe("undo", () => {
  it("restores what the commit changed and keeps later changes elsewhere", async () => {
    const before = file({ Q1: { caps: o(10, "2026-10-07") } });
    const after = file({ Q1: { caps: o(11) } });
    const current = file({ Q1: { caps: o(11) }, Q2: { localStar: o(true) } });
    const r = await undoPatch({ before, after, current, file: "overrides" });
    expect(r.ok && JSON.parse(r.text).players).toEqual({ Q1: { caps: o(10, "2026-10-07") }, Q2: { localStar: o(true) } });
  });
  it("an added footballer goes away entirely", async () => {
    const r = await undoPatch({ before: file({}), after: file({ Q9: { include: o(true) } }), current: file({ Q9: { include: o(true) } }), file: "overrides" });
    expect(r.ok && JSON.parse(r.text).players).toEqual({});
  });
  it("refuses when the entry changed again since", async () => {
    const r = await undoPatch({ before: file({}), after: file({ Q1: { caps: o(11) } }), current: file({ Q1: { caps: o(12) } }), file: "overrides" });
    expect(r).toEqual({ ok: false, conflicts: ["players.Q1.caps changed since; edit it instead"] });
  });
  it("works by row on a curated file", async () => {
    const short = (clubs: object) => JSON.stringify({ by: "jalel", at: "2026-11-03", note: "n", clubs }, null, 2) + "\n";
    const r = await undoPatch({ before: short({ a: { latin: "A", arabic: "أ" } }), after: short({ a: { latin: "AA", arabic: "أ" } }), current: short({ a: { latin: "AA", arabic: "أ" }, b: { latin: "B", arabic: "ب" } }), file: "club-short" });
    expect(r.ok && JSON.parse(r.text).clubs).toEqual({ a: { latin: "A", arabic: "أ" }, b: { latin: "B", arabic: "ب" } });
  });
});
```
In `e2e/admin-edit.spec.ts`: `the log lists a dashboard edit; Undo previews and commits a revert that restores the file` (edit caps, open `/admin/changes`, Undo, Save; the fakes' overrides equal the seed again; the second commit's subject starts `revert(data): `); `an entry changed twice cannot undo the first change`.
- [ ] **Step 2: Run** `pnpm exec vitest run src/admin/edit/undo.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the unit test and **E2E spec** `e2e/admin-edit.spec.ts`. Expected: PASS. Screenshots `changes-360.png`, `changes-360-undo-preview.png`, `changes-360-conflict.png`.
- [ ] **Step 5:** COMMIT `"feat(admin): the changes log, with undo as a revert commit"`.

### Task 9: The admin home, the nav and the phone layout (M)

**Files:**
- Create: `src/app/admin/page.tsx`
- Modify: `src/app/admin/layout.tsx` (the nav), `src/app/admin/admin.css` (mobile), `src/admin/home.ts` (+ test), `e2e/admin.spec.ts` (`/admin` now answers 200 with the password)

**Interfaces:**
- `/admin` cards, each a `<section>` with an `h2` and one link: **Today** (today's and tomorrow's Chkoun? answers from `answersAround`, linking the calendar); **The pool** (active, legend, answer-ready, grace, left out: from `summarize` and `chkounView`); **To review** (flag kinds and low-confidence fields, the top five, linking `/admin/pool?…`); **Last rebuild** (`rebuildState` of the newest nightly run: stage, date, pull request; linking `/admin/rebuild`); **GitHub** (connected or not, and the token's days left from `tokenDaysLeft()`, red under 30); **Quick links** (add a footballer, settings, changes).
- Nav (layout): Home, Pool, Games, Add, Settings, Rebuild, Changes, Calendar; at 360 px a horizontal scroll row of 44 px links with the current page marked (`aria-current`, `NavLink` as today). Wording in Open 11.
- `admin.css`: a base font of 16 px, `.cards` a one-column grid under 640 px and two columns above, form controls `min-block-size: 44px`, tables inside `.scroll`; logical properties only.

- [ ] **Step 1: Write the failing tests.** `src/admin/home.db.test.ts` gains `the home summary reads one calendar query and no GitHub call when GitHub is off`. In `e2e/admin.spec.ts`: `/admin is the dashboard home: six cards, the nav, axe clean, no sideways scroll at 360 px`; `every admin page has the nav with the current page marked` (loop over the eight paths); `the GitHub card says not connected when the fakes are off` is covered by a unit test of the card's text, not e2e (one server environment).
- [ ] **Step 2: Run** **E2E spec** `e2e/admin.spec.ts`. Expected: FAIL (`/admin` is 404).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** **E2E spec** `e2e/admin.spec.ts e2e/admin-chkoun.spec.ts e2e/admin-edit.spec.ts`. Expected: PASS. Screenshots `home-360.png`, `home-1280.png`, `nav-360-scrolled.png`, and `pool-360.png`, `calendar-360.png` (the existing pages under the new nav).
- [ ] **Step 5:** COMMIT `"feat(admin): a dashboard home with today, the pool, flags and the last rebuild"`.

### Task 10: Browser tests across the flows, screenshots, docs, pull request (M)

**Files:**
- Modify: `e2e/admin-edit.spec.ts` (one end-to-end story), `data/README.md` ("Editing from the dashboard"), `docs/decisions.md` (readings T-AD-1 to T-AD-8), `docs/handover/2026-11-03-session-8.md` (new), `docs/superpowers/specs/2026-10-03-kora-design.md` (the admin section)
- Test: everything (`bash check.sh`)

- [ ] **Step 1: The story test** in `e2e/admin-edit.spec.ts`, at 360 px from `/admin`: search and add a footballer → edit a known footballer's club → mark another a local star from the Chkoun? view → change a strength → Rebuild now (the fakes then report merged) → the changes log lists four dashboard commits → undo the club edit. Asserts the fakes' files after each step pass `inspectSource` with no error.
- [ ] **Step 2: Security checks** added to `e2e/security.spec.ts`: every new admin path answers 401 without the password; no admin page's HTML contains `KORA_GITHUB_TOKEN`'s value (the fakes path stands in) or the word `Bearer`; a public page's script chunks contain no `src/admin` module (search the `.next/static` files for `admin/github`).
- [ ] **Step 3: Run** `bash check.sh` (RAM check first; no uncommitted data files). Expected: all green.
- [ ] **Step 4: Screenshots** with a throwaway spec from the scratchpad (not committed): every admin page at 360×800 and 1280×800, the editor's preview and saved states, the rebuild stages, into `.superpowers/sdd/2026-11-03-admin-dashboard/screens/task-10/`. Check by eye: nothing cut, tables scroll inside their box, buttons 44 px.
- [ ] **Step 5: Docs.** `data/README.md`, a section "Editing from the dashboard": what each page writes (the file, the commit, `by: jalel`), that a save is a commit on `main` checked by `data:check`'s rules first, that the games change only after a rebuild is merged and deployed, undo, include, and "Once, in the settings (Jalel)": (1) GitHub → Settings → Developer settings → Fine-grained tokens → new token, repository `JalelDridi/kora` only, permissions Contents read and write, Actions read and write, Pull requests read, Metadata read, expiry one year; (2) Vercel → Project → Settings → Environment Variables → `KORA_GITHUB_TOKEN`, Production only, sensitive; redeploy; (3) GitHub → Settings → General → Allow auto-merge; (4) the branch rule on `main` lets Jalel's own pushes through (Open 1). Readings in `docs/decisions.md` ("Technical readings taken by the admin dashboard plan; Jalel may overrule any"):

| # | Topic | Reading |
| --- | --- | --- |
| T-AD-1 | GitHub client | `src/admin/github`, server only, behind the `GitHub` interface; the token read in one place; errors carry status and action only; a file-backed fake through `KORA_ADMIN_FAKES` for tests, refused on Vercel; without a token the dashboard reads and does not save |
| T-AD-2 | Writing a data file | Main's copy is read, patched, written in its own layout and Prettier's (Prettier at run time), checked by `inspectSource` over the deployment's data with the file replaced (photos aside), committed on the blob's sha; a conflict re-reads once |
| T-AD-3 | Dashboard commits | Jalel's, through his token, `by: "jalel"`, `at` the Tunis day; subject `data(<file>): …`, one line per change in the body, the note, trailer `Admin-Edit: <file>` (`Reverts: <sha>` on an undo) |
| T-AD-4 | Forms | No client script: a preview is a GET with the values in the query, a save a server action that checks the password; curated files edited one row at a time; the editor addressed by Wikidata id |
| T-AD-5 | Include | `include: true` adds the id to the three footballer queries; beside `exclude` an error; an id Wikidata does not return is a build warning, never a refusal |
| T-AD-6 | Undo | Per entry: what the commit changed goes back to its earlier value when nothing changed it since; otherwise refused with the entries named |
| T-AD-7 | Rebuild status | Read from the Actions and pull request APIs; the refusal from the build job's log tail; the page refreshes every 15 s while a run or CI is under way |
| T-AD-8 | Boundary | Public code never imports `@/admin/*` (ESLint); the admin stays English, outside the locales, behind the password and `noindex` |

COMMIT `"docs: editing from the dashboard, and the readings T-AD-1 to T-AD-8"`. The handover note: what shipped, the settings steps, what Jalel should try first on his phone.
- [ ] **Step 6: Pull request.** Push `admin-dashboard`; `gh pr create --title "Admin dashboard: edit the data from a phone (P60)"` with: the pages and what each writes; the include change to the pipeline; the workflow change; the screenshots at 360 px; the settings steps; the readings to overrule. Body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

**Phone checks for Jalel (15 minutes, after the token is set):** on Production at 360 px: add a local star to someone harmless with a note and see the commit on GitHub; undo it; Rebuild now and watch the stages to "Merged" (or "No change"); open `/admin/games/chkoun` and check today's answer matches the game.

## Free-tier arithmetic

| Resource | Change | Effect |
| --- | --- | --- |
| GitHub API (5,000 requests an hour per token) | a page view: 1 to 3 calls; a save: 3 to 4 (read, metadata, commit, a retry); the rebuild page: about 5 calls a refresh every 15 s while under way | 30 minutes of an open rebuild page: about 600 calls; a heavy editing evening: under 300 |
| GitHub Actions (public repository: free) | each dashboard commit runs CI on `main` (about 6 minutes); each Rebuild now runs the nightly (about 10 to 20 minutes) and CI on its branch | free for a public repository; the concurrency group keeps one nightly at a time |
| Vercel Hobby deployments (100 a day) | each commit on `main` deploys Production (Open 6 can skip overrides-only commits) | 20 edits and 2 rebuilds a day: 22 deployments |
| Vercel functions | server actions and admin pages: a few hundred invocations a day at most; Prettier adds about 1 MB to the admin functions only | negligible against 1,000,000 a month; public functions unchanged |
| Wikidata API | a search: 2 requests, with the pipeline's User-Agent | negligible |
| Nightly request budget (70) | an included footballer adds his articles and photo to the plan | a few includes fit; `planRequests` refuses beyond, as today |

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| `main`'s branch rule refuses a direct commit (pull request required) | Open 1: allow Jalel's pushes (admin bypass), or fall back to a branch and a pull request per save with auto-merge (`commitFile` gains a `branch`; T2 and T3 keep their interfaces) |
| A token leaks through an error, a log or the page | errors built from status and action only (T1 test); the token read in one module; `server-only`; T10 checks the HTML and the static chunks |
| The written JSON differs from Prettier's and CI's `format:check` fails on `main` | Prettier itself writes the text; T2 round-trips every committed data file; CI runs on the push and Undo is one tap |
| A save passes the dashboard but fails `data:check` in CI (the deployment's data older than `main`'s) | `inspectSource` is the same code; the edited file is main's; other files differ only between a merge and its deploy (minutes); CI flags it and Undo restores |
| An include brings a man who is not a Tunisian footballer | the search shows "footballer" and "Tunisian" from Wikidata before Add; he then needs a pool like anyone; Exclude is one form |
| An included id makes the build refuse | build mode warns, never refuses, for an include (T4 test) |
| The fine-grained token cannot read job logs | the rebuild page then shows the run link and "refused: see the run" (a caught 403); the stage logic does not depend on the log |
| GitHub's auto-merge by the workflow's token does not start Vercel's deploy | Vercel's GitHub app sees every push to `main` whoever makes it; the first dashboard rebuild is watched in the phone check; fallback: the dashboard merges itself when it sees green (Open 2, option c) |
| A scheduled night inherits an earlier auto-merge | the propose job turns it off unless the run was dispatched with `merge_when_green` (T7 test) |
| Concurrent saves (two tabs, the phone and the PC) | the blob sha refuses the second; it re-reads once and re-applies the field-level patch, so neither change is lost |
| Long previews in the query string | one footballer or one row per preview: well under a few KB |

## Open for Jalel

1. **Commits straight to `main` (T2, T3).** `main` requires a pull request and CI's `check` (data/README.md). The dashboard's token acts as you, so (a) let your own pushes bypass the rule (classic protection: leave "Do not allow bypassing" off; a ruleset: add Repository admin to the bypass list) and commit on `main` (recommended: the same validators run first, CI runs on the push, Undo is one tap); or (b) each save on its own branch and pull request with auto-merge (safer, about 6 minutes before an edit is on `main`, one pull request per edit).
2. **Who turns auto-merge on (T7).** (a) The nightly workflow, when dispatched with the new `merge_when_green` input, and it turns it off on scheduled nights, which still wait for your review (recommended); (b) the dashboard's token turns it on once the pull request appears (needs Pull requests write, and the page open); (c) the dashboard merges itself when it sees CI green (no repository setting, but only while the page is open). Also: should the scheduled night auto-merge too? Recommended no (P21's review stays).
3. **Include (T4).** An `include` override field, any Wikidata id whatever its occupation and citizenship (recommended), or only ids Wikidata calls a footballer. And an included id Wikidata no longer returns: a build warning (recommended) or a refusal.
4. **Undo (T8).** Per entry, refused when the entry changed since (recommended), or the whole file back to its earlier copy, offered only on the file's latest change.
5. **Prettier at run time (T2).** Move `prettier` from devDependencies to dependencies so the server writes exactly what `pnpm format` would (recommended; no new package), or a small writer of our own pinned by the round-trip test.
6. **Skip deploys of overrides-only commits.** An `ignoreCommand` in `vercel.json` (`git diff --quiet HEAD^ HEAD -- . ':(exclude)data/overrides.json'`): an overrides commit changes no page until a rebuild (recommended), or deploy every commit (simpler; 100 a day is plenty).
7. **`allow_pool_drop` on the dashboard (T7).** Not in v1: a refused night is rerun by hand from the Actions tab (recommended), or a checkbox beside Rebuild now with a confirmation.
8. **The token.** Fine-grained, `JalelDridi/kora` only, Contents and Actions read and write, Pull requests read (write only with Open 2 b or c), one year, the home warning under 30 days left (recommended).
9. **club-short's `DRAFT` (T6).** Your first edit there sets `by: "jalel"`; the note keeps `DRAFT` until you remove the word yourself on the settings page (recommended: `validateClubShort` only needs it while `by` is `claude`), or the dashboard drops it on your first edit.
10. **`clubTitles`.** Left out of v1 (rare, by hand on GitHub) (recommended), or a seventh settings table.
11. **Wording.** Nav: Home, Pool, Games, Add, Settings, Rebuild, Changes, Calendar; buttons Preview, Save, Undo, Rebuild now, Exclude from every game, Include again; routes `/admin/footballers/<Wikidata id>`, `/admin/add`, `/admin/games/chkoun`, `/admin/games/season`, `/admin/settings/<file>`, `/admin/rebuild`, `/admin/changes`. Recommended as listed; any rename is a find-and-replace before T10.
12. **Readings T-AD-1 to T-AD-8** in `docs/decisions.md` (T10): overrule any, especially T-AD-4 (one row per curated preview) and T-AD-2 (validation against the deployment's pool, not main's).

## Coverage check

| Item of P60 | Tasks |
| --- | --- |
| Commits through GitHub, validated with the pipeline's validators first | 1, 2 (T-AD-1, T-AD-2, T-AD-3) |
| `KORA_GITHUB_TOKEN`, Production only, server-side only | 1, 10 |
| Footballer editor, every override field, today's value and provenance, note, diff, commit link | 3 |
| Add by Wikidata search, include override, pipeline fetches him | 4 (T-AD-5) |
| Exclude, local star | 4, 5 (and every field in 3) |
| Six curated files | 2, 6 |
| Chkoun? calendar as today | 9 (nav), unchanged pages |
| Per-game views: Chkoun? (actives, answer-ready, one field away, grace, tiers, today and tomorrow), 30–0 (candidates by club and decade with ratings, spins per club) | 5 |
| Rebuild now, run and pull request status, auto-merge when CI and the guards are green | 7 (T-AD-7) |
| Changes log with undo as a commit | 8 (T-AD-6) |
| Home, mobile, nav | 9 |
| Tests: pure units, database, fake GitHub, browser tests with the fakes, axe, 360 px | every task; 10 |
| Live switches and tuning constants stay in code | nothing in this plan writes them |
