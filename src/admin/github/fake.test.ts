import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FakeGitHub } from "./fake.ts";
import { fakeGitHubFetch } from "./fake-fetch.ts";
import { HttpGitHub } from "./http.ts";
import type { GitHub } from "./types.ts";

// One contract, two clients: the in-memory fake the server tests use, and
// the real HTTP client over a fake fetch that answers like GitHub.

const seed = { "data/overrides.json": '{ "players": {}, "clubTitles": {} }\n' };
for (const [name, make] of [
  ["fake", () => new FakeGitHub({ files: { ...seed } })],
  [
    "http",
    () => new HttpGitHub("test-token", fakeGitHubFetch({ ...seed }).fetch),
  ],
] as const satisfies readonly (readonly [string, () => GitHub])[]) {
  describe(`GitHub contract: ${name}`, () => {
    it("reads a file with its sha and commits on top of it", async () => {
      const gh = make();
      const before = await gh.readFile("data/overrides.json");
      const commit = await gh.commitFile({
        path: before.path,
        text: "{}\n",
        sha: before.sha,
        message: "data(overrides): test",
      });
      expect(commit.files).toEqual(["data/overrides.json"]);
      expect(commit.message).toBe("data(overrides): test");
      expect(commit.parent).toMatch(/^[0-9a-f]{40}$/);
      expect(commit.sha).toMatch(/^[0-9a-f]{40}$/);
      expect(commit.url).toContain(commit.sha);
      expect((await gh.readFile("data/overrides.json")).text).toBe("{}\n");
      expect(
        (await gh.readFile("data/overrides.json", commit.parent!)).text,
      ).toBe(before.text);
      expect(
        (
          await gh.listCommits({ paths: ["data/overrides.json"], perPage: 5 })
        )[0].sha,
      ).toBe(commit.sha);
      expect((await gh.getCommit(commit.sha)).message).toBe(
        "data(overrides): test",
      );
      const next = await gh.commitFile({
        path: "data/overrides.json",
        text: "[]\n",
        sha: (await gh.readFile("data/overrides.json")).sha,
        message: "data(overrides): second",
      });
      expect(next.parent).toBe(commit.sha);
      expect(next.message).toBe("data(overrides): second");
    });
    it("refuses a commit on a stale sha with 409", async () => {
      const gh = make();
      const { sha } = await gh.readFile("data/overrides.json");
      await gh.commitFile({
        path: "data/overrides.json",
        text: "{}\n",
        sha,
        message: "one",
      });
      await expect(
        gh.commitFile({
          path: "data/overrides.json",
          text: "[]\n",
          sha,
          message: "two",
        }),
      ).rejects.toMatchObject({ status: 409 });
    });
    it("refuses a commit without a sha on an existing file with 422", async () => {
      await expect(
        make().commitFile({
          path: "data/overrides.json",
          text: "{}\n",
          sha: "",
          message: "m",
        }),
      ).rejects.toMatchObject({ status: 422 });
    });
    it("answers 404 for a file that is not there", async () => {
      await expect(make().readFile("data/nope.json")).rejects.toMatchObject({
        status: 404,
      });
    });
    it("records a dispatch as a queued nightly run", async () => {
      const gh = make();
      const id = await gh.dispatchWorkflow("nightly-data.yml", {
        merge_when_green: "true",
      });
      expect(
        (await gh.workflowRuns("nightly-data.yml", { perPage: 1 }))[0],
      ).toMatchObject({ id, event: "workflow_dispatch", status: "queued" });
      expect(id).toEqual(expect.any(Number));
      expect(await gh.workflowRuns("ci.yml", { perPage: 1 })).toEqual([]);
    });
    it("has no data pull request before a nightly opens one", async () => {
      expect(await make().dataPullRequest()).toBeNull();
    });
  });
}

describe("FakeGitHub backed by a file", () => {
  it("shares its state with every instance on the same file", async () => {
    const file = path.join(
      mkdtempSync(path.join(tmpdir(), "kora-gh-")),
      "gh.json",
    );
    const one = new FakeGitHub({ files: { ...seed }, file });
    const { sha } = await one.readFile("data/overrides.json");
    await one.commitFile({
      path: "data/overrides.json",
      text: "{}\n",
      sha,
      message: "m",
    });
    const two = new FakeGitHub({ files: {}, file });
    expect((await two.readFile("data/overrides.json")).text).toBe("{}\n");
    const state = JSON.parse(readFileSync(file, "utf8"));
    expect(Object.keys(state).sort()).toEqual(
      ["commits", "files", "jobs", "logs", "pull", "runs", "search"].sort(),
    );
  });
  it("gives a job's last log lines", async () => {
    const gh = new FakeGitHub({ files: {} });
    gh.state.logs["7"] = "a\nb\nc\n";
    expect(await gh.jobLogTail(7, 2)).toEqual(["b", "c"]);
  });
});
