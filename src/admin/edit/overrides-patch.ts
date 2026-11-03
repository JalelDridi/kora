import { isDeepStrictEqual } from "node:util";
import { lines } from "../../pipeline/types.ts";
import { FIELDS } from "./fields.ts";
import type {
  Applied,
  DiffLine,
  FieldChange,
  OverridePatch,
} from "./fields.ts";
import { layoutOf, writeJson } from "./json-text.ts";
import { EditRefused } from "./validate.ts";

// One footballer's overrides in data/overrides.json, changed from the
// dashboard (T-AD-2): each new or changed value says who decided it (Jalel),
// when (the Tunis day) and why (the note); `clubTitles` is never touched.

export { FIELDS } from "./fields.ts";
export type {
  Applied,
  DiffLine,
  FieldChange,
  OverridePatch,
} from "./fields.ts";

type Entry = Record<string, { value: unknown } & Record<string, unknown>>;
type DiffOptions = {
  /** The pool's name for a club id, shown beside it in the diff. */
  clubName?: (qid: string) => string | undefined;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A value as the editor shows it. */
function show(field: string, value: unknown, options: DiffOptions): string {
  if (value === null || value === undefined) return "none";
  if (field === "club" && typeof value === "string") {
    const name = options.clubName?.(value);
    return name ? `${value} (${name})` : value;
  }
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value))
    return value.length === 0 ? "none" : value.map(String).join(", ");
  if (field === "pools" && isRecord(value))
    return (
      [value.active && "active", value.legend && "legend"]
        .filter(Boolean)
        .join(" and ") || "none"
    );
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * Pure: today is the Tunis day, by is "jalel". Exclude replaces the entry
 * (validateOverrides refuses exclude beside other fields); include and
 * exclude are one choice. A value equal to the one in force keeps its stamp;
 * a value that changes needs a note.
 */
export async function applyOverridePatch(
  text: string,
  patch: OverridePatch,
  today: string,
  options: DiffOptions = {},
): Promise<Applied> {
  const json = JSON.parse(text) as { players: Record<string, Entry> };
  if (!isRecord(json) || !isRecord(json.players))
    throw new EditRefused([
      "data/overrides.json must be { players: {}, clubTitles: {} }",
    ]);
  const before: Entry = structuredClone(json.players[patch.qid] ?? {});
  let entry: Entry = structuredClone(before);
  const note = patch.note.trim();
  for (const change of patch.changes) {
    const field: string = change.field;
    if ("remove" in change) {
      delete entry[field];
      continue;
    }
    if (isDeepStrictEqual(entry[field]?.value, change.to)) continue;
    if (note === "")
      throw new EditRefused(["note: required when a value changes"]);
    const stamped = { value: change.to, by: "jalel", at: today, note };
    if (field === "exclude" && change.to === true) entry = {};
    // The add-a-footballer field (T-AD-5): in, or out, not both.
    if (field === "include") delete entry.exclude;
    entry[field] = stamped;
  }
  if (Object.keys(entry).length === 0) delete json.players[patch.qid];
  else json.players[patch.qid] = entry;

  const excluded = entry.exclude?.value === true;
  const diff: DiffLine[] = [];
  for (const field of new Set([
    ...Object.keys(before),
    ...Object.keys(entry),
  ])) {
    if (isDeepStrictEqual(before[field], entry[field])) continue;
    diff.push({
      path: `players.${patch.qid}.${field}`,
      before: show(field, before[field]?.value, options),
      after:
        field in entry
          ? show(field, entry[field].value, options)
          : excluded
            ? "none (excluded)"
            : "none",
    });
  }
  const changed = diff.length > 0;
  return {
    text: changed ? await writeJson(json, layoutOf(text)) : text,
    json,
    diff,
    changed,
  };
}

const QID = /^Q[1-9]\d*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The form's strings to typed values: "" keeps, "none" is null for club and
 * governorate, aliases one per line, pools from two checkboxes, a checked
 * `remove.<field>` removes the override. Whether a changed value has its
 * note is applyOverridePatch's to say: only it knows what changes.
 */
export function parseOverrideForm(form: Record<string, string | string[]>): {
  patch: OverridePatch | null;
  errors: string[];
} {
  const get = (name: string): string => {
    const raw = form[name];
    return (Array.isArray(raw) ? (raw.at(-1) ?? "") : (raw ?? "")).trim();
  };
  const errors: string[] = [];
  const qid = get("qid");
  // As data:check words a refused value, then what the field expects.
  const invalid = (field: string, raw: string, what: string) =>
    `${field}: invalid value ${JSON.stringify(raw)}, expected ${what}`;
  if (!QID.test(qid))
    errors.push(invalid("qid", qid, "a Wikidata id (Q and digits)"));
  const changes: FieldChange[] = [];
  for (const field of FIELDS) {
    if (get(`remove.${field}`) === "on") {
      changes.push({ field, remove: true });
      continue;
    }
    const raw = get(field);
    const set = (to: unknown) => changes.push({ field, to });
    const refuse = (what: string) => errors.push(invalid(field, raw, what));
    switch (field) {
      case "pools":
        if (get("pools.active") !== "" || get("pools.legend") !== "")
          set({
            active: get("pools.active") === "on",
            legend: get("pools.legend") === "on",
          });
        continue;
      case "exclude":
      case "include":
      case "localStar":
        if (raw === "on") set(true);
        continue;
    }
    if (raw === "") continue;
    switch (field) {
      case "club":
        if (raw === "none") set(null);
        else if (QID.test(raw)) set(raw);
        else refuse("a club's Wikidata id, or none");
        break;
      case "governorate":
        if (raw === "none") set(null);
        else if (/^[a-z]+(?:-[a-z]+)*$/.test(raw)) set(raw);
        else refuse("a governorate's id, or none");
        break;
      case "position":
        if ((lines as readonly string[]).includes(raw)) set(raw);
        else refuse("goalkeeper, defender, midfielder or forward");
        break;
      case "caps":
      case "goals":
        if (/^\d+$/.test(raw)) set(Number(raw));
        else refuse("a whole number, 0 or more");
        break;
      case "capsAsOf":
      case "birthDate":
        if (ISO_DATE.test(raw)) set(raw);
        else refuse("a date, YYYY-MM-DD");
        break;
      case "birthCountry":
        if (/^[a-z]{2}$/i.test(raw)) set(raw.toUpperCase());
        else refuse("two letters");
        break;
      case "nameArabic":
        if (/\p{Script=Arabic}/u.test(raw)) set(raw);
        else refuse("in Arabic letters");
        break;
      case "aliases":
        set(
          raw
            .split(/\r?\n/)
            .map((a) => a.trim())
            .filter((a) => a !== ""),
        );
        break;
      case "positionDetail":
        set(raw);
        break;
    }
  }
  return {
    patch: errors.length > 0 ? null : { qid, changes, note: get("note") },
    errors,
  };
}
