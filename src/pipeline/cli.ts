import { access } from "node:fs/promises";
import path from "node:path";
import { inspectData } from "./check.ts";
import { createClients, run } from "./run.ts";

// Run with Node directly:
//   node src/pipeline/cli.ts build             fetch, merge, write data/pool.json, data/ids.json, data/report.md
//   node src/pipeline/cli.ts build --offline   the same from data/cache/ alone: no client, no request
//   node src/pipeline/cli.ts check             check every file in data/
//   node src/pipeline/cli.ts check --against <pool.json>
//                                              also compare data/pool.json with that previous pool (P59)
// KORA_ALLOW_POOL_DROP=1 lets a night through the active guard (P59): over
// 5% of the actives lost, or over 10 clubs becoming none. The shrink guard
// (a tenth of the whole pool) cannot be let through.
// An entry point: app code never imports this file.
const command = process.argv[2];

if (command === "build") {
  const started = Date.now();
  const offline = process.argv.includes("--offline");
  const result = await run({
    root: process.cwd(),
    today: new Date().toISOString().slice(0, 10),
    // Online: wdqs, wikimedia (en, fr and Commons share it) and github, each
    // counting its HTTP attempts (ruling R2; see createClients in run.ts).
    // Offline: no client is created at all.
    ...(offline ? { offline: true } : createClients()),
    log: (line) => console.log(line),
    allowPoolDrop: process.env.KORA_ALLOW_POOL_DROP === "1",
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
  const at = process.argv.indexOf("--against");
  const against = at === -1 ? undefined : process.argv[at + 1];
  if (at !== -1 && !against) {
    console.error(
      "usage: node src/pipeline/cli.ts check --against <pool.json>",
    );
    process.exit(2);
  }
  const { errors, warnings } = await inspectData(root, {
    against,
    allowPoolDrop: process.env.KORA_ALLOW_POOL_DROP === "1",
  });
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
  console.error(
    "usage: node src/pipeline/cli.ts build [--offline] | check [--against <pool.json>]",
  );
  process.exit(2);
}
