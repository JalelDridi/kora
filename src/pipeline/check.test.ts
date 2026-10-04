import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { checkData, inspectData } from "./check.ts";
import type { Pool } from "./types.ts";

const run = promisify(execFile);
const CLI = path.join(process.cwd(), "src", "pipeline", "cli.ts");

/** A copy of the repository's data/ in a temporary folder, to break one file at a time. */
async function copyOfData(): Promise<{
  root: string;
  write: (name: string, value: unknown) => Promise<void>;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "kora-check-"));
  await cp(path.join(process.cwd(), "data"), path.join(root, "data"), {
    recursive: true,
  });
  return {
    root,
    write: (name, value) =>
      writeFile(
        path.join(root, "data", name),
        typeof value === "string" ? value : JSON.stringify(value),
      ),
  };
}

const pool: Pool = {
  version: 1,
  players: [
    {
      id: "ali-maaloul",
      wikidataId: "Q2836275",
      nameLatin: "Ali Maâloul",
      nameArabic: null,
      nameFrench: null,
      aliases: [],
      position: "defender",
      positionDetail: null,
      birthDate: "1990-01-01",
      birthPlace: null,
      birthCountry: "TN",
      governorate: "sfax",
      clubId: "cs-sfaxien",
      caps: 80,
      goals: 1,
      capsAsOf: null,
      history: [],
      photo: null,
      wiki: { en: null, fr: null, ar: null },
      pools: { active: true, legend: true },
      provenance: {},
    },
  ],
  clubs: [
    {
      id: "cs-sfaxien",
      wikidataId: "Q1024482",
      nameLatin: "CS Sfaxien",
      nameArabic: null,
      nameFrench: null,
      country: "TN",
      confederation: "CAF",
      leagueWikidataId: null,
      ligue1: true,
    },
  ],
  honours: [],
  flags: [],
  dropped: [],
};
const by = { by: "jalel", at: "2026-10-05" };

describe("checkData", () => {
  it("passes on the repository's own data", async () => {
    expect(await checkData(process.cwd())).toEqual([]);
  });

  it("reports a short governorate table, a bad override and a bad pool", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "kora-check-"));
    await mkdir(path.join(root, "data", "curated"), { recursive: true });
    const write = (name: string, value: unknown) =>
      writeFile(path.join(root, "data", name), JSON.stringify(value));
    await write("curated/governorates.json", [
      {
        id: "tunis",
        nameLatin: "Tunis",
        nameArabic: "تونس",
        nameFrench: "Tunis",
        region: "grand_tunis",
      },
    ]);
    await write("overrides.json", {
      players: { Q1: { caps: { value: -1, by: "jalel", at: "2026-10-05" } } },
      clubTitles: {},
    });
    await write("pool.json", { version: 2 });

    expect(await checkData(root)).toEqual([
      "data/curated/governorates.json: must list the 24 governorates",
      "data/overrides.json: players.Q1.caps: invalid value -1",
      "data/pool.json: not a version 1 pool",
    ]);
  });

  it("fails on a curated file that is not JSON, naming the file", async () => {
    const { root, write } = await copyOfData();
    await write("curated/ligue1-clubs.json", '{ "season": "2026–27", ');
    const errors = await checkData(root);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^data\/curated\/ligue1-clubs\.json: .*JSON/);
  });

  it("checks curated honours as the database does: end year and one winner per edition", async () => {
    const { root, write } = await copyOfData();
    const cup = {
      competition: "tn_cup",
      seasonStart: 2018,
      seasonEnd: 2019,
      clubWikidataId: "Q1024482",
      ...by,
    };
    await write("curated/honours.json", [
      cup,
      { ...cup, seasonEnd: 2020 },
      { ...cup, clubWikidataId: "Q44897" },
      { ...cup, seasonEnd: undefined },
    ]);
    expect(await checkData(root)).toEqual([
      `data/curated/honours.json: invalid entry ${JSON.stringify({ ...cup, seasonEnd: 2020 })}`,
      "data/curated/honours.json: edition tn_cup 2018–2019 twice",
      `data/curated/honours.json: invalid entry ${JSON.stringify({ ...cup, seasonEnd: undefined })}`,
    ]);
  });

  it("checks overrides against the pool once there is one, excluded footballers allowed", async () => {
    const { root, write } = await copyOfData();
    await write("pool.json", {
      ...pool,
      dropped: [
        { wikidataId: "Q6", name: "Excluded", reason: "excluded", flags: [] },
      ],
    });
    await write("overrides.json", {
      players: {
        Q2836275: { club: { value: "Q44897", ...by } },
        Q5: { caps: { value: 3, ...by } },
        Q6: { exclude: { value: true, ...by } },
      },
      clubTitles: {},
    });
    expect(await checkData(root)).toEqual([
      'data/overrides.json: players.Q2836275.club: "Q44897" is not a club in the pool',
      "data/overrides.json: players.Q5: not a footballer in the pool",
    ]);
  });
});

describe("pnpm data:check (node src/pipeline/cli.ts check)", () => {
  it("passes on the repository's data and prints no module warning", async () => {
    const { stdout, stderr } = await run(process.execPath, [CLI, "check"], {
      cwd: process.cwd(),
    });
    expect(stdout).toContain("data:check: ok");
    expect(stderr).not.toContain("MODULE_TYPELESS_PACKAGE_JSON");
  });

  it("says what it could not check while there is no pool", async () => {
    const { root } = await copyOfData();
    await rm(path.join(root, "data", "pool.json"), { force: true });
    const { stdout } = await run(process.execPath, [CLI, "check"], {
      cwd: root,
    });
    expect(stdout).toContain(
      "no data/pool.json yet: overrides checked for shape only, not against the pool",
    );
    expect(stdout).toContain("data:check: ok");
  });

  it("exits non-zero and prints each error on a broken file", async () => {
    const { root, write } = await copyOfData();
    await write("curated/honours.json", { not: "a list" });
    await write("overrides.json", {
      players: { Q1: { caps: { value: -1, ...by } } },
      clubTitles: {},
    });
    const failed = await run(process.execPath, [CLI, "check"], {
      cwd: root,
    }).then(
      () => null,
      (error: { code: number; stderr: string }) => error,
    );
    expect(failed?.code).toBe(1);
    expect(failed?.stderr).toContain(
      "data/overrides.json: players.Q1.caps: invalid value -1",
    );
    expect(failed?.stderr).toContain(
      "data/curated/honours.json: must be a list",
    );
  });
});

describe("data/ids.json (fix round 1, finding 2)", () => {
  it("is optional before the first build", async () => {
    const { root, write } = await copyOfData();
    await write("pool.json", pool);
    expect(await checkData(root)).toEqual([]);
  });

  it("must hold every pool member's id, and give no id twice", async () => {
    const { root, write } = await copyOfData();
    await write("pool.json", pool);
    await write("ids.json", {
      players: { Q1: "ali-maaloul", Q2: "ali-maaloul" },
      clubs: { Q1024482: "cs-sfaxien" },
    });
    expect(await checkData(root)).toEqual([
      "data/ids.json: players: id ali-maaloul given to Q1 and Q2",
      "data/pool.json: player ali-maaloul: no entry in data/ids.json",
    ]);
  });
});

describe("stale overrides (fix round 1, finding 4)", () => {
  const leftOut: Pool = {
    ...pool,
    dropped: [
      { wikidataId: "Q7", name: "Left Out", reason: "no-pool", flags: [] },
    ],
  };
  const stale = {
    players: {
      Q7: { caps: { value: 3, ...by } },
      Q8: { caps: { value: 4, ...by } },
    },
    clubTitles: {},
  };

  it("warns about footballers seen before (left-out list, id registry) but not in the pool", async () => {
    const { root, write } = await copyOfData();
    await write("pool.json", leftOut);
    await write("ids.json", {
      players: { Q2836275: "ali-maaloul", Q8: "gone-for-good" },
      clubs: { Q1024482: "cs-sfaxien" },
    });
    await write("overrides.json", stale);
    expect(await inspectData(root)).toEqual({
      errors: [],
      warnings: [
        "data/overrides.json: players.Q7: stale override: seen by the pipeline but not in the current pool; not applied",
        "data/overrides.json: players.Q8: stale override: seen by the pipeline but not in the current pool; not applied",
      ],
    });
    const { stdout } = await run(process.execPath, [CLI, "check"], {
      cwd: root,
    });
    expect(stdout).toContain(
      "data:check: warning: data/overrides.json: players.Q7: stale override",
    );
    expect(stdout).toContain("data:check: ok");
  });

  it("fails on an id never seen, exit 1", async () => {
    const { root, write } = await copyOfData();
    await write("pool.json", leftOut);
    await write("overrides.json", stale);
    expect(await checkData(root)).toEqual([
      "data/overrides.json: players.Q8: not a footballer in the pool",
    ]);
    const failed = await run(process.execPath, [CLI, "check"], {
      cwd: root,
    }).then(
      () => null,
      (error: { code: number; stderr: string }) => error,
    );
    expect(failed?.code).toBe(1);
    expect(failed?.stderr).toContain(
      "data/overrides.json: players.Q8: not a footballer in the pool",
    );
  });
});
