import { isDeepStrictEqual } from "node:util";
import type { CommitInfo, GitHub } from "../github/types.ts";
import { GitHubError } from "../github/types.ts";
import { CURATED, isCuratedId } from "./curated-patch.ts";
import type { CuratedId, Row } from "./curated-patch.ts";
import type { DiffLine } from "./fields.ts";
import { layoutOf, writeJson } from "./json-text.ts";
import { commitMessage } from "./message.ts";

// Undo a change from the changes log (Task 8, T-AD-6): not the file as it
// was before the commit (that would also undo every later change), but each
// entry the commit changed put back as it was, when it still holds the
// commit's value. An entry changed again since is a conflict, and nothing
// is written: Jalel edits it instead. An entry is one override field of one
// footballer (players.<qid>.<field>), one club title (clubTitles.<key>), one
// row of a curated file (by its key) or one of its header fields. A file's
// stamp (by, at) is not an entry: it goes back with the change when no
// later edit stamped the file again, else the later stamp stays.

export type UndoFile = "overrides" | CuratedId;
export type UndoResult =
  | { ok: true; text: string; diff: DiffLine[] }
  | { ok: false; conflicts: string[] };

type Entries = [string, unknown][];
type Json = Record<string, unknown>;

const STAMP = ["by", "at"];
const isRecord = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const same = (a: unknown, b: unknown) => isDeepStrictEqual(a, b);
const conflict = (path: string) => `${path} changed since; edit it instead`;

/** The object or list that holds a curated file's rows; null when the file is the list. */
const ROWS: Record<CuratedId, string | null> = {
  "ligue1-strength": "clubs",
  "club-short": "clubs",
  "afcon-2004": "footballers",
  "ligue1-clubs": "clubs",
  honours: null,
  governorates: null,
};

/**
 * What each changed key goes back to (undefined: it goes), from the three
 * versions of a list of entries; the keys whose current value is neither
 * the commit's nor the one before it are conflicts. A key already back to
 * its old value is left alone.
 */
function plan(
  before: Entries,
  after: Entries,
  current: Entries,
  path: (key: string) => string,
  deeper?: (key: string, b: unknown, a: unknown, c: unknown) => unknown,
): { targets: Map<string, unknown>; conflicts: string[] } {
  const [b, a, c] = [new Map(before), new Map(after), new Map(current)];
  const targets = new Map<string, unknown>();
  const conflicts: string[] = [];
  for (const key of new Set([...b.keys(), ...a.keys()])) {
    if (same(b.get(key), a.get(key))) continue;
    if (deeper) {
      const target = deeper(key, b.get(key), a.get(key), c.get(key));
      if (!same(target, c.get(key))) targets.set(key, target);
      continue;
    }
    if (same(c.get(key), a.get(key))) targets.set(key, b.get(key));
    else if (!same(c.get(key), b.get(key))) conflicts.push(conflict(path(key)));
  }
  return { targets, conflicts };
}

/**
 * `current` with the targets applied: a key that goes is removed, a key
 * still there is replaced in place, a key that comes back goes after the
 * nearest key that came before it in `before`.
 */
function apply(
  before: Entries,
  current: Entries,
  targets: Map<string, unknown>,
): Entries {
  const out: Entries = current
    .filter(([k]) => !targets.has(k) || targets.get(k) !== undefined)
    .map(([k, v]) => [k, targets.has(k) ? targets.get(k) : v]);
  const order = before.map(([k]) => k);
  for (const key of order) {
    const value = targets.get(key);
    if (value === undefined || out.some(([k]) => k === key)) continue;
    let at = 0;
    for (let n = order.indexOf(key) - 1; n >= 0; n--) {
      const found = out.findIndex(([k]) => k === order[n]);
      if (found !== -1) {
        at = found + 1;
        break;
      }
    }
    out.splice(at, 0, [key, value]);
  }
  return out;
}

const entriesOf = (v: unknown): Entries =>
  isRecord(v) ? Object.entries(v) : [];

/** An override's value, a row or a header field, as the diff shows it. */
function show(value: unknown): string {
  const v = isRecord(value) && "value" in value ? value.value : value;
  if (v === undefined || v === null) return "none";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (Array.isArray(v) && v.every((x) => typeof x !== "object"))
    return v.length === 0 ? "none" : v.map(String).join(", ");
  return typeof v === "string" ? v : JSON.stringify(v);
}

type Undone = { next: unknown; diff: DiffLine[]; conflicts: string[] };

function undoOverrides(before: Json, after: Json, current: Json): Undone {
  const conflicts: string[] = [];
  const diff: DiffLine[] = [];
  const next: Json = { ...current };
  // players.<qid>.<field>: a footballer's fields, then the footballer.
  const players = plan(
    entriesOf(before.players),
    entriesOf(after.players),
    entriesOf(current.players),
    (qid) => `players.${qid}`,
    (qid, b, a, c) => {
      const fields = plan(
        entriesOf(b),
        entriesOf(a),
        entriesOf(c),
        (field) => `players.${qid}.${field}`,
      );
      conflicts.push(...fields.conflicts);
      for (const [field, value] of fields.targets)
        diff.push({
          path: `players.${qid}.${field}`,
          before: show(entriesOf(c).find(([k]) => k === field)?.[1]),
          after: show(value),
        });
      const kept = apply(entriesOf(b), entriesOf(c), fields.targets);
      return kept.length === 0 ? undefined : Object.fromEntries(kept);
    },
  );
  next.players = Object.fromEntries(
    apply(
      entriesOf(before.players),
      entriesOf(current.players),
      players.targets,
    ),
  );
  const titles = plan(
    entriesOf(before.clubTitles),
    entriesOf(after.clubTitles),
    entriesOf(current.clubTitles),
    (key) => `clubTitles.${key}`,
  );
  conflicts.push(...titles.conflicts);
  for (const [key, value] of titles.targets)
    diff.push({
      path: `clubTitles.${key}`,
      before: show(entriesOf(current.clubTitles).find(([k]) => k === key)?.[1]),
      after: show(value),
    });
  next.clubTitles = Object.fromEntries(
    apply(
      entriesOf(before.clubTitles),
      entriesOf(current.clubTitles),
      titles.targets,
    ),
  );
  return { next, diff, conflicts };
}

/** A curated file's rows as entries by key, whatever holds them. */
function rowEntries(id: CuratedId, json: unknown): Entries {
  const field = ROWS[id];
  const holder = field === null ? json : isRecord(json) ? json[field] : null;
  if (Array.isArray(holder))
    return holder.map((v) => [isRecord(v) ? CURATED[id].key(v) : String(v), v]);
  if (isRecord(holder)) return Object.entries(holder);
  throw new Error(`${CURATED[id].path}: not in the shape expected`);
}

function withRows(id: CuratedId, json: unknown, rows: Entries): unknown {
  const field = ROWS[id];
  const holder = field === null ? json : (json as Json)[field];
  const value = Array.isArray(holder)
    ? rows.map(([, v]) => v)
    : Object.fromEntries(rows);
  return field === null ? value : { ...(json as Json), [field]: value };
}

function undoCurated(
  id: CuratedId,
  before: unknown,
  after: unknown,
  current: unknown,
): Undone {
  const conflicts: string[] = [];
  const diff: DiffLine[] = [];
  const rows = plan(
    rowEntries(id, before),
    rowEntries(id, after),
    rowEntries(id, current),
    (key) => key,
  );
  conflicts.push(...rows.conflicts);
  let next = withRows(
    id,
    current,
    apply(rowEntries(id, before), rowEntries(id, current), rows.targets),
  );
  // Each row as the settings page shows it: the file's own words.
  const shown = (json: unknown) =>
    new Map(
      CURATED[id]
        .rows(json)
        .map((r: Row) => [CURATED[id].key(r), CURATED[id].show(r)]),
    );
  const [was, now] = [shown(current), shown(next)];
  for (const key of rows.targets.keys())
    if (was.get(key) !== now.get(key))
      diff.push({
        path: key,
        before: was.get(key) ?? "none",
        after: now.get(key) ?? "none",
      });

  if (isRecord(before) && isRecord(after) && isRecord(current)) {
    const field = ROWS[id];
    const header = (json: Json): Entries =>
      Object.entries(json).filter(([k]) => k !== field && !STAMP.includes(k));
    const head = plan(header(before), header(after), header(current), (k) => k);
    conflicts.push(...head.conflicts);
    const out: Json = { ...(next as Json) };
    for (const [key, value] of head.targets) {
      diff.push({ path: key, before: show(current[key]), after: show(value) });
      if (value === undefined) delete out[key];
      else out[key] = value;
    }
    // The stamp: back with the change, unless a later edit stamped again.
    for (const key of STAMP)
      if (!same(before[key], after[key]) && same(current[key], after[key])) {
        if (before[key] === undefined) delete out[key];
        else out[key] = before[key];
      }
    next = Object.fromEntries(
      Object.keys({ ...current, ...out })
        .filter((k) => k in out)
        .map((k) => [k, out[k]]),
    );
  }
  return { next, diff, conflicts };
}

/**
 * Pure (T-AD-6): `current` with each entry the commit changed (`before` →
 * `after`) back to its `before` value, in the current file's layout; or
 * the entries changed again since, and nothing.
 */
export async function undoPatch(input: {
  before: string;
  after: string;
  current: string;
  file: UndoFile;
}): Promise<UndoResult> {
  const [before, after, current] = [
    input.before,
    input.after,
    input.current,
  ].map((t) => JSON.parse(t) as unknown);
  const undone =
    input.file === "overrides"
      ? undoOverrides(
          isRecord(before) ? before : {},
          isRecord(after) ? after : {},
          isRecord(current) ? current : {},
        )
      : undoCurated(input.file, before, after, current);
  if (undone.conflicts.length > 0)
    return { ok: false, conflicts: undone.conflicts };
  if (undone.diff.length === 0 && same(undone.next, current))
    return { ok: true, text: input.current, diff: [] };
  return {
    ok: true,
    text: await writeJson(undone.next, layoutOf(input.current)),
    diff: undone.diff,
  };
}

/** The dashboard's name for a data file it edits; null for any other path. */
export function undoFileOf(path: string): UndoFile | null {
  if (path === "data/overrides.json") return "overrides";
  const match = /^data\/curated\/([a-z0-9-]+)\.json$/.exec(path);
  return match && isCuratedId(match[1]) ? match[1] : null;
}

/** The paths the changes log lists: overrides and the six curated files. */
export const LOGGED: string[] = [
  "data/overrides.json",
  ...Object.values(CURATED).map((f) => f.path),
];

export const subjectOf = (message: string) => message.split("\n")[0];

/** A dashboard commit carries this trailer (T-AD-3). */
export const editedHere = (message: string) => /^Admin-Edit: \S/m.test(message);

/** Why a commit offers no Undo, or null when it does. */
export function noUndo(commit: CommitInfo): string | null {
  if (commit.files.length !== 1 || undoFileOf(commit.files[0]) === null)
    return "made by hand; revert it on GitHub";
  if (commit.parent === null) return "the first commit; nothing before it";
  return null;
}

export type UndoPlan =
  | {
      ok: true;
      commit: CommitInfo;
      path: string;
      file: UndoFile;
      text: string;
      diff: DiffLine[];
      message: string;
    }
  | { ok: false; commit: CommitInfo | null; errors: string[] };

/**
 * The undo of one commit against main's copy now (`current`, read by the
 * caller so a save can re-read it): the commit from GitHub, the file at its
 * parent and at it, undoPatch, and the revert's message. The same for the
 * preview and the save.
 */
export async function planUndo(
  github: GitHub,
  sha: string,
  current?: string,
): Promise<UndoPlan> {
  let commit: CommitInfo;
  try {
    commit = await github.getCommit(sha);
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404)
      return { ok: false, commit: null, errors: ["no such commit on GitHub"] };
    throw error;
  }
  const refused = noUndo(commit);
  if (refused) return { ok: false, commit, errors: [refused] };
  const path = commit.files[0];
  const file = undoFileOf(path)!;
  let before: string;
  try {
    before = (await github.readFile(path, commit.parent!)).text;
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404)
      return {
        ok: false,
        commit,
        errors: ["the file was new in this commit; revert it on GitHub"],
      };
    throw error;
  }
  const after = (await github.readFile(path, commit.sha)).text;
  const now = current ?? (await github.readFile(path)).text;
  const undone = await undoPatch({ before, after, current: now, file });
  if (!undone.ok) return { ok: false, commit, errors: undone.conflicts };
  return {
    ok: true,
    commit,
    path,
    file,
    text: undone.text,
    diff: undone.diff,
    message: commitMessage({
      file,
      subject: subjectOf(commit.message),
      lines: undone.diff,
      note: "",
      reverts: commit.sha,
    }),
  };
}
