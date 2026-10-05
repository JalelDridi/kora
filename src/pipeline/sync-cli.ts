import pg from "pg";
import { tunisDay } from "../engine/chkoun/day.ts";
import { CalendarRefusal, topUpCalendar } from "./calendar.ts";
import { databaseTarget } from "./database-url.ts";
import { runSync } from "./sync-run.ts";
import { describeError, withConnectionRetry } from "./wake.ts";

// Run with Node directly, inside `vercel-build` (scripts/vercel-build.sh):
//   node src/pipeline/sync-cli.ts wake   wait until the database answers SELECT 1
//   node src/pipeline/sync-cli.ts        write data/pool.json into the database
//   node src/pipeline/sync-cli.ts calendar   top up the Chkoun? calendar (D-S2-2)
// The database is DATABASE_URL_UNPOOLED, else DATABASE_URL; outside Vercel
// only a local one (see databaseTarget). Prints the host masked, never the URL.
// The calendar needs CHKOUN_SEED and fails without it; it never prints the
// seed or a footballer. An entry point: app code never imports this file.
const command = process.argv[2] ?? "sync";

if (command !== "wake" && command !== "sync" && command !== "calendar") {
  console.error("usage: node src/pipeline/sync-cli.ts [wake | calendar]");
  process.exit(2);
}

// Before any connection: a build without the seed fails here, by name.
if (command === "calendar" && !process.env.CHKOUN_SEED) {
  console.error(
    "calendar: CHKOUN_SEED is not set: the Chkoun? calendar cannot be drawn. Set it in Vercel for Production and Preview (decision D-S2-2)",
  );
  process.exit(1);
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

const retrying = () =>
  withConnectionRetry(() => connect(target.url), {
    host: target.host,
    log: (line) => console.log(line),
  });

if (command === "calendar") {
  let client: pg.Client;
  try {
    client = await retrying();
  } catch (error) {
    console.error(
      `calendar: could not reach ${target.host} (${describeError(error)})`,
    );
    process.exit(1);
  }
  let code = 0;
  try {
    await topUpCalendar({
      db: client,
      seed: process.env.CHKOUN_SEED,
      today: tunisDay(new Date()),
      log: (line) => console.log(line),
    });
  } catch (error) {
    code = 1;
    console.error(
      error instanceof CalendarRefusal
        ? `calendar: refused: ${error.message}`
        : `calendar: failed, nothing written (${describeError(error)})`,
    );
  }
  await client.end().catch(() => {});
  process.exit(code);
} else if (command === "wake") {
  const started = Date.now();
  let client: pg.Client;
  try {
    client = await retrying();
  } catch (error) {
    console.error(
      `wake: could not reach ${target.host} (${describeError(error)})`,
    );
    process.exit(1);
  }
  await client.end();
  console.log(
    `wake: ${target.host} answered in ${((Date.now() - started) / 1000).toFixed(1)} s`,
  );
} else {
  const opened: pg.Client[] = [];
  const code = await runSync({
    root: process.cwd(),
    open: async () => {
      const client = await retrying();
      opened.push(client);
      return {
        query: (text: string, values?: unknown[]) => client.query(text, values),
      };
    },
    log: (line) => console.log(line),
    host: target.host,
  });
  for (const client of opened) await client.end().catch(() => {});
  process.exit(code);
}
