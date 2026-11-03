import type { PlayerOverride } from "../../pipeline/overrides.ts";

// The override fields and the shapes of a change, without the patch code:
// the pool pages need the names, not Prettier (which overrides-patch.ts
// loads through json-text.ts to write the file).

export type FieldChange =
  | { field: keyof PlayerOverride; to: unknown }
  | { field: keyof PlayerOverride; remove: true };
export type OverridePatch = {
  qid: string;
  changes: FieldChange[];
  note: string;
};
export type DiffLine = { path: string; before: string; after: string };
export type Applied = {
  text: string;
  json: unknown;
  diff: DiffLine[];
  changed: boolean;
};

/** The fields in the order the editor shows them (src/pipeline/overrides.ts). */
export const FIELDS = [
  "club",
  "position",
  "positionDetail",
  "caps",
  "goals",
  "capsAsOf",
  "birthDate",
  "governorate",
  "birthCountry",
  "nameArabic",
  "aliases",
  "pools",
  "exclude",
  "include",
  "localStar",
] as const satisfies readonly (keyof PlayerOverride)[];

/** Exclude and include are the editor's own forms, not rows of the field list. */
export const STATE_FIELDS: readonly string[] = ["exclude", "include"];
