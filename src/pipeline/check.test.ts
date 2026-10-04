import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { checkData, inspectData } from "./check.ts";
import type { Pool } from "./types.ts";

const run = promisify(execFile);
const CLI = path.join(process.cwd(), "src", "pipeline", "cli.ts");
/** Every spawned CLI loads no-network.ts first: its fetch always throws. */
const NO_NETWORK_ARGS = [
  "--import",
  pathToFileURL(path.join(process.cwd(), "src", "pipeline", "no-network.ts"))
    .href,
];

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

  // Fix round 3: the build decides which footballers and clubs exist, so ids
  // the last build did not see are warnings here, never errors.
  it("checks overrides against the last pool once there is one, excluded footballers allowed", async () => {
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
    expect(await inspectData(root)).toEqual({
      errors: [],
      warnings: [
        'data/overrides.json: players.Q2836275.club: club "Q44897" not seen by the last build; the next build will decide',
        "data/overrides.json: players.Q5: not seen by the last build; the next build will decide",
      ],
    });
  });
});

describe("pnpm data:check (node src/pipeline/cli.ts check)", () => {
  it("passes on the repository's data and prints no module warning", async () => {
    const { stdout, stderr } = await run(
      process.execPath,
      [...NO_NETWORK_ARGS, CLI, "check"],
      {
        cwd: process.cwd(),
      },
    );
    expect(stdout).toContain("data:check: ok");
    expect(stderr).not.toContain("MODULE_TYPELESS_PACKAGE_JSON");
  });

  it("says what it could not check while there is no pool", async () => {
    const { root } = await copyOfData();
    await rm(path.join(root, "data", "pool.json"), { force: true });
    const { stdout } = await run(
      process.execPath,
      [...NO_NETWORK_ARGS, CLI, "check"],
      {
        cwd: root,
      },
    );
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
    const failed = await run(
      process.execPath,
      [...NO_NETWORK_ARGS, CLI, "check"],
      {
        cwd: root,
      },
    ).then(
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

describe("data:check agrees with the build about overrides (fix round 3)", () => {
  const leftOut: Pool = {
    ...pool,
    dropped: [
      { wikidataId: "Q7", name: "Left Out", reason: "no-pool", flags: [] },
      {
        wikidataId: "Q600",
        name: "No Position",
        reason: "missing-field",
        flags: [],
      },
    ],
  };
  const cli = (root: string) =>
    run(process.execPath, [...NO_NETWORK_ARGS, CLI, "check"], {
      cwd: root,
    }).then(
      ({ stdout }) => ({ code: 0, stdout, stderr: "" }),
      (error: { code: number; stdout: string; stderr: string }) => error,
    );

  it("warns about a footballer Wikidata added since the last build, even with a pools override; exit 0", async () => {
    const { root, write } = await copyOfData();
    await write("pool.json", leftOut);
    await write("ids.json", {
      players: { Q2836275: "ali-maaloul", Q8: "gone-for-good" },
      clubs: { Q1024482: "cs-sfaxien" },
    });
    await write("overrides.json", {
      players: {
        Q8: { caps: { value: 4, ...by } },
        Q9: { pools: { value: { active: false, legend: true }, ...by } },
      },
      clubTitles: {},
    });
    const notSeen = "not seen by the last build; the next build will decide";
    expect(await inspectData(root)).toEqual({
      errors: [],
      warnings: [
        `data/overrides.json: players.Q8: ${notSeen}`,
        `data/overrides.json: players.Q9: ${notSeen}`,
      ],
    });
    const out = await cli(root);
    expect(out.code).toBe(0);
    expect(out.stdout).toContain(
      `data:check: warning: data/overrides.json: players.Q9: ${notSeen}`,
    );
    expect(out.stdout).toContain("data:check: ok");
  });

  it("says a footballer left out will get his override at the next build, never stale; exit 0", async () => {
    const { root, write } = await copyOfData();
    await write("pool.json", leftOut);
    await write("overrides.json", {
      players: {
        Q7: { caps: { value: 3, ...by } },
        Q600: { position: { value: "goalkeeper", ...by } },
      },
      clubTitles: {},
    });
    const { errors, warnings } = await inspectData(root);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([
      "data/overrides.json: players.Q7: left out by the last build (no-pool); this override will be applied by the next build",
      "data/overrides.json: players.Q600: left out by the last build (missing-field); this override will be applied by the next build",
    ]);
    expect(warnings.some((w) => w.includes("stale"))).toBe(false);
    expect((await cli(root)).code).toBe(0);
  });

  it("still fails on a shape error, exit 1", async () => {
    const { root, write } = await copyOfData();
    await write("pool.json", leftOut);
    await write("overrides.json", {
      players: { Q9: { position: { value: "striker", ...by } } },
      clubTitles: {},
    });
    const out = await cli(root);
    expect(out.code).toBe(1);
    expect(out.stderr).toContain(
      'data/overrides.json: players.Q9.position: invalid value "striker"',
    );
  });

  it("fails on a footballer excluded and overridden at once", async () => {
    const { root, write } = await copyOfData();
    await write("pool.json", leftOut);
    await write("overrides.json", {
      players: {
        Q7: {
          exclude: { value: true, ...by },
          pools: { value: { active: false, legend: true }, ...by },
        },
      },
      clubTitles: {},
    });
    expect(await checkData(root)).toEqual([
      "data/overrides.json: players.Q7: excluded and overridden at once",
    ]);
  });
});
