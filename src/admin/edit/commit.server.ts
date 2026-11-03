import "server-only";
import { fsSource } from "../../pipeline/check.ts";
import type { DataSource } from "../../pipeline/check.ts";
import { getGitHub, GitHubError } from "../github/index.ts";
import type { CommitInfo, GitHub } from "../github/index.ts";
import type { Applied } from "./overrides-patch.ts";
import { EditRefused, validateEdit } from "./validate.ts";

// Every dashboard save (T-AD-2): main's copy of the file, patched, checked by
// data:check's rules against the deployment's other data files, committed on
// the blob's sha. When main moved in between (409), once more from the start.

export type SaveResult =
  { ok: true; commit: CommitInfo } | { ok: false; errors: string[] };

export async function saveEdit(
  {
    path,
    make,
  }: {
    path: string;
    make: (text: string) => Promise<Applied & { message: string }>;
  },
  deps: { github: GitHub | null; base: DataSource } = {
    github: getGitHub(),
    // The deployment's data files (bundled for /admin, next.config.ts).
    base: fsSource(process.cwd()),
  },
): Promise<SaveResult> {
  const { github, base } = deps;
  if (!github)
    return {
      ok: false,
      errors: ["edits are off here: no GitHub token on this deployment"],
    };
  try {
    for (let attempt = 1; ; attempt++) {
      const file = await github.readFile(path);
      const applied = await make(file.text);
      if (!applied.changed)
        return { ok: false, errors: ["nothing to save: no value changed"] };
      const { errors } = await validateEdit(path, applied.text, base);
      if (errors.length > 0) return { ok: false, errors };
      try {
        const commit = await github.commitFile({
          path,
          text: applied.text,
          sha: file.sha,
          message: applied.message,
        });
        return { ok: true, commit };
      } catch (error) {
        if (!(error instanceof GitHubError && error.status === 409))
          throw error;
        if (attempt === 2)
          return {
            ok: false,
            errors: [
              "main changed twice while saving; nothing was saved, try again",
            ],
          };
      }
    }
  } catch (error) {
    if (error instanceof EditRefused)
      return { ok: false, errors: error.errors };
    // A GitHubError's message names the call and the status, never the
    // token or the request (src/admin/github/types.ts).
    if (error instanceof GitHubError)
      return { ok: false, errors: [error.message] };
    throw error;
  }
}
