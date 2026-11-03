"use server";

import { redirect } from "next/navigation";
import { saveEdit } from "@/admin/edit/commit.server";
import { CURATED, curatedEdit, isCuratedId } from "@/admin/edit/curated-patch";
import { EditRefused } from "@/admin/edit/validate";
import { formRecord, saveErrorCode } from "@/admin/footballer-page";
import { requireAdmin } from "@/admin/require-admin";
import { tunisDay } from "@/engine/chkoun/day.ts";

// Save on a settings page: one row (or one header field) of a curated
// file, one commit on main (T-AD-4), re-applied to main's copy at the
// moment of saving and checked again by data:check's rules. A server
// action is a public POST endpoint: it checks the admin password itself
// before anything else. It answers with a redirect: the commit's sha, or
// a code.

export async function saveCurated(form: FormData): Promise<void> {
  await requireAdmin();
  const fields = formRecord(form);
  const id = typeof fields.file === "string" ? fields.file : "";
  if (!isCuratedId(id)) redirect("/admin/settings");
  const page = `/admin/settings/${id}`;
  const today = tunisDay(new Date());
  const result = await saveEdit({
    path: CURATED[id].path,
    make: async (text) => {
      const edit = await curatedEdit({ id, form: fields, text, today });
      if (!edit.ok) throw new EditRefused(edit.errors);
      return edit.applied;
    },
  });
  if (result.ok) redirect(`${page}?saved=${result.commit.sha}`);
  redirect(`${page}?error=${saveErrorCode(result.errors)}`);
}
