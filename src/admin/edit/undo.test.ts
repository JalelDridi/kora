import { describe, expect, it } from "vitest";
import { FakeGitHub } from "../github/fake.ts";
import { editedHere, LOGGED, planUndo, undoFileOf, undoPatch } from "./undo.ts";

const file = (players: object) =>
  JSON.stringify({ players, clubTitles: {} }, null, 2) + "\n";
const o = (value: unknown, at = "2026-11-03") => ({ value, by: "jalel", at });

describe("undo", () => {
  it("restores what the commit changed and keeps later changes elsewhere", async () => {
    const before = file({ Q1: { caps: o(10, "2026-10-07") } });
    const after = file({ Q1: { caps: o(11) } });
    const current = file({ Q1: { caps: o(11) }, Q2: { localStar: o(true) } });
    const r = await undoPatch({ before, after, current, file: "overrides" });
    expect(r.ok && JSON.parse(r.text).players).toEqual({
      Q1: { caps: o(10, "2026-10-07") },
      Q2: { localStar: o(true) },
    });
  });
  it("an added footballer goes away entirely", async () => {
    const r = await undoPatch({
      before: file({}),
      after: file({ Q9: { include: o(true) } }),
      current: file({ Q9: { include: o(true) } }),
      file: "overrides",
    });
    expect(r.ok && JSON.parse(r.text).players).toEqual({});
  });
  it("refuses when the entry changed again since", async () => {
    const r = await undoPatch({
      before: file({}),
      after: file({ Q1: { caps: o(11) } }),
      current: file({ Q1: { caps: o(12) } }),
      file: "overrides",
    });
    expect(r).toEqual({
      ok: false,
      conflicts: ["players.Q1.caps changed since; edit it instead"],
    });
  });
  it("works by row on a curated file", async () => {
    const short = (clubs: object) =>
      JSON.stringify(
        { by: "jalel", at: "2026-11-03", note: "n", clubs },
        null,
        2,
      ) + "\n";
    const r = await undoPatch({
      before: short({ a: { latin: "A", arabic: "أ" } }),
      after: short({ a: { latin: "AA", arabic: "أ" } }),
      current: short({
        a: { latin: "AA", arabic: "أ" },
        b: { latin: "B", arabic: "ب" },
      }),
      file: "club-short",
    });
    expect(r.ok && JSON.parse(r.text).clubs).toEqual({
      a: { latin: "A", arabic: "أ" },
      b: { latin: "B", arabic: "ب" },
    });
  });

  // Beyond the plan's four: the undo of an exclusion, the diff, a removed
  // row put back in its place, the file's stamp, a list file, clubTitles.
  it("an exclusion undone brings back the overrides it replaced, and says so in the diff", async () => {
    const before = file({ Q1: { caps: o(10, "2026-10-07") } });
    const after = file({ Q1: { exclude: o(true) } });
    const r = await undoPatch({
      before,
      after,
      current: after,
      file: "overrides",
    });
    expect(r.ok && JSON.parse(r.text).players).toEqual({
      Q1: { caps: o(10, "2026-10-07") },
    });
    expect(r.ok && r.diff).toEqual([
      { path: "players.Q1.caps", before: "none", after: "10" },
      { path: "players.Q1.exclude", before: "yes", after: "none" },
    ]);
  });
  it("lists every conflict, not only the first", async () => {
    const r = await undoPatch({
      before: file({}),
      after: file({ Q1: { caps: o(11), goals: o(2) } }),
      current: file({ Q1: { caps: o(12), goals: o(3) } }),
      file: "overrides",
    });
    expect(r).toEqual({
      ok: false,
      conflicts: [
        "players.Q1.caps changed since; edit it instead",
        "players.Q1.goals changed since; edit it instead",
      ],
    });
  });
  it("a commit already undone is no conflict: nothing changes", async () => {
    const before = file({});
    const after = file({ Q1: { caps: o(11) } });
    const r = await undoPatch({
      before,
      after,
      current: before,
      file: "overrides",
    });
    expect(r).toEqual({ ok: true, text: before, diff: [] });
  });
  it("clubTitles entries are undone too", async () => {
    const titles = (clubTitles: object) =>
      JSON.stringify({ players: {}, clubTitles }, null, 2) + "\n";
    const r = await undoPatch({
      before: titles({ x: o("X") }),
      after: titles({ x: o("Y") }),
      current: titles({ x: o("Y"), z: o("Z") }),
      file: "overrides",
    });
    expect(r.ok && JSON.parse(r.text).clubTitles).toEqual({
      x: o("X"),
      z: o("Z"),
    });
  });
  it("a removed row comes back in its place, and a later stamp on the file stays", async () => {
    const strength = (at: string, clubs: object) =>
      JSON.stringify(
        { season: "2026-27", by: "jalel", at, note: "n", clubs },
        null,
        2,
      ) + "\n";
    const r = await undoPatch({
      before: strength("2026-10-01", { a: 60, b: 70, c: 80 }),
      after: strength("2026-11-02", { a: 60, c: 80 }),
      current: strength("2026-11-03", { a: 65, c: 80 }),
      file: "ligue1-strength",
    });
    expect(r.ok && JSON.parse(r.text)).toEqual({
      season: "2026-27",
      by: "jalel",
      at: "2026-11-03",
      note: "n",
      clubs: { a: 65, b: 70, c: 80 },
    });
    expect(r.ok && Object.keys(JSON.parse(r.text).clubs)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
  it("the file's stamp goes back with the change when nothing came after", async () => {
    const strength = (at: string, note: string) =>
      JSON.stringify({ by: "jalel", at, note, clubs: { a: 60 } }, null, 2) +
      "\n";
    const r = await undoPatch({
      before: strength("2026-10-01", "old"),
      after: strength("2026-11-02", "new"),
      current: strength("2026-11-02", "new"),
      file: "ligue1-strength",
    });
    expect(r.ok && JSON.parse(r.text)).toMatchObject({
      at: "2026-10-01",
      note: "old",
    });
    expect(r.ok && r.diff).toEqual([
      { path: "note", before: "new", after: "old" },
    ]);
  });
  it("a list file: an added entry goes, a later one stays", async () => {
    const clubs = (list: string[]) =>
      JSON.stringify({ season: "2026-27", clubs: list }, null, 2) + "\n";
    const r = await undoPatch({
      before: clubs(["A", "B"]),
      after: clubs(["A", "B", "C"]),
      current: clubs(["A", "B", "C", "D"]),
      file: "ligue1-clubs",
    });
    expect(r.ok && JSON.parse(r.text).clubs).toEqual(["A", "B", "D"]);
  });
  it("honours, a list of rows: the row edited goes back, with its own stamp", async () => {
    const row = (club: string, at: string) => ({
      competition: "ligue1",
      seasonStart: 2020,
      seasonEnd: 2021,
      clubWikidataId: club,
      by: "jalel",
      at,
    });
    const text = (rows: object[]) => JSON.stringify(rows, null, 2) + "\n";
    const r = await undoPatch({
      before: text([row("Q1", "2026-10-01")]),
      after: text([row("Q2", "2026-11-03")]),
      current: text([row("Q2", "2026-11-03")]),
      file: "honours",
    });
    expect(r.ok && JSON.parse(r.text)).toEqual([row("Q1", "2026-10-01")]);
  });
  it("keeps the file's layout, as pnpm format leaves it", async () => {
    const before = file({ Q1: { caps: o(10) } });
    const after = file({ Q1: { caps: o(11) } });
    const r = await undoPatch({
      before,
      after,
      current: after,
      file: "overrides",
    });
    expect(r.ok && r.text).toBe(before);
  });
});

describe("planUndo, on the GitHub fake", () => {
  const seed = file({ Q1: { caps: o(10, "2026-10-07") } });
  const fake = () => new FakeGitHub({ files: { "data/overrides.json": seed } });
  const commit = async (github: FakeGitHub, text: string, message: string) => {
    const { sha } = await github.readFile("data/overrides.json");
    return github.commitFile({
      path: "data/overrides.json",
      text,
      sha,
      message,
    });
  };

  it("the newest dashboard change: the file as before, a revert message with both trailers", async () => {
    const github = fake();
    const edit = await commit(
      github,
      file({ Q1: { caps: o(11) } }),
      "data(overrides): Q1 caps 11\n\nAdmin-Edit: overrides",
    );
    const r = await planUndo(github, edit.sha);
    expect(r.ok && r.text).toBe(seed);
    expect(r.ok && r.message).toBe(
      `revert(data): data(overrides): Q1 caps 11\n\n- players.Q1.caps: 11 → 10\n\nAdmin-Edit: overrides\nReverts: ${edit.sha}`,
    );
  });
  it("an older change: allowed while its entries are untouched, refused once one changed again", async () => {
    const github = fake();
    const first = await commit(
      github,
      file({ Q1: { caps: o(11) } }),
      "data(overrides): Q1 caps 11",
    );
    await commit(
      github,
      file({ Q1: { caps: o(11) }, Q2: { goals: o(3) } }),
      "data(overrides): Q2 goals 3",
    );
    const allowed = await planUndo(github, first.sha);
    expect(allowed.ok && JSON.parse(allowed.text).players).toEqual({
      Q1: { caps: o(10, "2026-10-07") },
      Q2: { goals: o(3) },
    });
    await commit(
      github,
      file({ Q1: { caps: o(12) }, Q2: { goals: o(3) } }),
      "data(overrides): Q1 caps 12",
    );
    expect(await planUndo(github, first.sha)).toMatchObject({
      ok: false,
      errors: ["players.Q1.caps changed since; edit it instead"],
    });
  });
  it("a commit touching several files is a hand commit: no undo here", async () => {
    const github = fake();
    const edit = await commit(github, file({}), "chore: by hand");
    github.update((state) => {
      state.commits[0].files.push("data/pool.json");
    });
    expect(await planUndo(github, edit.sha)).toMatchObject({
      ok: false,
      errors: ["made by hand; revert it on GitHub"],
    });
  });
  it("an unknown commit", async () => {
    expect(await planUndo(fake(), "f".repeat(40))).toEqual({
      ok: false,
      commit: null,
      errors: ["no such commit on GitHub"],
    });
  });
  it("the log lists the overrides and the six curated files", () => {
    expect(LOGGED).toHaveLength(7);
    expect(LOGGED.map(undoFileOf)).not.toContain(null);
    expect(undoFileOf("data/pool.json")).toBeNull();
    expect(editedHere("x\n\nAdmin-Edit: overrides")).toBe(true);
    expect(editedHere("x\n\nCo-Authored-By: someone")).toBe(false);
  });
});
