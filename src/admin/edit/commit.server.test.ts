import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { fsSource } from "../../pipeline/check.ts";
import { FakeGitHub } from "../github/fake.ts";
import { GitHubError } from "../github/types.ts";
import type { GitHub } from "../github/types.ts";
import { DEPLOYMENT_DATA, saveEdit } from "./commit.server.ts";
import { commitMessage } from "./message.ts";
import { applyOverridePatch } from "./overrides-patch.ts";

const PATH = "data/overrides.json";
const text = readFileSync(PATH, "utf8");
const base = fsSource(process.cwd());
const today = "2026-11-03";

const caps =
  (value: number, note = "FTF page") =>
  async (current: string) => {
    const applied = await applyOverridePatch(
      current,
      { qid: "Q2409513", changes: [{ field: "caps", to: value }], note },
      today,
    );
    return {
      ...applied,
      message: commitMessage({
        file: "overrides",
        subject: `Q2409513: caps ${value}`,
        lines: applied.diff,
        note,
      }),
    };
  };

describe("saveEdit", () => {
  it("reads main, applies, validates and commits one file", async () => {
    const github = new FakeGitHub({ files: { [PATH]: text } });
    const result = await saveEdit(
      { path: PATH, make: caps(102) },
      { github, base },
    );
    expect(result.ok).toBe(true);
    const saved = JSON.parse((await github.readFile(PATH)).text);
    expect(saved.players.Q2409513.caps.value).toBe(102);
    expect(github.state.commits).toHaveLength(1);
    expect(github.state.commits[0].message).toMatch(
      /^data\(overrides\): Q2409513: caps 102\n/,
    );
  });

  it("refuses with the validator's errors and commits nothing", async () => {
    const github = new FakeGitHub({ files: { [PATH]: text } });
    const make = async (current: string) => {
      const applied = await caps(102)(current);
      return {
        ...applied,
        text: applied.text.replace('"value": 102', '"value": -1'),
      };
    };
    expect(await saveEdit({ path: PATH, make }, { github, base })).toEqual({
      ok: false,
      errors: ["data/overrides.json: players.Q2409513.caps: invalid value -1"],
    });
    expect(github.state.commits).toHaveLength(0);
  });

  it("says what the patch refused, and that nothing changed", async () => {
    const github = new FakeGitHub({ files: { [PATH]: text } });
    expect(
      await saveEdit({ path: PATH, make: caps(102, "") }, { github, base }),
    ).toEqual({
      ok: false,
      errors: ["note: required when a value changes"],
    });
    const same = async (current: string) => ({
      ...(await caps(102)(current)),
      changed: false,
      text: current,
    });
    expect(
      await saveEdit({ path: PATH, make: same }, { github, base }),
    ).toEqual({
      ok: false,
      errors: ["nothing to save: no value changed"],
    });
    expect(github.state.commits).toHaveLength(0);
  });

  it("when main moves under it (409), starts once more from main's new copy", async () => {
    const github = new FakeGitHub({ files: { [PATH]: text } });
    const seen: string[] = [];
    const make = async (current: string) => {
      seen.push(current);
      // Someone else commits between our read and our commit, the first
      // time: another field, so the result shows which copy we patched.
      if (seen.length === 1) {
        const other = await applyOverridePatch(
          current,
          {
            qid: "Q2409513",
            changes: [{ field: "goals", to: 7 }],
            note: "elsewhere",
          },
          today,
        );
        const { sha } = await github.readFile(PATH);
        await github.commitFile({
          path: PATH,
          text: other.text,
          sha,
          message: "other",
        });
      }
      return caps(102)(current);
    };
    const result = await saveEdit({ path: PATH, make }, { github, base });
    expect(result.ok).toBe(true);
    expect(seen).toHaveLength(2);
    expect(seen[1]).not.toBe(seen[0]);
    expect(github.state.commits).toHaveLength(2);
    const saved = JSON.parse((await github.readFile(PATH)).text);
    expect(saved.players.Q2409513.caps).toMatchObject({
      value: 102,
      note: "FTF page",
    });
    // The other commit's change survives: make was given main's new text.
    expect(saved.players.Q2409513.goals).toMatchObject({
      value: 7,
      note: "elsewhere",
    });
  });

  it("gives up after a second 409, and passes no other GitHub failure off as a conflict", async () => {
    const fake = new FakeGitHub({ files: { [PATH]: text } });
    const conflicted: GitHub = Object.assign(Object.create(fake) as GitHub, {
      readFile: (p: string) => fake.readFile(p),
      commitFile: async () => {
        throw new GitHubError(409, "commitFile");
      },
    });
    expect(
      await saveEdit(
        { path: PATH, make: caps(102) },
        { github: conflicted, base },
      ),
    ).toEqual({
      ok: false,
      errors: ["main changed twice while saving; nothing was saved, try again"],
    });
    const down: GitHub = Object.assign(Object.create(fake) as GitHub, {
      readFile: async () => {
        throw new GitHubError(503, "readFile");
      },
    });
    expect(
      await saveEdit({ path: PATH, make: caps(102) }, { github: down, base }),
    ).toEqual({
      ok: false,
      errors: ["GitHub readFile: 503"],
    });
  });

  it("says edits are off without GitHub", async () => {
    expect(
      await saveEdit({ path: PATH, make: caps(102) }, { github: null, base }),
    ).toEqual({
      ok: false,
      errors: ["edits are off here: no GitHub token on this deployment"],
    });
  });
  it("refuses a file the dashboard does not edit, before asking GitHub", async () => {
    const fake = new FakeGitHub({ files: { [PATH]: text } });
    let reads = 0;
    const github: GitHub = Object.assign(Object.create(fake) as GitHub, {
      readFile: (p: string) => {
        reads++;
        return fake.readFile(p);
      },
    });
    for (const path of [
      "data/pool.json",
      "data/ids.json",
      "data/witness.json",
      "data/curated/unknown.json",
      "src/games.ts",
    ])
      expect(
        await saveEdit({ path, make: caps(102) }, { github, base }),
      ).toEqual({
        ok: false,
        errors: [`${path}: not a file the dashboard edits`],
      });
    expect(reads).toBe(0);
  });

  it("reuses the deployment's base result from one save to the next", async () => {
    const github = new FakeGitHub({ files: { [PATH]: text } });
    const read = vi.spyOn(DEPLOYMENT_DATA, "read");
    const poolReads = () =>
      read.mock.calls.filter(([name]) => name === "pool.json").length;
    try {
      expect(
        (await saveEdit({ path: PATH, make: caps(102) }, { github })).ok,
      ).toBe(true);
      read.mockClear();
      expect(
        (await saveEdit({ path: PATH, make: caps(103) }, { github })).ok,
      ).toBe(true);
      // Only the edited overlay reads the pool: the base result is cached.
      expect(poolReads()).toBe(1);
    } finally {
      read.mockRestore();
    }
  });
});
