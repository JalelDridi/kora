"use server";

import { redirect } from "next/navigation";
import { saveEdit } from "@/admin/edit/commit.server";
import { noUndo, planUndo } from "@/admin/edit/undo";
import { EditRefused } from "@/admin/edit/validate";
import { saveErrorCode } from "@/admin/footballer-page";
import { getGitHub, GitHubError } from "@/admin/github";
import { requireAdmin } from "@/admin/require-admin";

// Undo on the changes log (Task 8, T-AD-6): one revert commit on main that
// puts back each entry the commit changed, re-planned on main's copy at
// the moment of saving and checked again by data:check's rules (saveEdit).
// A server action is a public POST endpoint: it checks the admin password
// itself before anything else. It answers with a redirect: the revert's
// sha, or the preview again with a code.

const SHA = /^[0-9a-f]{40}$/;

export async function undoChange(form: FormData): Promise<void> {
  await requireAdmin();
  const sha = form.get("sha");
  if (typeof sha !== "string" || !SHA.test(sha)) redirect("/admin/changes");
  const preview = `/admin/changes?undo=${sha}`;
  const github = getGitHub();
  if (!github) redirect(`${preview}&error=off`);
  let path: string;
  try {
    const commit = await github.getCommit(sha);
    if (noUndo(commit) !== null) redirect(`${preview}&error=refused`);
    path = commit.files[0];
  } catch (error) {
    if (!(error instanceof GitHubError)) throw error;
    redirect(`${preview}&error=github`);
  }
  const result = await saveEdit(
    {
      path,
      make: async (text) => {
        const undo = await planUndo(github, sha, text);
        if (!undo.ok) throw new EditRefused(undo.errors);
        return {
          text: undo.text,
          json: JSON.parse(undo.text) as unknown,
          diff: undo.diff,
          changed: undo.text !== text,
          message: undo.message,
        };
      },
    },
    { github },
  );
  if (result.ok) redirect(`/admin/changes?undone=${result.commit.sha}`);
  redirect(`${preview}&error=${saveErrorCode(result.errors)}`);
}
