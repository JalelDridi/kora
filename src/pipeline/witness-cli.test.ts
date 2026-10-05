import { execFile } from "node:child_process";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

/** Thrown by no-network.ts, which every spawned CLI loads first. */
const NO_NETWORK = "network is not allowed in tests";
const here = path.join(process.cwd(), "src", "pipeline");

/**
 * node --import no-network.ts witness-cli.ts <args>: the preload stays, so
 * even a run whose guards were removed could not reach a site.
 */
async function witness(
  args: string[],
  env: Record<string, string | undefined>,
  cwd: string,
) {
  return promisify(execFile)(
    process.execPath,
    [
      "--import",
      pathToFileURL(path.join(here, "no-network.ts")).href,
      path.join(here, "witness-cli.ts"),
      ...args,
    ],
    { cwd, env: env as NodeJS.ProcessEnv },
  ).then(
    ({ stdout, stderr }) => ({ code: 0, stdout, stderr }),
    (error: { code: number; stdout: string; stderr: string }) => error,
  );
}

/** The test's environment without the variables that make the command refuse. */
function plainEnv(extra: Record<string, string> = {}) {
  const env: Record<string, string | undefined> = { ...process.env };
  delete env.CI;
  delete env.GITHUB_ACTIONS;
  delete env.VITEST;
  return { ...env, ...extra };
}

describe("pnpm data:witness (node src/pipeline/witness-cli.ts)", () => {
  it("with CI=1 and --live: exit 2, the refusal, no request", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "kora-witness-cwd-"));
    const dir = await mkdtemp(path.join(tmpdir(), "kora-witness-dir-"));
    const out = await witness(
      ["--live"],
      plainEnv({ CI: "1", KORA_WITNESS_DIR: dir }),
      cwd,
    );
    expect(out.code).toBe(2);
    expect(out.stderr).toContain("refused: CI is set");
    expect(out.stdout).toBe("");
    expect(out.stderr).not.toContain(NO_NETWORK);
    expect(await readdir(dir)).toEqual([]);
  });

  it("refuses under VITEST too, as any test that spawned it would be", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "kora-witness-cwd-"));
    const out = await witness(
      ["--live"],
      { ...process.env, VITEST: "true" },
      cwd,
    );
    expect(out.code).toBe(2);
    expect(out.stderr).toContain("VITEST");
  });

  it("refuses a private folder inside the repo", async () => {
    const out = await witness(
      [],
      plainEnv({ KORA_WITNESS_DIR: path.join(process.cwd(), "data", "w") }),
      process.cwd(),
    );
    expect(out.code).toBe(2);
    expect(out.stderr).toMatch(/inside the repo/);
  });

  it("without --live: prints the plan (hosts, URLs, gaps, longest duration, private folder) and exits 0", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "kora-witness-cwd-"));
    const dir = await mkdtemp(path.join(tmpdir(), "kora-witness-dir-"));
    const out = await witness([], plainEnv({ KORA_WITNESS_DIR: dir }), cwd);
    expect(out.code).toBe(0);
    expect(out.stdout).toContain(`private folder: ${dir}`);
    expect(out.stdout).toContain(
      "transfermarkt: https://www.transfermarkt.com, at least 30 s apart",
    );
    expect(out.stdout).toContain(
      "national-football-teams: https://www.national-football-teams.com, at least 60 s apart",
    );
    expect(out.stdout).toContain(
      "/ligue-professionnelle-1/startseite/wettbewerb/TUN1/saison_id/2026",
    );
    expect(out.stdout).toContain("longest: about 9 min");
    expect(out.stdout).toContain("longest: about 39 min");
    expect(out.stdout).toContain("ids: unknown until the Wikidata query");
    expect(out.stdout).toContain("dry run: add --live to send these requests");
    expect(out.stdout + out.stderr).not.toContain(NO_NETWORK);
    // Nothing written to the private folder either.
    expect(await readdir(dir)).toEqual([]);
  });

  it("plans the one-off sample and a backfill without a request", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "kora-witness-cwd-"));
    const dir = await mkdtemp(path.join(tmpdir(), "kora-witness-dir-"));
    const sample = await witness(
      ["--sample"],
      plainEnv({ KORA_WITNESS_DIR: dir }),
      cwd,
    );
    expect(sample.code).toBe(0);
    expect(sample.stdout).toContain(
      "/club-africain-tunis/kader/verein/819/saison_id/2026",
    );
    const backfill = await witness(
      ["--backfill", "40"],
      plainEnv({ KORA_WITNESS_DIR: dir }),
      cwd,
    );
    expect(backfill.code).toBe(2);
    expect(backfill.stderr).toContain(
      "--backfill takes a number of pages from 1 to 39",
    );
  });
});
