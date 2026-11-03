import type { DataSource } from "../pipeline/check.ts";
import type { Pool } from "../pipeline/types.ts";
import type { Names } from "./pool.ts";

// What the footballer editor's page and its save action share: the names
// for clubs and governorates, and a form (posted, or in a preview's query)
// as the record parseOverrideForm reads.

export type Governorate = { id: string; nameLatin: string };

export type EditorNames = Names & {
  /** The pool's clubs by name: [Wikidata id, name]. */
  clubs: [string, string][];
  governorates: Governorate[];
};

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
  try {
    const text = await data.read("curated/governorates.json");
    const rows: unknown = text === undefined ? [] : JSON.parse(text);
    if (Array.isArray(rows))
      governorates = rows.filter(
        (r): r is Governorate =>
          typeof r?.id === "string" && typeof r?.nameLatin === "string",
      );
  } catch {
    governorates = [];
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
  };
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
