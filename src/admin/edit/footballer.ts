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
  /**
   * His name when the pool has none for him (left out, or found on the add
   * page): for the commit subject only, so whitespace is folded and it is
   * cut to 80 characters.
   */
  name?: string;
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
    // An exclusion takes his other overrides with it: the lines list
    // them, the subject says what was decided.
    const excluding = patch.changes.some(
      (c) => c.field === "exclude" && "to" in c && c.to === true,
    );
    const fields = excluding
      ? [OVERRIDE_LABEL.exclude]
      : diff.map(
          (line) =>
            OVERRIDE_LABEL[line.path.split(".").at(-1) as OverrideField] ??
            line.path,
        );
    const name =
      input.player?.nameLatin ??
      [...(input.name ?? "").replace(/\s+/g, " ").trim()].slice(0, 80).join("");
    const who = name ? `${patch.qid} ${name}` : patch.qid;
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
