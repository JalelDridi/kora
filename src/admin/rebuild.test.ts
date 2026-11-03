import { describe, expect, it, vi } from "vitest";
import { FakeGitHub, type FakeRun, type FakeState } from "./github/fake.ts";
import { findRun, readRebuild, refusalLines, rebuildState } from "./rebuild.ts";

const run = (o: object) => ({
  id: 7,
  status: "completed",
  conclusion: "success",
  event: "workflow_dispatch",
  createdAt: "2026-11-03T10:00:05Z",
  url: "u",
  headSha: "a",
  ...o,
});
const job = (name: string, conclusion: string | null) => ({
  id: name === "build" ? 1 : 2,
  name,
  status: "completed",
  conclusion,
  url: "j",
});
const base = {
  dispatchedAt: "2026-11-03T10:00:00Z",
  runs: [],
  jobs: [],
  log: [],
  pull: null,
  ci: [],
};

describe("the rebuild stage", () => {
  it("queued until GitHub lists the run, and the page refreshes", () =>
    expect(rebuildState(base)).toMatchObject({
      stage: "queued",
      refresh: true,
    }));
  it("a refused build shows the guard's own words", () => {
    const s = rebuildState({
      ...base,
      runs: [run({ conclusion: "failure" })],
      jobs: [job("build", "failure")],
      log: [
        "2026-11-03T10:03:00.1Z data:build refused: the night loses 14 of 230 active footballers (6.1%), over 5%",
        "2026-11-03T10:03:00.2Z ##[error]Process completed with exit code 1.",
      ],
    });
    expect(s).toMatchObject({ stage: "refused", refresh: false });
    expect(s.refusal).toEqual([
      "data:build refused: the night loses 14 of 230 active footballers (6.1%), over 5%",
    ]);
  });
  it("no pull request after a green run is no change", () =>
    expect(
      rebuildState({
        ...base,
        runs: [run({})],
        jobs: [job("build", "success"), job("propose", "success")],
      }).stage,
    ).toBe("no-change"));
  it("an open pull request with CI running is checking; green with auto-merge is merging; merged is merged", () => {
    const pull = {
      number: 43,
      state: "open" as const,
      merged: false,
      autoMerge: true,
      headSha: "b",
      url: "p",
      title: "data: nightly pool 2026-11-03",
    };
    const done = {
      ...base,
      runs: [run({})],
      jobs: [job("build", "success"), job("propose", "success")],
    };
    expect(
      rebuildState({
        ...done,
        pull,
        ci: [run({ status: "in_progress", conclusion: null, headSha: "b" })],
      }).stage,
    ).toBe("checking");
    expect(
      rebuildState({ ...done, pull, ci: [run({ headSha: "b" })] }).stage,
    ).toBe("merging");
    expect(
      rebuildState({
        ...done,
        pull: { ...pull, state: "closed", merged: true },
        ci: [run({ headSha: "b" })],
      }),
    ).toMatchObject({ stage: "merged", refresh: false });
    expect(
      rebuildState({
        ...done,
        pull,
        ci: [run({ conclusion: "failure", headSha: "b" })],
      }).stage,
    ).toBe("ci-failed");
  });
});

// Beyond the plan's four: the edges the page meets.
describe("the rebuild stage, the edges", () => {
  const pull = {
    number: 43,
    state: "open" as const,
    merged: false,
    autoMerge: true,
    headSha: "b",
    url: "p",
    title: "data: nightly pool 2026-11-03",
  };
  const green = {
    ...base,
    runs: [run({})],
    jobs: [job("build", "success"), job("propose", "success")],
  };

  it("idle without a rebuild started here, and no refresh", () =>
    expect(
      rebuildState({ ...base, dispatchedAt: null, runs: [run({})] }),
    ).toEqual({ stage: "idle", refresh: false }));

  it("a run still queued is queued; one in progress is building; both refresh", () => {
    expect(
      rebuildState({
        ...base,
        runs: [run({ status: "queued", conclusion: null })],
      }),
    ).toMatchObject({ stage: "queued", refresh: true, run: { id: 7 } });
    expect(
      rebuildState({
        ...base,
        runs: [run({ status: "in_progress", conclusion: null })],
      }),
    ).toMatchObject({ stage: "building", refresh: true });
  });

  it("a failed run without a guard's words is failed", () =>
    expect(
      rebuildState({
        ...base,
        runs: [run({ conclusion: "failure" })],
        jobs: [job("build", "failure")],
        log: ["2026-11-03T10:03:00.1Z Error: fetch failed"],
      }),
    ).toEqual({ stage: "failed", run: expect.anything(), refresh: false }));

  it("a cancelled run is failed", () =>
    expect(
      rebuildState({ ...base, runs: [run({ conclusion: "cancelled" })] }).stage,
    ).toBe("failed"));

  it("a refusal in the propose job's log is not a guard's", () =>
    expect(
      rebuildState({
        ...base,
        runs: [run({ conclusion: "failure" })],
        jobs: [job("build", "success"), job("propose", "failure")],
        log: ["data:build refused: x"],
      }).stage,
    ).toBe("failed"));

  it("says when GitHub refused auto-merge for the repository", () => {
    const s = rebuildState({
      ...base,
      runs: [run({ conclusion: "failure" })],
      jobs: [job("build", "success"), job("propose", "failure")],
      log: [
        "2026-11-03T10:09:00.1Z GraphQL: Auto merge is not allowed for this repository (enablePullRequestAutoMerge)",
      ],
      pull,
    });
    expect(s).toMatchObject({
      stage: "failed",
      autoMergeRefused: true,
      pull: { number: 43 },
    });
  });

  it("an earlier night's merged pull request is not this rebuild's", () => {
    const s = rebuildState({
      ...green,
      pull: { ...pull, state: "closed", merged: true },
      ci: [run({ headSha: "b", createdAt: "2026-11-02T01:40:00Z" })],
    });
    expect(s.stage).toBe("no-change");
    expect(s).not.toHaveProperty("pull");
  });

  it("an open pull request with no CI run listed yet is checking", () =>
    expect(rebuildState({ ...green, pull })).toMatchObject({
      stage: "checking",
      refresh: true,
    }));

  it("green CI with auto-merge off waits for a hand, without refreshing", () =>
    expect(
      rebuildState({
        ...green,
        pull: { ...pull, autoMerge: false },
        ci: [run({ headSha: "b" })],
      }),
    ).toMatchObject({ stage: "merging", refresh: false }));

  // Task 7 review, B1: the propose job arms auto-merge only when main
  // requires the check `check`, and says so in its log when it does not.
  it("green CI with the propose job's 'no required check' line says main requires no check", () =>
    expect(
      rebuildState({
        ...green,
        pull: { ...pull, autoMerge: false },
        ci: [run({ headSha: "b" })],
        log: [
          "2026-11-03T10:09:00.1Z main has no required check: auto-merge left off",
        ],
      }),
    ).toMatchObject({
      stage: "merging",
      noRequiredCheck: true,
      refresh: false,
    }));

  it("green CI with auto-merge off and no log line still says main requires no check", () =>
    expect(
      rebuildState({
        ...green,
        pull: { ...pull, autoMerge: false },
        ci: [run({ headSha: "b" })],
      }),
    ).toMatchObject({ stage: "merging", noRequiredCheck: true }));

  it("green CI with auto-merge on is merging by itself, nothing missing", () => {
    const s = rebuildState({ ...green, pull, ci: [run({ headSha: "b" })] });
    expect(s).toMatchObject({ stage: "merging", refresh: true });
    expect(s).not.toHaveProperty("noRequiredCheck");
  });

  it("CI still running with auto-merge off is checking, not yet the missing check", () => {
    const s = rebuildState({
      ...green,
      pull: { ...pull, autoMerge: false },
      ci: [run({ headSha: "b", status: "in_progress", conclusion: null })],
    });
    expect(s.stage).toBe("checking");
    expect(s).not.toHaveProperty("noRequiredCheck");
  });

  it("only the propose job's failure is GitHub refusing auto-merge, never the missing check", () => {
    const s = rebuildState({
      ...base,
      runs: [run({ conclusion: "failure" })],
      jobs: [job("build", "success"), job("propose", "failure")],
      log: [
        "2026-11-03T10:09:00.1Z GraphQL: Auto merge is not allowed for this repository (enablePullRequestAutoMerge)",
      ],
      pull,
    });
    expect(s).toMatchObject({ stage: "failed", autoMergeRefused: true });
    expect(s).not.toHaveProperty("noRequiredCheck");
  });

  it("a pull request closed without merging is failed", () =>
    expect(
      rebuildState({
        ...green,
        pull: { ...pull, state: "closed" },
        ci: [run({ headSha: "b" })],
      }).stage,
    ).toBe("failed"));

  it("CI runs on another commit do not count", () => {
    const s = rebuildState({ ...green, pull, ci: [run({ headSha: "z" })] });
    expect(s.stage).toBe("checking");
    expect(s).not.toHaveProperty("ciRun");
  });
});

describe("which run is the rebuild", () => {
  it("the newest dispatched run from 10 seconds before the click on", () => {
    const runs = [
      run({ id: 9, event: "schedule", createdAt: "2026-11-03T10:00:20Z" }),
      run({ id: 8, createdAt: "2026-11-03T09:59:51Z" }),
      run({ id: 6, createdAt: "2026-11-03T09:59:49Z" }),
    ];
    expect(findRun(runs, "2026-11-03T10:00:00Z")?.id).toBe(8);
    expect(findRun(runs.slice(2), "2026-11-03T10:00:00Z")).toBeUndefined();
  });
});

describe("the guard's lines in a job log", () => {
  it("data:check's errors, the count after them, no timestamps", () =>
    expect(
      refusalLines([
        "2026-11-03T10:03:00.0Z data:check: warning: 20 clubs",
        "2026-11-03T10:03:00.1Z data/overrides.json: players.Q1.caps must be a number",
        "2026-11-03T10:03:00.2Z data/curated/honours.json: Q2 is listed twice",
        "2026-11-03T10:03:00.3Z data:check: 2 errors",
        "2026-11-03T10:03:00.4Z ##[error]Process completed with exit code 1.",
      ]),
    ).toEqual([
      "data/overrides.json: players.Q1.caps must be a number",
      "data/curated/honours.json: Q2 is listed twice",
      "data:check: 2 errors",
    ]));

  it("at most 10, the count kept", () => {
    const errors = Array.from({ length: 14 }, (_, i) => `data/x.json: e${i}`);
    const lines = refusalLines([...errors, "data:check: 14 errors"]);
    expect(lines).toHaveLength(10);
    expect(lines.at(-1)).toBe("data:check: 14 errors");
    expect(lines[0]).toBe("data/x.json: e0");
  });

  it("nothing without a guard's line, even with data/ lines", () =>
    expect(refusalLines(["data/pool.json uploaded"])).toEqual([]));
});

describe("reading the rebuild from GitHub", () => {
  const since = "2026-11-03T10:00:00Z";
  const nightly = (o: Partial<FakeRun>): FakeRun => ({
    id: 7,
    workflow: "nightly-data.yml",
    inputs: {},
    status: "completed",
    conclusion: "success",
    event: "workflow_dispatch",
    createdAt: "2026-11-03T10:00:05Z",
    url: "u",
    headSha: "a",
    ...o,
  });

  function github(change: (s: FakeState) => void) {
    const fake = new FakeGitHub({ files: {} });
    fake.update(change);
    return fake;
  }

  it("reads the build's log when it failed, and nothing of the pull request", async () => {
    const fake = github((s) => {
      s.runs = [nightly({ conclusion: "failure" })];
      s.jobs["7"] = [
        {
          id: 1,
          name: "build",
          status: "completed",
          conclusion: "failure",
          url: "j",
        },
        {
          id: 2,
          name: "propose",
          status: "completed",
          conclusion: "skipped",
          url: "j",
        },
      ];
      s.logs["1"] = "2026-11-03T10:03:00.1Z data:build refused: too few\n";
      s.pull = {
        number: 42,
        state: "open",
        merged: false,
        autoMerge: false,
        headSha: "b",
        url: "p",
        title: "t",
      };
    });
    const pull = vi.spyOn(fake, "dataPullRequest");
    const view = await readRebuild(fake, since);
    expect(view.state).toMatchObject({
      stage: "refused",
      refusal: ["data:build refused: too few"],
    });
    expect(view.jobs.map((j) => j.name)).toEqual(["build", "propose"]);
    expect(pull).not.toHaveBeenCalled();
  });

  it("a green run: the pull request and CI on its head", async () => {
    const fake = github((s) => {
      s.runs = [
        nightly({ id: 8, workflow: "ci.yml", headSha: "b" }),
        nightly({}),
      ];
      s.jobs["7"] = [
        {
          id: 1,
          name: "build",
          status: "completed",
          conclusion: "success",
          url: "j",
        },
        {
          id: 2,
          name: "propose",
          status: "completed",
          conclusion: "success",
          url: "j",
        },
      ];
      s.pull = {
        number: 43,
        state: "open",
        merged: false,
        autoMerge: true,
        headSha: "b",
        url: "p",
        title: "t",
      };
    });
    const view = await readRebuild(fake, since);
    expect(view.state).toMatchObject({
      stage: "merging",
      ciRun: { id: 8 },
      pull: { number: 43 },
    });
    expect(view.recent.map((r) => r.id)).toEqual([7]);
    expect(view.busy).toBe(false);
  });

  it("a green run with auto-merge off reads the propose job's log for the reason", async () => {
    const fake = github((s) => {
      s.runs = [
        nightly({ id: 8, workflow: "ci.yml", headSha: "b" }),
        nightly({}),
      ];
      s.jobs["7"] = [
        {
          id: 1,
          name: "build",
          status: "completed",
          conclusion: "success",
          url: "j",
        },
        {
          id: 2,
          name: "propose",
          status: "completed",
          conclusion: "success",
          url: "j",
        },
      ];
      s.logs["2"] =
        "2026-11-03T10:09:00.1Z main has no required check: auto-merge left off\n";
      s.pull = {
        number: 43,
        state: "open",
        merged: false,
        autoMerge: false,
        headSha: "b",
        url: "p",
        title: "t",
      };
    });
    const log = vi.spyOn(fake, "jobLogTail");
    const view = await readRebuild(fake, since);
    expect(log).toHaveBeenCalledWith(2, 200);
    expect(view.state).toMatchObject({
      stage: "merging",
      noRequiredCheck: true,
    });
  });

  it("idle: the runs only, and busy while the newest runs", async () => {
    const fake = github((s) => {
      s.runs = [
        nightly({
          id: 9,
          status: "in_progress",
          conclusion: null,
          event: "schedule",
        }),
      ];
    });
    const jobs = vi.spyOn(fake, "runJobs");
    const view = await readRebuild(fake, null);
    expect(view).toMatchObject({ state: { stage: "idle" }, busy: true });
    expect(jobs).not.toHaveBeenCalled();
  });

  it("an unreadable log is a failed run, not an error", async () => {
    const fake = github((s) => {
      s.runs = [nightly({ conclusion: "failure" })];
      s.jobs["7"] = [
        {
          id: 1,
          name: "build",
          status: "completed",
          conclusion: "failure",
          url: "j",
        },
      ];
    });
    expect((await readRebuild(fake, since)).state.stage).toBe("failed");
  });
});
