import type { GovernorateRow, Pool } from "./types.ts";

// data/pool.json → Postgres, in one transaction: all or nothing. Rows travel
// as one JSON parameter per table, unpacked by jsonb_to_recordset. A row is
// written only when it differs from the file, so syncing the same pool twice
// rewrites nothing. Footballers and clubs are never deleted: reports point at
// footballers (RESTRICT) and puzzles would lose their answer (SET NULL).

export type Queryable = {
  query(text: string, values?: unknown[]): Promise<{ rowCount: number | null }>;
};

/** Rows written: inserted or changed, or for the *Removed fields deleted. */
export type SyncCounts = {
  governorates: number;
  clubs: number;
  /** Clubs no longer in the file that lost their Ligue 1 mark. */
  clubsLeftLigue1: number;
  players: number;
  /** Footballers no longer in the file, now in neither pool. */
  leftPool: number;
  spells: number;
  spellsRemoved: number;
  honours: number;
  honoursRemoved: number;
};

/** Any number: one sync at a time per database (two builds of one environment). */
const LOCK = 724100;

type Column = { name: string; type: string; cast?: string };

/**
 * INSERT … ON CONFLICT (id) DO UPDATE, the update only when a value differs.
 * `stamp`: the table has updated_at, set whenever the row is written.
 */
function upsert(table: string, columns: Column[], stamp: boolean): string {
  const names = columns.map((c) => c.name);
  const values = columns.map((c) =>
    c.cast ? `r.${c.name}::"${c.cast}"` : `r.${c.name}`,
  );
  const changing = names.filter((n) => n !== "id");
  return `
INSERT INTO ${table} AS t (${names.join(", ")}${stamp ? ", updated_at" : ""})
SELECT ${values.join(", ")}${stamp ? ", now()" : ""}
FROM jsonb_to_recordset($1::jsonb)
  AS r(${columns.map((c) => `${c.name} ${c.type}`).join(", ")})
ON CONFLICT (id) DO UPDATE SET
  ${changing.map((n) => `${n} = EXCLUDED.${n}`).join(", ")}${stamp ? ", updated_at = now()" : ""}
WHERE ROW(${changing.map((n) => `t.${n}`).join(", ")})
  IS DISTINCT FROM ROW(${changing.map((n) => `EXCLUDED.${n}`).join(", ")})`;
}

const text = (name: string): Column => ({ name, type: "text" });

const GOVERNORATES = upsert(
  "governorates",
  [
    text("id"),
    text("name_latin"),
    text("name_arabic"),
    text("name_french"),
    { name: "region", type: "text", cast: "Region" },
  ],
  false,
);

const CLUBS = upsert(
  "clubs",
  [
    text("id"),
    text("wikidata_id"),
    text("name_latin"),
    text("name_arabic"),
    text("name_french"),
    text("country"),
    { name: "confederation", type: "text", cast: "Confederation" },
    text("league_wikidata_id"),
    { name: "ligue1", type: "boolean" },
  ],
  true,
);

const CLUBS_LEFT_LIGUE1 = `
UPDATE clubs SET ligue1 = false, updated_at = now()
WHERE ligue1 AND NOT (id = ANY($1::text[]))`;

const PLAYERS = upsert(
  "players",
  [
    text("id"),
    text("wikidata_id"),
    text("name_latin"),
    text("name_arabic"),
    text("name_french"),
    { name: "aliases", type: "text[]" },
    { name: "position", type: "text", cast: "Position" },
    text("position_detail"),
    { name: "birth_date", type: "date" },
    text("birth_place"),
    text("birth_country"),
    text("governorate"),
    { name: "caps", type: "int" },
    { name: "goals", type: "int" },
    { name: "caps_as_of", type: "date" },
    text("club_id"),
    text("photo_file"),
    text("photo_url"),
    text("photo_author"),
    text("photo_licence"),
    text("photo_licence_url"),
    text("photo_source_url"),
    text("wiki_en"),
    text("wiki_fr"),
    text("wiki_ar"),
    { name: "pool_active", type: "boolean" },
    { name: "pool_legend", type: "boolean" },
    { name: "provenance", type: "jsonb" },
    { name: "fame", type: "real" },
    text("fame_tier"),
    { name: "local_star", type: "boolean" },
  ],
  true,
);

const PLAYERS_LEFT_POOL = `
UPDATE players SET pool_active = false, pool_legend = false, updated_at = now()
WHERE (pool_active OR pool_legend) AND NOT (id = ANY($1::text[]))`;

const SPELL_RECORD = `jsonb_to_recordset($1::jsonb)
  AS r(player_id text, seq int, club_id text, club_name text, from_year int,
       to_year int, apps int, goals int, loan boolean)`;

/**
 * A career is the file's, position by position. For the footballers in the
 * file ($2), a spell not identical to the file's at its position goes; the
 * insert then fills the positions left empty. Footballers who left the pool
 * keep their careers.
 */
const SPELLS_STALE = `
WITH r AS MATERIALIZED (SELECT * FROM ${SPELL_RECORD})
DELETE FROM player_clubs s
WHERE s.player_id = ANY($2::text[])
  AND NOT EXISTS (
    SELECT 1 FROM r
    WHERE r.player_id = s.player_id AND r.seq = s.seq
      AND ROW(r.club_id, r.club_name, r.from_year, r.to_year, r.apps, r.goals, r.loan)
        IS NOT DISTINCT FROM
          ROW(s.club_id, s.club_name, s.from_year, s.to_year, s.apps, s.goals, s.loan))`;

const SPELLS = `
INSERT INTO player_clubs (player_id, seq, club_id, club_name, from_year, to_year, apps, goals, loan)
SELECT player_id, seq, club_id, club_name, from_year, to_year, apps, goals, loan
FROM ${SPELL_RECORD}
ON CONFLICT (player_id, seq) DO NOTHING`;

/** The table mirrors the file: an edition no longer in it goes (nothing references honours). */
const HONOURS_STALE = `
WITH r AS MATERIALIZED (
  SELECT * FROM jsonb_to_recordset($1::jsonb)
    AS r(competition text, season_start int, season_end int))
DELETE FROM honours h
WHERE NOT EXISTS (
  SELECT 1 FROM r
  WHERE r.competition = h.competition::text
    AND r.season_start = h.season_start AND r.season_end = h.season_end)`;

const HONOURS = `
INSERT INTO honours AS h (id, competition, season_start, season_end, club_id, source)
SELECT gen_random_uuid(), competition::"Competition", season_start, season_end, club_id, source
FROM jsonb_to_recordset($1::jsonb)
  AS r(competition text, season_start int, season_end int, club_id text, source text)
ON CONFLICT (competition, season_start, season_end) DO UPDATE SET
  club_id = EXCLUDED.club_id, source = EXCLUDED.source
WHERE ROW(h.club_id, h.source) IS DISTINCT FROM ROW(EXCLUDED.club_id, EXCLUDED.source)`;

/**
 * Writes the pool: governorates, then clubs, then footballers and their
 * careers, then honours. `pool.flags` and `pool.dropped` are for the
 * reviewer and are not synced. Throws, after a rollback, on any error.
 */
export async function syncPool(
  db: Queryable,
  pool: Pool,
  governorates: GovernorateRow[],
): Promise<SyncCounts> {
  const json = (rows: object[]) => [JSON.stringify(rows)];
  const written = async (sql: string, values: unknown[]) =>
    (await db.query(sql, values)).rowCount ?? 0;
  const ids = pool.players.map((p) => p.id);
  const spells = pool.players.flatMap((p) =>
    p.history.map((s, seq) => ({
      player_id: p.id,
      seq,
      club_id: s.clubId,
      club_name: s.clubName,
      from_year: s.from,
      to_year: s.to,
      apps: s.apps,
      goals: s.goals,
      loan: s.loan,
    })),
  );
  const honours = json(
    pool.honours.map((h) => ({
      competition: h.competition,
      season_start: h.seasonStart,
      season_end: h.seasonEnd,
      club_id: h.clubId,
      source: h.source,
    })),
  );

  await db.query("BEGIN");
  try {
    await db.query("SELECT pg_advisory_xact_lock($1)", [LOCK]);
    const counts: SyncCounts = {
      governorates: await written(
        GOVERNORATES,
        json(
          governorates.map((g) => ({
            id: g.id,
            name_latin: g.nameLatin,
            name_arabic: g.nameArabic,
            name_french: g.nameFrench,
            region: g.region,
          })),
        ),
      ),
      clubs: await written(
        CLUBS,
        json(
          pool.clubs.map((c) => ({
            id: c.id,
            wikidata_id: c.wikidataId,
            name_latin: c.nameLatin,
            name_arabic: c.nameArabic,
            name_french: c.nameFrench,
            country: c.country,
            confederation: c.confederation,
            league_wikidata_id: c.leagueWikidataId,
            ligue1: c.ligue1,
          })),
        ),
      ),
      clubsLeftLigue1: await written(CLUBS_LEFT_LIGUE1, [
        pool.clubs.map((c) => c.id),
      ]),
      players: await written(
        PLAYERS,
        json(
          pool.players.map((p) => ({
            id: p.id,
            wikidata_id: p.wikidataId,
            name_latin: p.nameLatin,
            name_arabic: p.nameArabic,
            name_french: p.nameFrench,
            aliases: p.aliases,
            position: p.position,
            position_detail: p.positionDetail,
            birth_date: p.birthDate,
            birth_place: p.birthPlace,
            birth_country: p.birthCountry,
            governorate: p.governorate,
            caps: p.caps,
            goals: p.goals,
            caps_as_of: p.capsAsOf,
            club_id: p.clubId,
            photo_file: p.photo?.file ?? null,
            photo_url: p.photo?.thumbUrl ?? null,
            photo_author: p.photo?.author ?? null,
            photo_licence: p.photo?.licence ?? null,
            photo_licence_url: p.photo?.licenceUrl ?? null,
            photo_source_url: p.photo?.sourceUrl ?? null,
            wiki_en: p.wiki.en,
            wiki_fr: p.wiki.fr,
            wiki_ar: p.wiki.ar,
            pool_active: p.pools.active,
            pool_legend: p.pools.legend,
            provenance: p.provenance,
            // D-S2-4; a pool built before Sprint 2 has no fame.
            fame: p.fame?.score ?? null,
            fame_tier: p.fame?.tier ?? null,
            local_star: p.fame?.localStar ?? false,
          })),
        ),
      ),
      leftPool: await written(PLAYERS_LEFT_POOL, [ids]),
      spellsRemoved: await written(SPELLS_STALE, [...json(spells), ids]),
      spells: await written(SPELLS, json(spells)),
      honoursRemoved: await written(HONOURS_STALE, honours),
      honours: await written(HONOURS, honours),
    };
    await db.query("COMMIT");
    return counts;
  } catch (error) {
    // A dead connection must not hide the error that killed it.
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  }
}
