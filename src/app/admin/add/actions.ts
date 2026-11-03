"use server";

import { redirect } from "next/navigation";
import { DEPLOYMENT_DATA, saveEdit } from "@/admin/edit/commit.server";
import { footballerEdit } from "@/admin/edit/footballer";
import { EditRefused } from "@/admin/edit/validate";
import {
  editorNames,
  formRecord,
  saveErrorCode,
} from "@/admin/footballer-page";
import { loadPool } from "@/admin/load-pool";
import { requireAdmin } from "@/admin/require-admin";
import { tunisDay } from "@/engine/chkoun/day.ts";

// "Add to the pool" on the add page (T-AD-5): one commit of
// data/overrides.json on main that sets players.<qid>.include, so the
// nightly fetches him with the Tunisian footballers. The note is required
// (applyOverridePatch refuses a change without one). The posted name is
// only for the commit subject. Checks the admin password itself first.

const one = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value.at(-1) : value)?.trim() ?? "";

export async function includeFootballer(form: FormData): Promise<void> {
  await requireAdmin();
  const fields = formRecord(form);
  const qid = one(fields.qid);
  const q = one(fields.q).slice(0, 80);
  if (!/^Q\d+$/.test(qid)) redirect("/admin/add");
  const page = `/admin/footballers/${qid}`;
  const pool = await loadPool();
  // Already in the pool: nothing to include, his editor is the place.
  if (pool.players.some((p) => p.wikidataId === qid)) redirect(page);
  const names = await editorNames(pool, DEPLOYMENT_DATA);
  const today = tunisDay(new Date());
  const result = await saveEdit({
    path: "data/overrides.json",
    make: async (text) => {
      const edit = await footballerEdit({
        form: { qid, include: "on", note: one(fields.note) },
        text,
        player: null,
        names,
        today,
        name: one(fields.label),
      });
      if (!edit.ok) throw new EditRefused(edit.errors);
      return edit.applied;
    },
  });
  if (result.ok) redirect(`${page}?saved=${result.commit.sha}`);
  const back = new URLSearchParams({ q, error: saveErrorCode(result.errors) });
  redirect(`/admin/add?${back}`);
}
