import { isDeepStrictEqual } from "node:util";
import { layoutOf, writeJson } from "./json-text.ts";
import type { Applied, DiffLine } from "./overrides-patch.ts";
import { EditRefused } from "./validate.ts";

// The six curated files, edited one row at a time from the dashboard's
// settings pages (T-AD-2). Each says where it lives, what its rows are, how
// a row is named, how to set, add or remove one, and where Jalel's stamp
// goes: on the file (strength, club-short, AFCON 2004), on the row
// (honours), or nowhere (Ligue 1 clubs and governorates carry none).
// The file's own validator (src/pipeline/check.ts) says whether the result
// is right; apply refuses only a row that is not there, or already is.

export type CuratedId =
  | "ligue1-strength"
  | "club-short"
  | "honours"
  | "afcon-2004"
  | "ligue1-clubs"
  | "governorates";
export type Row = Record<string, unknown>;
export type CuratedOp = {
  kind: "set" | "add" | "remove";
  key: string;
  row?: Row;
};
export type CuratedFile = {
  path: string;
  rows(json: unknown): Row[];
  key(row: Row): string;
  /** A row as the settings page and the diff show it. */
  show(row: Row): string;
  /** Pure: a new value, `json` untouched. */
  apply(json: unknown, op: CuratedOp, today: string): unknown;
  stamp: "file" | "row" | "none";
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function shapeError(path: string): never {
  throw new EditRefused([`${path}: not in the shape expected`]);
}

/**
 * The rows after `op`, in order: a set keeps the row's place (and may rename
 * it), an add goes last.
 */
function patchRows(rows: Row[], key: (row: Row) => string, op: CuratedOp) {
  const at = rows.findIndex((r) => key(r) === op.key);
  if (op.kind !== "add" && at === -1)
    throw new EditRefused([`${op.key} is not there`]);
  if (op.kind === "remove") return rows.filter((_, n) => n !== at);
  if (!op.row) throw new EditRefused([`${op.key}: no row given`]);
  const newKey = key(op.row);
  const clash = rows.findIndex((r) => key(r) === newKey);
  if (op.kind === "add" ? clash !== -1 : clash !== -1 && clash !== at)
    throw new EditRefused([`${newKey} is already there`]);
  if (op.kind === "add") return [...rows, op.row];
  return rows.map((r, n) => (n === at ? op.row! : r));
}

const stampFile = (json: Row, today: string): Row => ({
  ...json,
  by: "jalel",
  at: today,
});

/** A file whose rows are the entries of one object (`field`), keyed by club id. */
function mapFile(
  id: CuratedId,
  field: string,
  toRow: (key: string, value: unknown) => Row,
  toValue: (row: Row) => unknown,
  show: (row: Row) => string,
): CuratedFile {
  const path = `data/curated/${id}.json`;
  const rows = (json: unknown) =>
    isRecord(json) && isRecord(json[field])
      ? Object.entries(json[field]).map(([k, v]) => toRow(k, v))
      : shapeError(path);
  const key = (row: Row) => String(row.id);
  return {
    path,
    rows,
    key,
    show,
    stamp: "file",
    apply(json, op, today) {
      const next = patchRows(rows(json), key, op);
      return stampFile(
        {
          ...(json as Row),
          [field]: Object.fromEntries(next.map((r) => [key(r), toValue(r)])),
        },
        today,
      );
    },
  };
}

/** A file whose rows are the strings of one list (`field`). */
function listFile(
  id: CuratedId,
  field: string,
  name: string,
  stamp: "file" | "none",
  show: (row: Row) => string,
): CuratedFile {
  const path = `data/curated/${id}.json`;
  const rows = (json: unknown) =>
    isRecord(json) && Array.isArray(json[field])
      ? (json[field] as unknown[]).map((v) => ({ [name]: v }))
      : shapeError(path);
  const key = (row: Row) => String(row[name]);
  return {
    path,
    rows,
    key,
    show,
    stamp,
    apply(json, op, today) {
      const next = {
        ...(json as Row),
        [field]: patchRows(rows(json), key, op).map((r) => r[name]),
      };
      return stamp === "file" ? stampFile(next, today) : next;
    },
  };
}

const pick = (row: Row, keys: string[]): Row =>
  Object.fromEntries(keys.map((k) => [k, row[k]]));

const GOVERNORATE = ["id", "nameLatin", "nameArabic", "nameFrench", "region"];
const HONOUR = ["competition", "seasonStart", "seasonEnd", "clubWikidataId"];

/** A file that is a list of objects. */
function rowsFile(
  id: CuratedId,
  key: (row: Row) => string,
  toStored: (row: Row, today: string) => Row,
  stamp: "row" | "none",
  show: (row: Row) => string,
): CuratedFile {
  const path = `data/curated/${id}.json`;
  const rows = (json: unknown) =>
    Array.isArray(json) && json.every(isRecord)
      ? (json as Row[])
      : shapeError(path);
  return {
    path,
    rows,
    key,
    show,
    stamp,
    apply(json, op, today) {
      const stored =
        op.row === undefined ? op : { ...op, row: toStored(op.row, today) };
      return patchRows(rows(json), key, stored);
    },
  };
}

export const CURATED: Record<CuratedId, CuratedFile> = {
  "ligue1-strength": mapFile(
    "ligue1-strength",
    "clubs",
    (id, strength) => ({ id, strength }),
    (row) => row.strength,
    (row) => String(row.strength),
  ),
  "club-short": mapFile(
    "club-short",
    "clubs",
    (id, forms) => ({ id, ...(isRecord(forms) ? forms : {}) }),
    (row) => ({ latin: row.latin, arabic: row.arabic }),
    (row) => `${String(row.latin)} / ${String(row.arabic)}`,
  ),
  "afcon-2004": listFile(
    "afcon-2004",
    "footballers",
    "id",
    "file",
    () => "in the squad",
  ),
  "ligue1-clubs": listFile(
    "ligue1-clubs",
    "clubs",
    "title",
    "none",
    () => "in Ligue 1",
  ),
  governorates: rowsFile(
    "governorates",
    (row) => String(row.id),
    (row) => pick(row, GOVERNORATE),
    "none",
    (row) =>
      `${String(row.nameLatin)} / ${String(row.nameArabic)} / ${String(row.nameFrench)}, ${String(row.region)}`,
  ),
  honours: rowsFile(
    "honours",
    (row) =>
      `${String(row.competition)}|${String(row.seasonStart)}|${String(row.seasonEnd)}`,
    (row, today) => ({ ...pick(row, HONOUR), by: "jalel", at: today }),
    "row",
    (row) => String(row.clubWikidataId),
  ),
};

/**
 * The note of a file stamped as a whole. club-short's says DRAFT while the
 * file is Claude's; Jalel's edits keep it until he rewrites it here (Open 9,
 * recommendation taken).
 */
export function setFileNote(
  id: CuratedId,
  json: unknown,
  note: string,
  today: string,
): unknown {
  if (CURATED[id].stamp !== "file" || !isRecord(json) || !("note" in json))
    throw new EditRefused([`${id}: has no note`]);
  if (note.trim() === "") throw new EditRefused(["note: required"]);
  return { ...stampFile(json, today), note: note.trim() };
}

/**
 * One row op on a curated file's text: the new text in the file's own
 * layout, the diff by row, and no change (and no stamp) when the rows are
 * as they were.
 */
export async function applyCurated(
  id: CuratedId,
  text: string,
  op: CuratedOp,
  today: string,
): Promise<Applied> {
  const file = CURATED[id];
  const json = JSON.parse(text) as unknown;
  const next = file.apply(json, op, today);
  const shown = (value: unknown) =>
    new Map(file.rows(value).map((r) => [file.key(r), file.show(r)]));
  const [before, after] = [shown(json), shown(next)];
  const diff: DiffLine[] = [];
  for (const key of new Set([...before.keys(), ...after.keys()]))
    if (before.get(key) !== after.get(key))
      diff.push({
        path: key,
        before: before.get(key) ?? "none",
        after: after.get(key) ?? "none",
      });
  const changed = !isDeepStrictEqual(
    file.rows(json),
    file.rows(next).map((r, n) =>
      // A row's own stamp is not a change.
      file.stamp === "row"
        ? { ...r, by: file.rows(json)[n]?.by, at: file.rows(json)[n]?.at }
        : r,
    ),
  );
  return {
    text: changed ? await writeJson(next, layoutOf(text)) : text,
    json: changed ? next : json,
    diff,
    changed,
  };
}
