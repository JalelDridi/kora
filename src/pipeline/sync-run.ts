import { readFile } from "node:fs/promises";
import path from "node:path";
import { syncPool } from "./sync.ts";
import type { Queryable, SyncCounts } from "./sync.ts";
import type { GovernorateRow, IdRegistry, Pool } from "./types.ts";
import { validateIdRegistry, validatePool } from "./validate.ts";
import { describeError, isConnectionError } from "./wake.ts";

// What `node src/pipeline/sync-cli.ts` does, testable: read the files, refuse
// a pool that is empty or invalid before any connection, then sync.

export type SyncInput =
  | { kind: "absent" }
  | { kind: "refused"; errors: string[] }
  | { kind: "ready"; pool: Pool; governorates: GovernorateRow[] };

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8"));
}

const missing = (error: unknown) =>
  (error as { code?: unknown })?.code === "ENOENT";

/**
 * data/pool.json checked as the build checks it: against the governorates
 * and, when it exists, the id registry data/ids.json.
 */
export async function readSyncInput(root: string): Promise<SyncInput> {
  const data = path.join(root, "data");
  let pool: unknown;
  try {
    pool = await readJson(path.join(data, "pool.json"));
  } catch (error) {
    if (missing(error)) return { kind: "absent" };
    return {
      kind: "refused",
      errors: ["data/pool.json cannot be read as JSON"],
    };
  }
  let governorates: unknown;
  let registry: unknown;
  try {
    governorates = await readJson(
      path.join(data, "curated", "governorates.json"),
    );
    registry = await readJson(path.join(data, "ids.json")).catch((error) => {
      if (missing(error)) return undefined;
      throw error;
    });
  } catch {
    return {
      kind: "refused",
      errors: [
        "data/curated/governorates.json or data/ids.json cannot be read as JSON",
      ],
    };
  }
  if (!Array.isArray(governorates))
    return {
      kind: "refused",
      errors: ["data/curated/governorates.json is not a list"],
    };
  const errors =
    registry === undefined
      ? []
      : validateIdRegistry(registry).map((e) => `data/ids.json: ${e}`);
  errors.push(
    ...validatePool(
      pool,
      new Set(governorates.map((g: GovernorateRow) => g.id)),
      errors.length === 0 ? (registry as IdRegistry | undefined) : undefined,
    ),
  );
  if (errors.length > 0) return { kind: "refused", errors };
  if ((pool as Pool).players.length === 0)
    return {
      kind: "refused",
      errors: ["data/pool.json has no footballers"],
    };
  return {
    kind: "ready",
    pool: pool as Pool,
    governorates: governorates as GovernorateRow[],
  };
}

function describeCounts(c: SyncCounts): string {
  const parts = [
    `governorates ${c.governorates}`,
    `clubs ${c.clubs}`,
    `clubs out of Ligue 1 ${c.clubsLeftLigue1}`,
    `footballers ${c.players}`,
    `left the pool ${c.leftPool}`,
    `spells ${c.spells} (removed ${c.spellsRemoved})`,
    `honours ${c.honours} (removed ${c.honoursRemoved})`,
  ];
  return `rows written: ${parts.join(", ")}`;
}

export type RunSyncOptions = {
  root: string;
  /** Connects; called only once the pool has passed every check. */
  open: () => Promise<Queryable>;
  log: (line: string) => void;
  /** The database host as it may be printed (masked). */
  host: string;
};

/** Returns the exit code: 0 synced or nothing to sync, 1 refused or failed. */
export async function runSync(options: RunSyncOptions): Promise<0 | 1> {
  const { log } = options;
  const input = await readSyncInput(options.root);
  if (input.kind === "absent") {
    log("sync: no data/pool.json, nothing to sync");
    return 0;
  }
  if (input.kind === "refused") {
    for (const error of input.errors.slice(0, 20)) log(`sync: ${error}`);
    if (input.errors.length > 20)
      log(`sync: … and ${input.errors.length - 20} more`);
    const n = input.errors.length;
    log(`sync: refused, nothing written (${n} error${n === 1 ? "" : "s"})`);
    return 1;
  }
  const { pool, governorates } = input;
  log(
    `sync: data/pool.json has ${pool.players.length} footballers, ${pool.clubs.length} clubs, ${pool.honours.length} honours; into ${options.host}`,
  );
  let db: Queryable;
  try {
    db = await options.open();
  } catch (error) {
    log(`sync: could not reach ${options.host} (${describeError(error)})`);
    return 1;
  }
  try {
    const counts = await syncPool(db, pool, governorates);
    const changed = Object.values(counts).some((n) => n > 0);
    log(changed ? `sync: ${describeCounts(counts)}` : "sync: nothing changed");
    return 0;
  } catch (error) {
    // A connection error's message can name the host; an SQL error's cannot.
    const why =
      isConnectionError(error) || !(error instanceof Error)
        ? describeError(error)
        : `${error.message} (${describeError(error)})`;
    log(`sync: rolled back, nothing written: ${why}`);
    return 1;
  }
}
