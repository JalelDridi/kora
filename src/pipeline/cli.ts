import { access } from "node:fs/promises";
import path from "node:path";
import { inspectData } from "./check.ts";

// Run with Node directly: node src/pipeline/cli.ts check
const command = process.argv[2];

if (command === "check") {
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
  console.error("usage: node src/pipeline/cli.ts check");
  process.exit(2);
}
