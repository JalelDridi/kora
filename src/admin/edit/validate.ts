import { inspectSource } from "../../pipeline/check.ts";
import type { DataSource } from "../../pipeline/check.ts";

// An edit is checked by data:check's own rules before it is committed
// (T-AD-2): the deployment's data files with the edited one replaced.

/** A change the patch itself refuses (no such row, a value with no note): the reasons, for the page. */
export class EditRefused extends Error {
  constructor(readonly errors: string[]) {
    super(errors.join("; "));
    this.name = "EditRefused";
  }
}

/** The name inside data/ of a repository path ("data/curated/x.json" → "curated/x.json"). */
function dataName(path: string): string {
  if (!/^data\/(?:curated\/)?[a-z0-9-]+\.json$/.test(path))
    throw new Error(`not a data file: ${path}`);
  return path.slice("data/".length);
}

/** `base` with some files (by repository path) replaced. */
export function overlay(
  base: DataSource,
  files: Record<string, string>,
): DataSource {
  const replaced = new Map(
    Object.entries(files).map(([p, text]) => [dataName(p), text]),
  );
  return {
    read: async (name) =>
      replaced.has(name) ? replaced.get(name) : base.read(name),
    publicFileExists: (p) => base.publicFileExists(p),
  };
}

type Result = { errors: string[]; warnings: string[] };

// The base is the deployment's data, the same for the life of the server:
// its own result is computed once per source.
const baseResults = new WeakMap<DataSource, Promise<Result>>();
function inspectBase(base: DataSource): Promise<Result> {
  let result = baseResults.get(base);
  if (!result) {
    result = inspectSource(base, { photos: false });
    baseResults.set(base, result);
    result.catch(() => baseResults.delete(base));
  }
  return result;
}

/**
 * data:check over `base` with `path` replaced by `nextText`, photos aside
 * (the dashboard does not hold them): every line about the edited file, and
 * any line about another file that the base did not already give (an
 * override naming a governorate just removed, a 30–0 slot left empty).
 */
export async function validateEdit(
  path: string,
  nextText: string,
  base: DataSource,
): Promise<Result> {
  const edited = overlay(base, { [path]: nextText });
  const [next, before] = await Promise.all([
    inspectSource(edited, { photos: false }),
    inspectBase(base),
  ]);
  const keep = (lines: string[], known: string[]) => {
    const old = new Set(known);
    return lines.filter((l) => l.startsWith(`${path}: `) || !old.has(l));
  };
  return {
    errors: keep(next.errors, before.errors),
    warnings: keep(next.warnings, before.warnings),
  };
}
