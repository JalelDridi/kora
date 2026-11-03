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

function dryRun(cwd: string, env: Record<string, string> = {}) {
  const r = spawnSync("bash", [SCRIPT, "--dry-run"], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, MERGE_WHEN_GREEN: "", ...env },
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
    expect(r.out.split("\n")[0]).toMatch(
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

// The admin dashboard's Rebuild now (Task 7): a dispatch with
// merge_when_green turns GitHub auto-merge on for the pull request, but
// only when main requires the status check `check` (Task 7 review, B1:
// auto-merge waits for required checks alone, so with none GitHub merges at
// once, before CI); any other night turns it off before the push, so a
// scheduled night never inherits it.
describe("open-data-pr.sh: auto-merge", () => {
  const RULES = "repos/{owner}/{repo}/rules/branches/main";
  // The branch, not its /protection endpoint: that one answers 403 to the
  // workflow's GITHUB_TOKEN, while the branch carries the same summary.
  const PROTECTION = "repos/{owner}/{repo}/branches/main";
  const NO_CHECK = "main has no required check: auto-merge left off";
  /** What GitHub answers: a ruleset requiring check, as the README asks. */
  const RULESET = [
    { type: "deletion", parameters: {} },
    {
      type: "required_status_checks",
      parameters: {
        strict_required_status_checks_policy: false,
        required_status_checks: [{ context: "check", integration_id: 15368 }],
      },
    },
  ];
  /** The branch under a classic protection requiring check. */
  const CLASSIC = {
    name: "main",
    protected: true,
    protection: {
      enabled: true,
      required_status_checks: {
        enforcement_level: "non_admins",
        contexts: ["check"],
        checks: [{ context: "check", app_id: 15368 }],
      },
    },
  };

  async function changed() {
    const dir = await repo();
    await writeFile(path.join(dir, "data", "pool.json"), "pool.json 2\n");
    return dir;
  }

  /**
   * A gh that writes down how it was called. `gh api PATH` answers the JSON
   * in `answers[PATH]` (through jq when --jq is given, as gh does), or a
   * 404 as gh does when the path has no answer.
   */
  async function fakeGhApi(answers: Record<string, unknown>) {
    const bin = await tempDir();
    const log = path.join(bin, "gh.log");
    const files: string[] = [];
    for (const [key, value] of Object.entries(answers)) {
      const file = path.join(bin, `answer-${files.length}.json`);
      await writeFile(file, JSON.stringify(value));
      files.push(`  ${JSON.stringify(key)}) answer=${JSON.stringify(file)} ;;`);
    }
    await writeFile(
      path.join(bin, "gh"),
      [
        "#!/usr/bin/env bash",
        `echo "$*" >> "${log}"`,
        'if [ "$1" = api ]; then',
        '  answer=""',
        '  case "$2" in',
        ...files,
        "  esac",
        '  if [ -z "$answer" ]; then',
        '    echo \'{"message":"Not Found","status":"404"}\'',
        '    echo "gh: Not Found (HTTP 404)" >&2',
        "    exit 1",
        "  fi",
        '  if [ "$3" = --jq ]; then jq -r "$4" "$answer"; else cat "$answer"; fi',
        "fi",
        "",
      ].join("\n"),
      { mode: 0o755 },
    );
    return {
      env: {
        ...process.env,
        MERGE_WHEN_GREEN: "",
        GIT_CONFIG_GLOBAL: "/dev/null",
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      },
      calls: () =>
        readFile(log, "utf8").then(
          (t) => t.trim().split("\n"),
          () => [] as string[],
        ),
    };
  }

  async function dryRunWith(
    answers: Record<string, unknown>,
    env: Record<string, string>,
  ) {
    const gh = await fakeGhApi(answers);
    const r = spawnSync("bash", [SCRIPT, "--dry-run"], {
      cwd: await changed(),
      encoding: "utf8",
      env: { ...gh.env, ...env },
    });
    return { status: r.status, out: r.stdout.trim(), calls: await gh.calls() };
  }

  it("the dry run says it would turn auto-merge on with MERGE_WHEN_GREEN=1 and a ruleset requiring check", async () => {
    const r = await dryRunWith({ [RULES]: RULESET }, { MERGE_WHEN_GREEN: "1" });
    expect(r.status).toBe(0);
    expect(r.out.split("\n")[1]).toBe(
      "dry run: would enable auto-merge (squash)",
    );
    // Reads only: nothing pushed, opened or merged.
    expect(r.calls.every((c) => c.startsWith("api "))).toBe(true);
  });

  it("the dry run leaves auto-merge off, and says why, when main requires no check", async () => {
    const r = await dryRunWith({ [RULES]: [] }, { MERGE_WHEN_GREEN: "1" });
    expect(r.status).toBe(0);
    expect(r.out.split("\n")[1]).toBe(NO_CHECK);
  });

  it("the dry run says it would turn auto-merge off without it, and reads nothing", async () => {
    const r = await dryRunWith({ [RULES]: RULESET }, {});
    expect(r.out.split("\n")[1]).toBe("dry run: would turn auto-merge off");
    expect(r.calls).toEqual([]);
  });

  it("says nothing of auto-merge when there is nothing to propose", async () => {
    const r = dryRun(await repo(), { MERGE_WHEN_GREEN: "1" });
    expect(r.out).not.toMatch(/auto-merge/);
  });

  // The real run against a fake gh and a local bare origin: the calls, in
  // order.
  async function realRun(
    answers: Record<string, unknown>,
    env: Record<string, string>,
  ) {
    const dir = await changed();
    const origin = await tempDir();
    git(origin, "init", "--quiet", "--bare");
    git(dir, "remote", "add", "origin", origin);
    const gh = await fakeGhApi(answers);
    const r = spawnSync("bash", [SCRIPT], {
      cwd: dir,
      encoding: "utf8",
      env: { ...gh.env, ...env },
    });
    return {
      status: r.status,
      out: r.stdout.trim(),
      err: r.stderr,
      calls: await gh.calls(),
      pushed: git(origin, "branch", "--list", "data/nightly").trim(),
    };
  }

  it("turns auto-merge on, squash, after CI is dispatched, when a ruleset on main requires check", async () => {
    const r = await realRun({ [RULES]: RULESET }, { MERGE_WHEN_GREEN: "1" });
    expect(r.status, r.err).toBe(0);
    expect(r.calls[0]).toBe(
      'api repos/{owner}/{repo}/rules/branches/main --jq [.[] | select(.type == "required_status_checks") | .parameters.required_status_checks[]?.context] | any(. == "check")',
    );
    expect(r.calls).not.toContain("pr merge data/nightly --disable-auto");
    expect(r.calls.slice(-2)).toEqual([
      "workflow run ci.yml --ref data/nightly",
      "pr merge data/nightly --auto --squash",
    ]);
    expect(r.out).toMatch(/auto-merge on$/);
  });

  it("turns auto-merge on when the classic protection of main requires check", async () => {
    const r = await realRun(
      { [RULES]: [], [PROTECTION]: CLASSIC },
      { MERGE_WHEN_GREEN: "1" },
    );
    expect(r.status, r.err).toBe(0);
    expect(r.calls.filter((c) => c.startsWith("api ")).length).toBe(2);
    expect(r.calls.at(-1)).toBe("pr merge data/nightly --auto --squash");
  });

  it("leaves auto-merge off, and says why, when neither a ruleset nor the protection requires check", async () => {
    const r = await realRun(
      {
        [RULES]: [{ type: "deletion", parameters: {} }],
        [PROTECTION]: {
          protection: {
            required_status_checks: {
              enforcement_level: "everyone",
              contexts: ["lint"],
              checks: [],
            },
          },
        },
      },
      { MERGE_WHEN_GREEN: "1" },
    );
    expect(r.status, r.err).toBe(0);
    expect(r.calls.some((c) => c.includes("--auto"))).toBe(false);
    expect(r.calls.at(-1)).toBe("workflow run ci.yml --ref data/nightly");
    expect(r.out.split("\n")).toContain(NO_CHECK);
  });

  // What the branch shows an ordinary token when nothing is required.
  it("leaves auto-merge off when the branch's check list is not enforced", async () => {
    const r = await realRun(
      {
        [RULES]: [],
        [PROTECTION]: {
          protection: {
            enabled: false,
            required_status_checks: {
              enforcement_level: "off",
              contexts: ["check"],
              checks: [],
            },
          },
        },
      },
      { MERGE_WHEN_GREEN: "1" },
    );
    expect(r.status, r.err).toBe(0);
    expect(r.calls.some((c) => c.includes("--auto"))).toBe(false);
    expect(r.out.split("\n")).toContain(NO_CHECK);
  });

  it("leaves auto-merge off when main has no protection (a 404), and still opens the pull request", async () => {
    const r = await realRun({ [RULES]: [] }, { MERGE_WHEN_GREEN: "1" });
    expect(r.status, r.err).toBe(0);
    expect(r.calls).toContain(
      'api repos/{owner}/{repo}/branches/main --jq .protection.required_status_checks // {} | select(.enforcement_level != "off") | [(.contexts // [])[], ((.checks // [])[] | .context)] | any(. == "check")',
    );
    expect(r.calls.some((c) => c.includes("--auto"))).toBe(false);
    expect(r.calls.some((c) => c.startsWith("pr create"))).toBe(true);
    expect(r.out.split("\n")).toEqual([
      NO_CHECK,
      "pull request ready: data/nightly",
    ]);
    expect(r.pushed).toBe("data/nightly");
  });

  // Task 7 review, m1: no head is pushed while an earlier auto-merge is on.
  it("turns auto-merge off before the push on any other night, and reads nothing", async () => {
    const r = await realRun({ [RULES]: RULESET }, {});
    expect(r.status, r.err).toBe(0);
    expect(r.calls).toEqual([
      "auth setup-git",
      "pr merge data/nightly --disable-auto",
      "pr list --head data/nightly --base main --state open --json number --jq .[].number",
      "pr create --base main --head data/nightly --title " +
        r.calls[3]!.split(" --title ")[1],
      "workflow run ci.yml --ref data/nightly",
    ]);
    expect(r.out).not.toMatch(/auto-merge/);
  });

  it("the workflow declares merge_when_green and hands it to the propose job only", async () => {
    const yml = await readFile(
      path.resolve(".github", "workflows", "nightly-data.yml"),
      "utf8",
    );
    expect(yml).toMatch(
      /merge_when_green:\n\s+description: "Merge the pull request by itself once CI passes \(the admin dashboard's Rebuild now\)"\n\s+type: boolean\n\s+default: false/,
    );
    const propose = yml.slice(yml.indexOf("\n  propose:"));
    expect(propose).toContain(
      "MERGE_WHEN_GREEN: ${{ inputs.merge_when_green && '1' || '' }}",
    );
    expect(yml.slice(0, yml.indexOf("\n  propose:"))).not.toContain(
      "MERGE_WHEN_GREEN",
    );
  });
});

describe("open-data-pr.sh: the pull request description", () => {
  async function body(
    report: string,
    env: Record<string, string> = {},
  ): Promise<string> {
    const dir = await tempDir();
    const input = path.join(dir, "report.md");
    const output = path.join(dir, "body.md");
    await writeFile(input, report);
    // The script is $1, never $0, and the folder is not a repository.
    execFileSync(
      "bash",
      ["-c", 'source "$1"; pr_body "$2" "$3"', "bash", SCRIPT, input, output],
      {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, MERGE_WHEN_GREEN: "", ...env },
      },
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

  it("says the pull request merges itself once CI passes on a dashboard rebuild", async () => {
    const text = await body("# Nightly pool\n", { MERGE_WHEN_GREEN: "1" });
    expect(text).not.toMatch(/never merges by itself/);
    expect(text).toMatch(/merges by itself once CI passes/);
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
