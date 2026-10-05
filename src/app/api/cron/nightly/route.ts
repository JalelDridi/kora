import pg from "pg";
import { copyResults } from "@/chkoun/copy";
import { toResponse } from "@/chkoun/http";
import { getKv, kvEnv } from "@/chkoun/kv";
import { runNightly } from "@/chkoun/nightly";
import { tunisDay } from "@/engine/chkoun/day.ts";
import {
  CalendarRefusal,
  topUpCalendar,
  tunisToday,
} from "@/pipeline/calendar.ts";
import { describeError, withConnectionRetry } from "@/pipeline/wake.ts";

// Vercel Cron, once a day at 02:40 UTC (vercel.json, N2 (a)): the copy of
// finished games to Postgres, then the calendar top-up. The work and the
// CRON_SECRET check are in src/chkoun/nightly.ts. One pg connection for both
// steps, opened only after the secret matched, with the same wait for a
// suspended Neon compute as the build.

export const dynamic = "force-dynamic";

async function connect(url: string): Promise<pg.Client> {
  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: 10_000,
  });
  client.on("error", () => {});
  try {
    await client.connect();
    return client;
  } catch (error) {
    await client.end().catch(() => {});
    throw error;
  }
}

export async function GET(request: Request) {
  const now = new Date();
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  let client: pg.Client | null = null;
  const db = async () => {
    if (!url) throw new Error("no database");
    client ??= await withConnectionRetry(() => connect(url), {
      attempts: 3,
      delayMs: 3000,
    });
    return client;
  };
  const kv = getKv();
  const env = kvEnv();
  try {
    const result = await runNightly({
      authorization: request.headers.get("authorization"),
      secret: process.env.CRON_SECRET,
      kv,
      env,
      now,
      copy: async () =>
        copyResults({ kv, db: await db(), env, today: tunisDay(now) }),
      topUp: async () => {
        const c = await db();
        return topUpCalendar({
          db: c,
          seed: process.env.CHKOUN_SEED,
          today: await tunisToday(c),
          log: (line) => console.log(line),
        });
      },
      describe: (error) =>
        error instanceof CalendarRefusal
          ? "CHKOUN_SEED is not set"
          : describeError(error),
    });
    return toResponse(result);
  } finally {
    const open = client as pg.Client | null;
    if (open) await open.end().catch(() => {});
  }
}
