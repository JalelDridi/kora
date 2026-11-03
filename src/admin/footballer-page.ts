import type { DataSource } from "../pipeline/check.ts";
import type { Pool, PoolPlayer } from "../pipeline/types.ts";
import type { Names } from "./pool.ts";

// What the footballer editor's page and its save action share: the names
// for clubs and governorates, and a form (posted, or in a preview's query)
// as the record parseOverrideForm reads.

export type Governorate = { id: string; nameLatin: string };

export type EditorNames = Names & {
  /** The pool's clubs by name: [Wikidata id, name]. */
  clubs: [string, string][];
  governorates: Governorate[];
  /** Why the governorates list is empty, when it is: the editor saves nothing then. */
  governoratesProblem: string | null;
};

const GOVERNORATES = "data/curated/governorates.json";

export async function editorNames(
  pool: Pool,
  data: DataSource,
): Promise<EditorNames> {
  const clubs = new Map<string, string>();
  const qids = new Map<string, string>();
  for (const club of pool.clubs) {
    clubs.set(club.wikidataId, club.nameLatin);
    qids.set(club.id, club.wikidataId);
  }
  let governorates: Governorate[] = [];
  let governoratesProblem: string | null = null;
  try {
    const text = await data.read("curated/governorates.json");
    const rows: unknown = text === undefined ? undefined : JSON.parse(text);
    if (!Array.isArray(rows)) throw new Error("not a list");
    governorates = rows.filter(
      (r): r is Governorate =>
        typeof r?.id === "string" && typeof r?.nameLatin === "string",
    );
    if (governorates.length === 0)
      governoratesProblem = `${GOVERNORATES} lists none`;
  } catch {
    governorates = [];
    governoratesProblem = `${GOVERNORATES} could not be read`;
  }
  const govNames = new Map(governorates.map((g) => [g.id, g.nameLatin]));
  return {
    club: (id) => clubs.get(id),
    clubQid: (slug) => qids.get(slug),
    governorate: (id) => govNames.get(id),
    clubs: [...clubs].sort((a, b) => a[1].localeCompare(b[1])),
    governorates: [...governorates].sort((a, b) =>
      a.nameLatin.localeCompare(b.nameLatin),
    ),
    governoratesProblem,
  };
}

/**
 * What would make the editor's selects show a value he does not have (a
 * select without today's option falls back to "none", and a save of any
 * other field would then commit that "none"). Any problem turns saving off.
 */
export function editorProblems(
  names: EditorNames,
  player: Pick<PoolPlayer, "clubId" | "governorate"> | null,
): string[] {
  if (names.governoratesProblem) return [names.governoratesProblem];
  const problems: string[] = [];
  if (player?.clubId && names.clubQid(player.clubId) === undefined)
    problems.push(`his club "${player.clubId}" is not among the pool's clubs`);
  if (
    player?.governorate &&
    names.governorate(player.governorate) === undefined
  )
    problems.push(
      `his governorate "${player.governorate}" is not in ${GOVERNORATES}`,
    );
  return problems;
}

/** A posted form or a query, as name → value (a list when the name repeats). */
export function formRecord(
  entries: FormData | Record<string, string | string[] | undefined>,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  const add = (name: string, value: string) => {
    // Next adds its own fields to an action's form ($ACTION_...).
    if (name.startsWith("$")) return;
    const had = out[name];
    out[name] =
      had === undefined
        ? value
        : [...(Array.isArray(had) ? had : [had]), value];
  };
  if (entries instanceof FormData) {
    for (const [name, value] of entries)
      if (typeof value === "string") add(name, value);
  } else {
    for (const [name, value] of Object.entries(entries)) {
      if (value === undefined) continue;
      for (const v of Array.isArray(value) ? value : [value]) add(name, v);
    }
  }
  return out;
}

/** What the editor and the add page say for each refusal code of a save. */
export const SAVE_ERRORS: Record<string, string> = {
  off: "Not saved: edits are off here (no GitHub token on this deployment).",
  unchanged: "Not saved: no value changed.",
  conflict: "Not saved: main changed twice while saving. Try again.",
  github:
    "Not saved: GitHub did not answer as expected. Try again in a minute.",
  note: "Not saved: a note is required. Say why, and where it says so.",
  lists:
    "Not saved: the editor could not read its lists of clubs and governorates.",
  refused:
    "Not saved: main's copy refuses this change now. Preview it again to see why.",
};

/** A save's refusal as the code its page explains; the details are the preview's. */
export function saveErrorCode(errors: string[]): string {
  const first = errors[0] ?? "";
  if (first.startsWith("edits are off")) return "off";
  if (first.startsWith("nothing to save")) return "unchanged";
  if (first.startsWith("main changed twice")) return "conflict";
  if (first.startsWith("GitHub ")) return "github";
  if (first.startsWith("note: required")) return "note";
  return "refused";
}
