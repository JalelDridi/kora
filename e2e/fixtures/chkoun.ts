import { readFileSync } from "node:fs";
import pg from "pg";
import { E2E_ENV } from "../../playwright.config";
import { ANSWER_READY_SQL } from "../../src/pipeline/confidence.ts";
import { runSync } from "../../src/pipeline/sync-run.ts";
import type { Pool } from "../../src/pipeline/types.ts";

const pool = JSON.parse(readFileSync("data/pool.json", "utf8")) as Pool;

// The test database for the Chkoun? browser tests: data/pool.json synced
// as a deploy syncs it, tier A given to the answer-ready footballers (the
// committed pool may not carry fame yet), and the next 30 days filled with
// known answers. Run before the server is first asked for today's puzzle;
// it writes the same rows every time, so a second run changes nothing the
// server could have cached.

export type ChkounFixture = {
  today: string;
  /** Answer of each day from today, in order. */
  answers: string[];
  /** Active footballers that are never an answer: wrong guesses. */
  others: string[];
};

export async function seedChkoun(): Promise<ChkounFixture> {
  const client = new pg.Client({ connectionString: E2E_ENV.DATABASE_URL });
  await client.connect();
  try {
    // Every table, as the database tests reset it: rows they left must not
    // become answers. TRUNCATE fires no row trigger, so frozen days go too.
    // The same tables as resetTables in src/db/testing.ts.
    await client.query(
      "TRUNCATE results, reports, puzzles, player_clubs, honours, players, clubs, governorates RESTART IDENTITY CASCADE",
    );
    const code = await runSync({
      root: process.cwd(),
      open: async () => ({
        query: (text: string, values?: unknown[]) => client.query(text, values),
      }),
      log: () => {},
      host: "the test database",
    });
    if (code !== 0) throw new Error("the test pool could not be synced");
    const ready = (await client.query(ANSWER_READY_SQL)).rows.map((r) =>
      String(r.id),
    );
    if (ready.length < 40) throw new Error("too few answer-ready footballers");
    await client.query(
      "UPDATE players SET fame_tier = 'A' WHERE id = ANY($1::text[])",
      [ready],
    );
    const today = String(
      (
        await client.query(
          "SELECT to_char((now() AT TIME ZONE 'Africa/Tunis')::date, 'YYYY-MM-DD') AS d",
        )
      ).rows[0].d,
    );
    // Footballers with a copied photo first, so the tests that need one
    // (the photo row on /sources) run instead of skipping (review 2b, L3).
    const withPhoto = new Set(
      pool.players.filter((p) => p.photo?.path).map((p) => p.id),
    );
    const answers = [
      ...ready.filter((id) => withPhoto.has(id)),
      ...ready.filter((id) => !withPhoto.has(id)),
    ].slice(0, 30);
    await client.query(
      `INSERT INTO puzzles (id, game, day, player_id, source)
       SELECT gen_random_uuid(), 'chkoun', $1::date + (n - 1)::int, id, 'generator'
       FROM unnest($2::text[]) WITH ORDINALITY AS a(id, n)`,
      [today, answers],
    );
    const { rows } = await client.query(
      "SELECT id FROM players WHERE pool_active AND NOT (id = ANY($1::text[])) ORDER BY id LIMIT 9",
      [answers],
    );
    return { today, answers, others: rows.map((r) => String(r.id)) };
  } finally {
    await client.end();
  }
}
