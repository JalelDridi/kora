import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestClient,
  resetDatabase,
  TEST_DATABASE_URL,
} from "@/db/testing";
import { syncPool } from "./sync.ts";
import type { SyncCounts } from "./sync.ts";
import { runSync } from "./sync-run.ts";
import type { GovernorateRow, Pool, PoolPlayer } from "./types.ts";

// The sync against the local Postgres: what a deploy writes, and that a
// second deploy of the same pool rewrites nothing.

const db = createTestClient(); // checks that the URL is local, first
const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
const sql = {
  query: (text: string, values?: unknown[]) => client.query(text, values),
};
const roots: string[] = [];

beforeAll(async () => {
  await client.connect();
});

afterAll(async () => {
  await client.end();
  await db.$disconnect();
  for (const root of roots) await rm(root, { recursive: true, force: true });
});

beforeEach(async () => {
  await resetDatabase(db);
});

const governorates: GovernorateRow[] = [
  {
    id: "sfax",
    nameLatin: "Sfax",
    nameArabic: "صفاقس",
    nameFrench: "Sfax",
    region: "centre_east",
  },
];

const maaloul: PoolPlayer = {
  id: "ali-maaloul",
  wikidataId: "Q2836275",
  nameLatin: "Ali Maâloul",
  nameArabic: "علي معلول",
  nameFrench: "Ali Maâloul",
  aliases: ["maaloul", "ma3loul"],
  position: "defender",
  positionDetail: "Left-back",
  birthDate: "1990-01-01",
  birthPlace: "Sfax",
  birthCountry: "TN",
  governorate: "sfax",
  clubId: "al-ahly",
  caps: 80,
  goals: 1,
  capsAsOf: "2026-09-19",
  history: [
    {
      clubId: "cs-sfaxien",
      clubName: "CS Sfaxien",
      from: 2010,
      to: 2016,
      apps: 120,
      goals: 5,
      loan: false,
    },
    {
      clubId: "al-ahly",
      clubName: "Al Ahly SC",
      from: 2016,
      to: null,
      apps: null,
      goals: null,
      loan: false,
    },
  ],
  photo: {
    file: "File:Ali Maaloul.jpg",
    thumbUrl: "https://upload.wikimedia.org/a.jpg",
    width: 800,
    height: 1000,
    licence: "CC BY-SA 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    author: "Someone",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Ali_Maaloul.jpg",
    attributionRequired: true,
  },
  wiki: { en: "Ali Maâloul", fr: "Ali Maâloul", ar: null },
  pools: { active: true, legend: true },
  provenance: {
    clubId: {
      source: "enwiki",
      retrievedAt: "2026-10-04",
      asOf: "2026-09-19",
      ref: "Ali Maâloul",
      confidence: "high",
      agreeing: ["enwiki", "frwiki"],
    },
  },
};

const msakni: PoolPlayer = {
  ...maaloul,
  id: "youssef-msakni",
  wikidataId: "Q2409513",
  nameLatin: "Youssef Msakni",
  aliases: [],
  governorate: null,
  birthCountry: null,
  clubId: null,
  history: [
    {
      clubId: "cs-sfaxien",
      clubName: "CS Sfaxien",
      from: 2008,
      to: 2009,
      apps: 1,
      goals: 0,
      loan: false,
    },
  ],
  photo: null,
  pools: { active: false, legend: true },
  provenance: {},
};

const ligue1 = (seasonStart: number, seasonEnd = seasonStart + 1) => ({
  competition: "tn_ligue1" as const,
  seasonStart,
  seasonEnd,
  clubId: "cs-sfaxien",
  source: "wikidata" as const,
});

function pool(
  players: PoolPlayer[],
  options: { country?: string; honours?: Pool["honours"] } = {},
): Pool {
  return {
    version: 1,
    players,
    clubs: [
      {
        id: "al-ahly",
        wikidataId: "Q201",
        nameLatin: "Al Ahly SC",
        nameArabic: null,
        nameFrench: null,
        country: "EG",
        confederation: "CAF",
        leagueWikidataId: null,
        ligue1: false,
      },
      {
        id: "cs-sfaxien",
        wikidataId: "Q202",
        nameLatin: "CS Sfaxien",
        nameArabic: "النادي الرياضي الصفاقسي",
        nameFrench: null,
        country: options.country ?? "TN",
        confederation: "CAF",
        leagueWikidataId: "Q794235",
        ligue1: true,
      },
    ],
    honours: options.honours ?? [ligue1(2012, 2013)],
    flags: [],
    dropped: [],
  };
}

const NOTHING: SyncCounts = {
  governorates: 0,
  clubs: 0,
  clubsLeftLigue1: 0,
  players: 0,
  leftPool: 0,
  spells: 0,
  spellsRemoved: 0,
  honours: 0,
  honoursRemoved: 0,
};

/**
 * Every row of the pool tables with xmin, the transaction that last wrote
 * it: equal snapshots mean no row was inserted, updated or deleted.
 */
async function snapshot(): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const table of [
    "governorates",
    "clubs",
    "players",
    "player_clubs",
    "honours",
  ]) {
    const { rows } = await client.query<{ row: string }>(
      `SELECT xmin::text || ' ' || to_jsonb(t)::text AS row FROM ${table} t ORDER BY 1`,
    );
    out[table] = rows.map((r) => r.row);
  }
  return out;
}

describe("syncPool", () => {
  it("writes governorates, clubs, footballers, careers and honours", async () => {
    expect(await syncPool(sql, pool([maaloul, msakni]), governorates)).toEqual({
      ...NOTHING,
      governorates: 1,
      clubs: 2,
      players: 2,
      spells: 3,
      honours: 1,
    });

    const row = await db.player.findUniqueOrThrow({
      where: { id: "ali-maaloul" },
      include: {
        career: { orderBy: { seq: "asc" } },
        club: true,
        governorate: true,
      },
    });
    expect(row.aliases).toEqual(["maaloul", "ma3loul"]);
    expect(row.club?.country).toBe("EG");
    expect(row.governorate?.region).toBe("centre_east");
    expect(row.birthDate.toISOString().slice(0, 10)).toBe("1990-01-01");
    expect(row.capsAsOf?.toISOString().slice(0, 10)).toBe("2026-09-19");
    expect(row.photoUrl).toBe("https://upload.wikimedia.org/a.jpg");
    expect(row.photoLicence).toBe("CC BY-SA 4.0");
    expect(row.photoSourceUrl).toBe(
      "https://commons.wikimedia.org/wiki/File:Ali_Maaloul.jpg",
    );
    expect([row.wikiEn, row.wikiAr, row.poolActive, row.poolLegend]).toEqual([
      "Ali Maâloul",
      null,
      true,
      true,
    ]);
    expect(row.career.map((s) => [s.seq, s.clubName, s.toYear])).toEqual([
      [0, "CS Sfaxien", 2016],
      [1, "Al Ahly SC", null],
    ]);
    // Confidence, agreeing sources and all: provenance goes in whole.
    expect(row.provenance).toEqual(maaloul.provenance);
    const honour = await db.honour.findFirstOrThrow();
    expect([honour.seasonStart, honour.seasonEnd, honour.source]).toEqual([
      2012,
      2013,
      "wikidata",
    ]);
  });

  it("rewrites no row when the same pool is synced again", async () => {
    await syncPool(sql, pool([maaloul, msakni]), governorates);
    const before = await snapshot();

    expect(await syncPool(sql, pool([maaloul, msakni]), governorates)).toEqual(
      NOTHING,
    );
    expect(await snapshot()).toEqual(before);
  });

  it("updates only what changed", async () => {
    await syncPool(sql, pool([maaloul, msakni]), governorates);
    const counts = await syncPool(
      sql,
      pool([{ ...maaloul, caps: 81 }, msakni]),
      governorates,
    );
    expect(counts).toEqual({ ...NOTHING, players: 1 });
    expect(
      (await db.player.findUniqueOrThrow({ where: { id: "ali-maaloul" } }))
        .caps,
    ).toBe(81);
  });

  it("keeps a footballer who left the pool, out of both pools, career and all", async () => {
    await syncPool(sql, pool([maaloul, msakni]), governorates);
    const counts = await syncPool(sql, pool([maaloul]), governorates);

    expect(counts).toEqual({ ...NOTHING, leftPool: 1 });
    const left = await db.player.findUniqueOrThrow({
      where: { id: "youssef-msakni" },
      include: { career: true },
    });
    expect([left.poolActive, left.poolLegend]).toEqual([false, false]);
    expect(left.career).toHaveLength(1);
  });

  it("keeps the puzzle and the report that point at a footballer who left the pool", async () => {
    await syncPool(sql, pool([maaloul, msakni]), governorates);
    const puzzle = await db.puzzle.create({
      data: {
        game: "chkoun",
        day: new Date("2026-10-05"),
        playerId: "youssef-msakni",
      },
    });
    await db.report.create({
      data: {
        playerId: "youssef-msakni",
        visitorId: "00000000-0000-4000-8000-000000000001",
        message: "He plays in Qatar now",
      },
    });

    await syncPool(sql, pool([maaloul]), governorates);

    const kept = await db.puzzle.findUniqueOrThrow({
      where: { id: puzzle.id },
    });
    expect(kept.playerId).toBe("youssef-msakni");
    expect(
      await db.report.count({ where: { playerId: "youssef-msakni" } }),
    ).toBe(1);
  });

  it("replaces a career rather than adding to it", async () => {
    await syncPool(sql, pool([maaloul]), governorates);
    const counts = await syncPool(
      sql,
      pool([{ ...maaloul, history: [maaloul.history[1]] }]),
      governorates,
    );

    // Position 0 changed (Al Ahly now), position 1 is gone.
    expect([counts.spellsRemoved, counts.spells]).toEqual([2, 1]);
    const career = await db.playerClub.findMany({
      where: { playerId: "ali-maaloul" },
    });
    expect(career.map((s) => [s.seq, s.clubName])).toEqual([[0, "Al Ahly SC"]]);
  });

  it("mirrors the honours in the file, two editions starting in 2018 included", async () => {
    const caf = (seasonEnd: number) => ({
      competition: "caf_cl" as const,
      seasonStart: 2018,
      seasonEnd,
      clubId: "al-ahly",
      source: "wikidata" as const,
    });
    await syncPool(
      sql,
      pool([maaloul], { honours: [caf(2018), caf(2019), ligue1(2011, 2011)] }),
      governorates,
    );
    expect(await db.honour.count()).toBe(3);

    // Jalel curates 2011–12; Wikidata's 2011 edition leaves the file.
    const counts = await syncPool(
      sql,
      pool([maaloul], {
        honours: [
          caf(2018),
          caf(2019),
          { ...ligue1(2011, 2012), source: "curated" },
        ],
      }),
      governorates,
    );

    expect([counts.honoursRemoved, counts.honours]).toEqual([1, 1]);
    const rows = await db.honour.findMany({
      orderBy: [{ competition: "asc" }, { seasonEnd: "asc" }],
    });
    expect(
      rows.map((h) => [h.competition, h.seasonStart, h.seasonEnd, h.source]),
    ).toEqual([
      ["tn_ligue1", 2011, 2012, "curated"],
      ["caf_cl", 2018, 2018, "wikidata"],
      ["caf_cl", 2018, 2019, "wikidata"],
    ]);
  });

  it("writes nothing when one row breaks a rule", async () => {
    await expect(
      syncPool(sql, pool([maaloul], { country: "tn" }), governorates),
    ).rejects.toThrow(/clubs_country_iso/);
    expect([
      await db.governorate.count(),
      await db.club.count(),
      await db.player.count(),
    ]).toEqual([0, 0, 0]);
  });
});

describe("runSync", () => {
  const realGovernorates = () =>
    readFile(path.join("data", "curated", "governorates.json"), "utf8");

  async function root(files: Record<string, string>): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), "kora-sync-"));
    roots.push(dir);
    for (const [name, text] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(dir, "data", name)), {
        recursive: true,
      });
      await writeFile(path.join(dir, "data", name), text);
    }
    return dir;
  }

  function opener() {
    const calls: number[] = [];
    return {
      calls,
      open: async () => {
        calls.push(1);
        return sql;
      },
    };
  }

  const lines: string[] = [];
  const log = (line: string) => {
    lines.push(line);
  };
  beforeEach(() => {
    lines.length = 0;
  });

  it("skips, and succeeds, when there is no data/pool.json", async () => {
    const o = opener();
    const dir = await root({
      "curated/governorates.json": await realGovernorates(),
    });

    expect(
      await runSync({ root: dir, open: o.open, log, host: "localhost" }),
    ).toBe(0);
    expect(o.calls).toEqual([]);
    expect(lines).toEqual(["sync: no data/pool.json, nothing to sync"]);
  });

  it("refuses an empty or invalid pool before touching the database", async () => {
    await syncPool(sql, pool([maaloul, msakni]), governorates);
    const before = await snapshot();
    const o = opener();
    const empty = await root({
      "pool.json": JSON.stringify(pool([])),
      "curated/governorates.json": await realGovernorates(),
    });
    const invalid = await root({
      "pool.json": JSON.stringify(
        pool([{ ...maaloul, governorate: "atlantis" }]),
      ),
      "curated/governorates.json": await realGovernorates(),
    });

    expect(
      await runSync({ root: empty, open: o.open, log, host: "localhost" }),
    ).toBe(1);
    expect(lines).toEqual([
      "sync: data/pool.json has no footballers",
      "sync: refused, nothing written (1 error)",
    ]);
    expect(
      await runSync({ root: invalid, open: o.open, log, host: "localhost" }),
    ).toBe(1);
    expect(lines.slice(2)).toEqual([
      "sync: player ali-maaloul: unknown governorate atlantis",
      "sync: refused, nothing written (1 error)",
    ]);
    expect(o.calls).toEqual([]);
    expect(await snapshot()).toEqual(before);
  });

  it("refuses a pool whose ids disagree with data/ids.json", async () => {
    const o = opener();
    const dir = await root({
      "pool.json": JSON.stringify(pool([maaloul])),
      "ids.json": JSON.stringify({
        players: { Q2836275: "ali-maaloul-2" },
        clubs: { Q201: "al-ahly", Q202: "cs-sfaxien" },
      }),
      "curated/governorates.json": await realGovernorates(),
    });

    expect(
      await runSync({ root: dir, open: o.open, log, host: "localhost" }),
    ).toBe(1);
    expect(lines.join("\n")).toMatch(/id differs from data\/ids\.json/);
    expect(o.calls).toEqual([]);
  });

  it("syncs the real data/pool.json, and a second run rewrites nothing", async () => {
    const file = JSON.parse(
      await readFile(path.join("data", "pool.json"), "utf8"),
    ) as Pool;
    const spells = file.players.reduce((n, p) => n + p.history.length, 0);
    const o = opener();

    expect(
      await runSync({
        root: process.cwd(),
        open: o.open,
        log,
        host: "localhost",
      }),
    ).toBe(0);
    expect(file.players).toHaveLength(310);
    expect([
      await db.governorate.count(),
      await db.club.count(),
      await db.player.count(),
      await db.playerClub.count(),
      await db.honour.count(),
      await db.player.count({ where: { poolActive: true } }),
      await db.player.count({ where: { poolLegend: true } }),
    ]).toEqual([
      24,
      file.clubs.length,
      file.players.length,
      spells,
      file.honours.length,
      file.players.filter((p) => p.pools.active).length,
      file.players.filter((p) => p.pools.legend).length,
    ]);
    const before = await snapshot();

    expect(
      await runSync({
        root: process.cwd(),
        open: o.open,
        log,
        host: "localhost",
      }),
    ).toBe(0);
    expect(lines.at(-1)).toBe("sync: nothing changed");
    expect(await snapshot()).toEqual(before);
  });
});
