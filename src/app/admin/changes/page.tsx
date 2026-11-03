import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { adminAccess } from "@/admin/access";
import { DEPLOYMENT_DATA } from "@/admin/edit/commit.server";
import { diffFromMessage } from "@/admin/edit/message";
import type { DiffLine } from "@/admin/edit/overrides-patch";
import {
  editedHere,
  LOGGED,
  noUndo,
  planUndo,
  subjectOf,
  undoFileOf,
} from "@/admin/edit/undo";
import { validateEdit } from "@/admin/edit/validate";
import { saveError } from "@/admin/footballer-page";
import { getGitHub, GitHubError, REPO } from "@/admin/github";
import type { CommitInfo, GitHub } from "@/admin/github";
import { NavLink } from "@/admin/nav-link";
import { undoChange } from "./actions";

// The changes log (Task 8): the last 30 commits on main that touched
// data/overrides.json or a curated file, newest first, each with its date
// in Tunis, its subject, whether it was made here (the Admin-Edit trailer)
// and its GitHub link. Undo is a GET preview (?undo=<sha>: what goes back,
// data:check's result, the revert's message), then a Save form that posts
// to a server action. While a preview is open the page holds only it.
// English, plain forms, no client script.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Changes" };

const LIMIT = 30;
const SHA = /^[0-9a-f]{40}$/;

const one = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value.at(-1) : value;

const when = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Tunis",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const fileName = (path: string) =>
  path === "data/overrides.json" ? "overrides" : path.slice("data/".length);

const commitUrl = (sha: string) =>
  `https://github.com/${REPO.owner}/${REPO.repo}/commit/${sha}`;

export default async function ChangesPage({
  searchParams,
}: PageProps<"/admin/changes">) {
  // The password again, never the proxy alone.
  const authorization = (await headers()).get("authorization");
  if (adminAccess(authorization, process.env.ADMIN_PASSWORD) !== "allow")
    notFound();
  const query = await searchParams;
  const undo = one(query.undo);
  const undoSha = undo && SHA.test(undo) ? undo : null;
  const undone = one(query.undone);
  const undoneSha = undone && SHA.test(undone) ? undone : null;
  const error = saveError(one(query.error));
  const github = getGitHub();

  let commits: CommitInfo[] = [];
  let notice: string | null = null;
  if (!github)
    notice =
      "GitHub not connected on this deployment: the log reads main's history on GitHub, and Undo is off.";
  else if (undoSha === null)
    try {
      commits = await github.listCommits({ paths: LOGGED, perPage: LIMIT });
    } catch (e) {
      if (!(e instanceof GitHubError)) throw e;
      notice = `GitHub could not be read (${e.message}): try again in a minute.`;
    }

  return (
    <main className="changes editor">
      <h1>Changes</h1>
      <p className="dim">
        The last {LIMIT} commits on main to data/overrides.json and the curated
        files, newest first. Undo puts back what a change changed, as a new
        commit; a value changed again since is left to edit.
      </p>
      {notice ? <p className="notice">{notice}</p> : null}
      {error ? (
        <p role="alert" className="notice notice-error">
          {error}
        </p>
      ) : null}
      {undoneSha && github ? <Undone sha={undoneSha} github={github} /> : null}
      {undoSha && github ? (
        <>
          <Preview sha={undoSha} github={github} />
          <p className="back">
            <NavLink href="/admin/changes">All changes</NavLink>
          </p>
        </>
      ) : null}
      {undoSha === null && github && notice === null ? (
        commits.length === 0 ? (
          <p className="dim">No change yet.</p>
        ) : (
          <ol className="log" aria-label="Changes, newest first">
            {commits.map((commit) => (
              <Entry key={commit.sha} commit={commit} />
            ))}
          </ol>
        )
      ) : null}
    </main>
  );
}

function Entry({ commit }: { commit: CommitInfo }) {
  const subject = subjectOf(commit.message);
  const refused = noUndo(commit);
  return (
    <li>
      <p className="subject">{subject}</p>
      <p className="meta dim">
        <time dateTime={commit.date}>{when.format(new Date(commit.date))}</time>
        {" · "}
        {commit.files.map(fileName).join(", ")}
        {editedHere(commit.message) ? (
          <>
            {" · "}
            <span className="here">edited here</span>
          </>
        ) : null}
      </p>
      <p className="row-actions">
        <a href={commit.url}>
          {commit.sha.slice(0, 7)}
          <span className="visually-hidden"> on GitHub</span>
        </a>
        {refused === null ? (
          <NavLink href={`/admin/changes?undo=${commit.sha}`}>
            Undo<span className="visually-hidden"> {subject}</span>
          </NavLink>
        ) : (
          <span className="dim">No undo: {refused}</span>
        )}
      </p>
    </li>
  );
}

function Diff({ diff, head }: { diff: DiffLine[]; head: string }) {
  return (
    <div className="scroll">
      <table aria-label="What goes back" className="diff">
        <thead>
          <tr>
            <th scope="col">Entry</th>
            <th scope="col">{head}</th>
          </tr>
        </thead>
        <tbody>
          {diff.map((line) => (
            <tr key={line.path}>
              <th scope="row">{line.path}</th>
              <td>
                <bdi>{line.before}</bdi> → <bdi>{line.after}</bdi>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Where to change an entry by hand: the footballer's editor, or the file's page. */
function editLink(path: string, conflict: string): string | null {
  const file = undoFileOf(path);
  if (file === null) return null;
  if (file !== "overrides") return `/admin/settings/${file}`;
  const qid = /^players\.(Q\d+)\./.exec(conflict)?.[1];
  return qid ? `/admin/footballers/${qid}` : null;
}

async function Preview({ sha, github }: { sha: string; github: GitHub }) {
  let plan;
  try {
    plan = await planUndo(github, sha);
  } catch (e) {
    if (!(e instanceof GitHubError)) throw e;
    return (
      <p role="alert" className="notice notice-error">
        GitHub could not be read ({e.message}): try again in a minute.
      </p>
    );
  }
  const { commit } = plan;
  const checked =
    plan.ok && plan.diff.length > 0
      ? await validateEdit(plan.path, plan.text, DEPLOYMENT_DATA)
      : { errors: [], warnings: [] };
  const errors = plan.ok ? checked.errors : plan.errors;
  const ready = plan.ok && plan.diff.length > 0 && errors.length === 0;
  const path = commit?.files[0] ?? "";
  return (
    <section aria-labelledby="preview">
      <h2 id="preview">Undo a change</h2>
      {commit ? (
        <>
          <p className="subject">{subjectOf(commit.message)}</p>
          <p className="dim sha">
            <time dateTime={commit.date}>
              {when.format(new Date(commit.date))}
            </time>
            {" · "}
            <a href={commit.url}>
              {commit.sha.slice(0, 7)}
              <span className="visually-hidden"> on GitHub</span>
            </a>
          </p>
        </>
      ) : null}
      {errors.length > 0 ? (
        // A list may not carry role="alert": the box around it does.
        <div role="alert" className="notice notice-error">
          <p>Not undone:</p>
          <ul className="plain">
            {errors.map((line) => {
              const href = editLink(path, line);
              return (
                <li key={line}>
                  {line}
                  {href && line.endsWith("edit it instead") ? (
                    <>
                      {" "}
                      <NavLink href={href}>Edit</NavLink>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {plan.ok && plan.diff.length === 0 ? (
        <p className="notice">
          Nothing to undo: every value this change set is already back as it
          was.
        </p>
      ) : null}
      {plan.ok && plan.diff.length > 0 ? (
        <>
          <Diff diff={plan.diff} head="Now → after the undo" />
          {errors.length === 0 ? (
            <p data-testid="checked">data:check finds no error in this undo.</p>
          ) : null}
          <h3>Commit message</h3>
          <pre className="message">{plan.message}</pre>
        </>
      ) : null}
      {ready ? (
        <form action={undoChange} className="actions">
          <input type="hidden" name="sha" value={sha} />
          <button type="submit">Save</button>
        </form>
      ) : null}
    </section>
  );
}

/** After an undo's redirect. */
async function Undone({ sha, github }: { sha: string; github: GitHub }) {
  const commit = await github.getCommit(sha).catch((e: unknown) => {
    if (!(e instanceof GitHubError)) throw e;
    return null;
  });
  const diff = commit ? diffFromMessage(commit.message) : [];
  return (
    <section aria-labelledby="undone" className="notice">
      <p role="status" id="undone">
        {commit ? "Undone as " : "Commit "}
        <a href={commit?.url ?? commitUrl(sha)}>{sha.slice(0, 7)}</a>
        {commit ? " on main." : null}
      </p>
      {commit ? <p>{subjectOf(commit.message)}</p> : null}
      {diff.length > 0 ? <Diff diff={diff} head="Before → after" /> : null}
      <p>
        The games change after a rebuild:{" "}
        <NavLink href="/admin/rebuild">Rebuild now</NavLink>
      </p>
    </section>
  );
}
