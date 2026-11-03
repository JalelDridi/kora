"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { adminAccess } from "@/admin/access";
import { DEPLOYMENT_DATA, saveEdit } from "@/admin/edit/commit.server";
import { footballerEdit } from "@/admin/edit/footballer";
import { EditRefused } from "@/admin/edit/validate";
import { editorNames, formRecord } from "@/admin/footballer-page";
import { loadPool } from "@/admin/load-pool";
import { tunisDay } from "@/engine/chkoun/day.ts";

// Save on the footballer editor: one commit of data/overrides.json on main
// (T-AD-2), re-applied to main's copy at the moment of saving and checked
// again by data:check's rules. A server action is a public POST endpoint:
// it checks the admin password itself before anything else (the proxy
// checks it too). It answers with a redirect: the commit's sha, or a code.

async function requireAdmin(): Promise<void> {
  const authorization = (await headers()).get("authorization");
  if (adminAccess(authorization, process.env.ADMIN_PASSWORD) !== "allow")
    throw new Error("Not found");
}

export async function saveFootballer(form: FormData): Promise<void> {
  await requireAdmin();
  const fields = formRecord(form);
  const qid = typeof fields.qid === "string" ? fields.qid.trim() : "";
  if (!/^Q\d+$/.test(qid)) redirect("/admin/pool");
  const pool = await loadPool();
  const player = pool.players.find((p) => p.wikidataId === qid) ?? null;
  const names = await editorNames(pool, DEPLOYMENT_DATA);
  const today = tunisDay(new Date());
  const result = await saveEdit({
    path: "data/overrides.json",
    make: async (text) => {
      const edit = await footballerEdit({
        form: fields,
        text,
        player,
        names,
        today,
      });
      if (!edit.ok) throw new EditRefused(edit.errors);
      return edit.applied;
    },
  });
  const page = `/admin/footballers/${qid}`;
  if (result.ok) redirect(`${page}?saved=${result.commit.sha}`);
  redirect(`${page}?error=${saveErrorCode(result.errors)}`);
}

/** A refusal as the code the page explains; the details are the preview's. */
function saveErrorCode(errors: string[]): string {
  const first = errors[0] ?? "";
  if (first.startsWith("edits are off")) return "off";
  if (first.startsWith("nothing to save")) return "unchanged";
  if (first.startsWith("main changed twice")) return "conflict";
  if (first.startsWith("GitHub ")) return "github";
  return "refused";
}
