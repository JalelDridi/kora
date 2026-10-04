import pg from "pg";
import { databaseTarget } from "./database-url.ts";
import { describeError, withConnectionRetry } from "./wake.ts";

// Run with Node directly, inside `vercel-build` (scripts/vercel-build.sh):
//   node src/pipeline/sync-cli.ts wake   wait until the database answers SELECT 1
// The database is DATABASE_URL_UNPOOLED, else DATABASE_URL; outside Vercel
// only a local one (see databaseTarget). Prints the host masked, never the URL.
// An entry point: app code never imports this file.
const command = process.argv[2];

if (command !== "wake") {
  console.error("usage: node src/pipeline/sync-cli.ts wake");
  process.exit(2);
}

const target = databaseTarget(process.env);
if (!target.ok) {
  console.error(`${command}: ${target.reason}`);
  process.exit(1);
}

/** A new client per attempt, connected and answering SELECT 1. */
async function connect(url: string): Promise<pg.Client> {
  // pg waits forever by default; a starting compute answers within seconds.
  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: 10_000,
  });
  // A dropped idle connection must not crash the process; queries still fail.
  client.on("error", () => {});
  try {
    await client.connect();
    await client.query("SELECT 1");
    return client;
  } catch (error) {
    await client.end().catch(() => {});
    throw error;
  }
}

const started = Date.now();
let client: pg.Client;
try {
  client = await withConnectionRetry(() => connect(target.url), {
    host: target.host,
    log: (line) => console.log(line),
  });
} catch (error) {
  console.error(
    `${command}: could not reach ${target.host} (${describeError(error)})`,
  );
  process.exit(1);
}
await client.end();
console.log(
  `wake: ${target.host} answered in ${((Date.now() - started) / 1000).toFixed(1)} s`,
);
