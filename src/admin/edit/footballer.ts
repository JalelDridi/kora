import type { PoolPlayer } from "../../pipeline/types.ts";
import {
  diffAgainstToday,
  dropUnchanged,
  overrideRows,
  OVERRIDE_LABEL,
  type Names,
  type OverrideField,
} from "../pool.ts";
import { commitMessage } from "./message.ts";
import {
  applyOverridePatch,
  parseOverrideForm,
  type Applied,
} from "./overrides-patch.ts";
import { EditRefused } from "./validate.ts";

// The footballer editor's form, turned into one change of
// data/overrides.json and its commit message: the same function for the
// preview (a GET) and the save (the server action, again on main's copy).

export type FootballerEdit =
  | { ok: true; applied: Applied & { message: string } }
  | { ok: false; errors: string[] };

export async function footballerEdit(input: {
  form: Record<string, string | string[]>;
  /** main's data/overrides.json. */
  text: string;
  /** He in the deployed pool; null for a footballer outside it. */
  player: PoolPlayer | null;
  names: Names;
  /** The Tunis day. */
  today: string;
}): Promise<FootballerEdit> {
  const { patch, errors } = parseOverrideForm(input.form);
  if (!patch) return { ok: false, errors };
  const entry = (JSON.parse(input.text) as { players?: Record<string, never> })
    .players?.[patch.qid];
  const rows = overrideRows(input.player, entry, input.names);
  try {
    const applied = await applyOverridePatch(
      input.text,
      { ...patch, changes: dropUnchanged(patch.changes, rows) },
      input.today,
      { clubName: input.names.club },
    );
    const diff = diffAgainstToday(applied.diff, rows);
    const fields = diff.map(
      (line) =>
        OVERRIDE_LABEL[line.path.split(".").at(-1) as OverrideField] ??
        line.path,
    );
    const who = input.player
      ? `${patch.qid} ${input.player.nameLatin}`
      : patch.qid;
    return {
      ok: true,
      applied: {
        ...applied,
        diff,
        message: commitMessage({
          file: "overrides",
          subject: `${who}: ${fields.join(", ").toLowerCase()}`,
          lines: diff,
          note: patch.note,
        }),
      },
    };
  } catch (error) {
    if (error instanceof EditRefused)
      return { ok: false, errors: error.errors };
    throw error;
  }
}
