import { access } from "node:fs/promises";
import path from "node:path";
import { inspectData } from "./check.ts";
import { createPoliteClient } from "./http.ts";
import { run } from "./run.ts";

// Run with Node directly:
//   node src/pipeline/cli.ts build   fetch, merge, write data/pool.json, data/ids.json, data/report.md
//   node src/pipeline/cli.ts check   check every file in data/
// An entry point: app code never imports this file.
const command = process.argv[2];

if (command === "build") {
  const started = Date.now();
  const result = await run({
    root: process.cwd(),
    today: new Date().toISOString().slice(0, 10),
    wdqs: createPoliteClient({ minGapMs: 2_000, maxRetries: 3 }),
    // English and French Wikipedia and Commons share one client (ruling R2):
    // one queue, at least 5 s between request starts, and a 429 or 403 from
    // any of them stops all three for the rest of the run.
    wikimedia: createPoliteClient({ minGapMs: 5_000, maxRetries: 3 }),
    github: createPoliteClient({ minGapMs: 1_000, maxRetries: 2 }),
    log: (line) => console.log(line),
  });
  console.log(`data:build: ${((Date.now() - started) / 1000).toFixed(0)} s`);
  if (!result.ok) {
    console.error(`data:build refused: ${result.reason}`);
    process.exit(1);
  }
  console.log(
    result.changed ? "data:build: the pool changed" : "data:build: no change",
  );
} else if (command === "check") {
  const root = process.cwd();
  const { errors, warnings } = await inspectData(root);
  for (const warning of warnings)
    console.log(`data:check: warning: ${warning}`);
  for (const error of errors) console.error(error);
  if (errors.length > 0) {
    console.error(
      `data:check: ${errors.length} error${errors.length === 1 ? "" : "s"}`,
    );
    process.exit(1);
  }
  const hasPool = await access(path.join(root, "data", "pool.json")).then(
    () => true,
    () => false,
  );
  if (!hasPool) {
    console.log(
      "data:check: no data/pool.json yet: overrides checked for shape only, not against the pool",
    );
  }
  console.log("data:check: ok");
} else {
  console.error("usage: node src/pipeline/cli.ts build|check");
  process.exit(2);
}
