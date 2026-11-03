"use server";

import { redirect } from "next/navigation";
import { DEPLOYMENT_DATA, saveEdit } from "@/admin/edit/commit.server";
import { footballerEdit } from "@/admin/edit/footballer";
import { EditRefused } from "@/admin/edit/validate";
import {
  editorNames,
  editorProblems,
  formRecord,
  saveErrorCode,
} from "@/admin/footballer-page";
import { loadPool } from "@/admin/load-pool";
import { requireAdmin } from "@/admin/require-admin";
import { tunisDay } from "@/engine/chkoun/day.ts";

// Save on the footballer editor: one commit of data/overrides.json on main
// (T-AD-2), re-applied to main's copy at the moment of saving and checked
// again by data:check's rules. A server action is a public POST endpoint:
// it checks the admin password itself before anything else (the proxy
// checks it too). It answers with a redirect: the commit's sha, or a code.
// The field form, the exclusion and "Include again" all post here.

export async function saveFootballer(form: FormData): Promise<void> {
  await requireAdmin();
  const fields = formRecord(form);
  const qid = typeof fields.qid === "string" ? fields.qid.trim() : "";
  if (!/^Q\d+$/.test(qid)) redirect("/admin/pool");
  const pool = await loadPool();
  const player = pool.players.find((p) => p.wikidataId === qid) ?? null;
  const dropped = pool.dropped.find((d) => d.wikidataId === qid);
  const names = await editorNames(pool, DEPLOYMENT_DATA);
  const page = `/admin/footballers/${qid}`;
  // A select that could not show his value would save "none" for it.
  if (editorProblems(names, player).length > 0) redirect(`${page}?error=lists`);
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
        ...(dropped ? { name: dropped.name } : {}),
      });
      if (!edit.ok) throw new EditRefused(edit.errors);
      return edit.applied;
    },
  });
  if (result.ok) redirect(`${page}?saved=${result.commit.sha}`);
  redirect(`${page}?error=${saveErrorCode(result.errors)}`);
}
