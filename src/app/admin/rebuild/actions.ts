"use server";

import { redirect } from "next/navigation";
import { getGitHub, GitHubError } from "@/admin/github";
import { requireAdmin } from "@/admin/require-admin";

// "Rebuild now" (Task 7): dispatches the nightly workflow on main with
// merge_when_green, so its pull request merges itself once CI passes, and
// returns at once; the page then follows the run (it refreshes itself).
// Refused while a nightly run is queued or in progress. Checks the admin
// password itself first: a server action is a public POST endpoint.

export async function rebuildNow(): Promise<void> {
  await requireAdmin();
  const github = getGitHub();
  if (!github) redirect("/admin/rebuild?error=off");
  let outcome: string;
  try {
    const [newest] = await github.workflowRuns("nightly-data.yml", {
      perPage: 1,
    });
    if (newest && newest.status !== "completed") {
      outcome = "?error=running";
    } else {
      const since = new Date().toISOString();
      await github.dispatchWorkflow("nightly-data.yml", {
        allow_pool_drop: "false",
        merge_when_green: "true",
      });
      outcome = `?${new URLSearchParams({ since })}`;
    }
  } catch (error) {
    if (!(error instanceof GitHubError)) throw error;
    outcome = `?${new URLSearchParams({ error: "github", status: String(error.status) })}`;
  }
  redirect(`/admin/rebuild${outcome}`);
}
