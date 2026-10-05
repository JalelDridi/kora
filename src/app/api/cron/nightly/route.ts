import type pg from "pg";
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
import { describeError } from "@/pipeline/wake.ts";
import { openPg } from "@/db/pg";

// Vercel Cron, once a day at 02:40 UTC (vercel.json, N2 (a)): the copy of
// finished games to Postgres, then the calendar top-up. The work and the
// CRON_SECRET check are in src/chkoun/nightly.ts. One pg connection for both
// steps (src/db/pg.ts), opened only after the secret matched.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const now = new Date();
  const kv = getKv();
  const env = kvEnv();
  // Opened only once the secret matched: runNightly calls copy and topUp
  // after the check, and they share this one connection.
  let opened: Promise<pg.Client> | null = null;
  const db = () => (opened ??= openPg());
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
        const client = await db();
        return topUpCalendar({
          db: client,
          seed: process.env.CHKOUN_SEED,
          today: await tunisToday(client),
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
    const client = await (opened as Promise<pg.Client> | null)?.catch(
      () => null,
    );
    await client?.end().catch(() => {});
  }
}
