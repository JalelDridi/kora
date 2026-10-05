import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// The pure parts of scripts/open-data-pr.sh, run by bash: whether there is
// anything to propose, and the pull request body. The parts that push and
// call GitHub run only in the nightly workflow.

const SCRIPT = path.resolve("scripts", "open-data-pr.sh");
const dirs: string[] = [];

afterAll(async () => {
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "kora-pr-"));
  dirs.push(dir);
  return dir;
}

const git = (cwd: string, ...args: string[]) =>
  execFileSync(
    "git",
    ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args],
    { cwd, encoding: "utf8" },
  );

function dryRun(cwd: string) {
  const r = spawnSync("bash", [SCRIPT, "--dry-run"], {
    cwd,
    encoding: "utf8",
  });
  return { status: r.status, out: r.stdout.trim(), err: r.stderr };
}

async function repo(): Promise<string> {
  const dir = await tempDir();
  git(dir, "init", "--quiet", "--initial-branch=main");
  await mkdir(path.join(dir, "data"));
  for (const name of ["pool.json", "ids.json", "report.md"])
    await writeFile(path.join(dir, "data", name), `${name} 1\n`);
  git(dir, "add", "data");
  git(dir, "commit", "--quiet", "-m", "data");
  return dir;
}

describe("open-data-pr.sh: is there anything to propose", () => {
  it("does nothing when the pool and the ids are unchanged, even if the report's date moved", async () => {
    const dir = await repo();
    await writeFile(
      path.join(dir, "data", "report.md"),
      "# Nightly pool, tomorrow\n",
    );

    expect(dryRun(dir)).toMatchObject({
      status: 0,
      out: "data unchanged: no pull request; would close an open one from data/nightly",
    });
  });

  // Final wave, B5: a nightly pull request left open from an earlier night
  // is closed when tonight equals main; nothing else is touched.
  // A `gh` that only writes down how it was called; `open` is what it
  // answers to `gh pr list`.
  async function fakeGh(open: string) {
    const bin = await tempDir();
    const log = path.join(bin, "gh.log");
    await writeFile(
      path.join(bin, "gh"),
      [
        "#!/usr/bin/env bash",
        `echo "$*" >> "${log.split(path.sep).join("/")}"`,
        `if [ "$1 $2" = "pr list" ]; then printf '%s' "${open}"; fi`,
        "",
      ].join("\n"),
      { mode: 0o755 },
    );
    return {
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      },
      calls: () =>
        readFile(log, "utf8").then(
          (t) => t.trim().split("\n"),
          () => [] as string[],
        ),
    };
  }

  async function withFakeGh(open: string) {
    const dir = await repo();
    const gh = await fakeGh(open);
    const r = spawnSync("bash", [SCRIPT], {
      cwd: dir,
      encoding: "utf8",
      env: gh.env,
    });
    return { status: r.status, out: r.stdout.trim(), calls: await gh.calls() };
  }

  it("closes a stale open pull request when the data equals main", async () => {
    const r = await withFakeGh("12");
    expect(r.status).toBe(0);
    expect(r.out).toBe("data unchanged: closed the stale pull request #12");
    expect(r.calls).toEqual([
      "pr list --head data/nightly --base main --state open --json number --jq .[].number",
      "pr close data/nightly --comment Closed by the nightly data job: a later night's data equals main, so this proposal is out of date.",
    ]);
  });

  it("does nothing more when no nightly pull request is open", async () => {
    const r = await withFakeGh("");
    expect(r.out).toBe("data unchanged: no pull request");
    expect(r.calls).toHaveLength(1);
  });

  // The description tests once sourced the script as
  // `bash -c 'source "$0"; …' SCRIPT in out`. Bash then puts the script's
  // path in $0, the old "am I sourced" check answered no, and the real run
  // started in the caller's repository: with a rebuilt pool waiting to be
  // committed, it pushed data/nightly and opened a pull request.
  it("runs nothing when it is sourced, even with its own path in $0", async () => {
    const dir = await repo();
    await writeFile(path.join(dir, "data", "pool.json"), "pool.json 2\n");
    const gh = await fakeGh("");
    const r = spawnSync("bash", ["-c", 'source "$0"', SCRIPT, "in", "out"], {
      cwd: dir,
      encoding: "utf8",
      env: gh.env,
    });
    expect(r.status).toBe(0);
    expect(await gh.calls()).toEqual([]);
    expect(git(dir, "branch", "--list", "data/nightly")).toBe("");
  });

  it("refuses an argument it does not know before it touches anything", async () => {
    const dir = await repo();
    await writeFile(path.join(dir, "data", "pool.json"), "pool.json 2\n");
    const gh = await fakeGh("");
    const r = spawnSync("bash", [SCRIPT, "report.md"], {
      cwd: dir,
      encoding: "utf8",
      env: gh.env,
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/unknown argument/);
    expect(await gh.calls()).toEqual([]);
    expect(git(dir, "branch", "--list", "data/nightly")).toBe("");
  });

  it("proposes the three files and the photos when the ids changed, and the dry run writes nothing", async () => {
    const dir = await repo();
    await writeFile(path.join(dir, "data", "ids.json"), "ids.json 2\n");
    const head = git(dir, "rev-parse", "HEAD");

    const r = dryRun(dir);
    expect(r.status).toBe(0);
    expect(r.out).toMatch(
      /^dry run: would commit data\/pool\.json data\/ids\.json data\/report\.md public\/photos to data\/nightly as "data: nightly pool \d{4}-\d{2}-\d{2}" with a \d+-byte description$/,
    );
    expect(git(dir, "rev-parse", "HEAD")).toBe(head);
    expect(git(dir, "branch", "--list", "data/nightly")).toBe("");
  });

  it("proposes when the pool changed", async () => {
    const dir = await repo();
    await writeFile(path.join(dir, "data", "pool.json"), "pool.json 2\n");
    expect(dryRun(dir).out).toMatch(/^dry run: would commit/);
  });

  // P30: a new or replaced thumbnail is a change to propose.
  it("proposes when a photo was added", async () => {
    const dir = await repo();
    await mkdir(path.join(dir, "public", "photos"), { recursive: true });
    await writeFile(path.join(dir, "public", "photos", "x.jpg"), "jpeg");
    expect(dryRun(dir).out).toMatch(/^dry run: would commit/);
  });
});

describe("open-data-pr.sh: the pull request description", () => {
  async function body(report: string): Promise<string> {
    const dir = await tempDir();
    const input = path.join(dir, "report.md");
    const output = path.join(dir, "body.md");
    await writeFile(input, report);
    // The script is $1, never $0, and the folder is not a repository.
    execFileSync(
      "bash",
      ["-c", 'source "$1"; pr_body "$2" "$3"', "bash", SCRIPT, input, output],
      { cwd: dir, encoding: "utf8" },
    );
    const bytes = await readFile(output);
    // Throws on a character cut in half.
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }

  it("is the report, then a line saying the pull request never merges by itself", async () => {
    const text = await body("# Nightly pool\n\nAll good.\n");
    expect(text.startsWith("# Nightly pool\n\nAll good.\n")).toBe(true);
    expect(text).toMatch(/never merges by itself/);
    expect(text).not.toMatch(/longer than a pull request/);
  });

  it("stays under GitHub's limit, cut at a line, never inside an Arabic letter", async () => {
    // About 150 kB: Arabic letters are two bytes each.
    const line =
      "| علي معلول | defender | caps 80 | النادي الرياضي الصفاقسي |\n";
    const text = await body("# Nightly pool\n" + line.repeat(1800));

    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(65_536);
    expect(Buffer.byteLength(text)).toBeGreaterThan(60_000);
    expect(text).toMatch(/longer than a pull request description allows/);
    expect(text).toMatch(/never merges by itself/);
    const cut = text.split("\n\n_The report is longer")[0];
    expect(cut.trimEnd().split("\n").at(-1)).toBe(line.trimEnd());
  });
});
