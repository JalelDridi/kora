import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  environmentRefusal,
  insideRepo,
  refuseReason,
  witnessDir,
} from "./safety.ts";

const where = {
  repoRoot: path.resolve("/work/kora"),
  home: path.resolve("/home/jalel"),
};
const live = ["--live"];

describe("refuseReason (B1)", () => {
  it("refuses under CI even with --live", () => {
    expect(refuseReason({ CI: "true" }, live, where)).toMatch(/^refused: CI/);
    expect(refuseReason({ GITHUB_ACTIONS: "true" }, live, where)).toMatch(
      /^refused: GITHUB_ACTIONS/,
    );
    expect(refuseReason({ VITEST: "true" }, live, where)).toMatch(
      /^refused: VITEST/,
    );
    expect(refuseReason({ CI: "1", VITEST: "1" }, live, where)).toBe(
      "refused: CI, VITEST are set; the private witness runs only by hand on Jalel's PC",
    );
  });

  it("refuses without --live", () => {
    expect(refuseReason({}, [], where)).toBe(
      "dry run: no --live, so no request is sent",
    );
    expect(refuseReason({}, ["--sample"], where)).not.toBeNull();
    expect(refuseReason({}, live, where)).toBeNull();
  });

  it("refuses when KORA_WITNESS_DIR is inside the repo", () => {
    const inside = { KORA_WITNESS_DIR: path.join(where.repoRoot, "data") };
    expect(refuseReason(inside, live, where)).toMatch(
      /^refused: the private folder .* is inside the repo/,
    );
    expect(
      refuseReason({ KORA_WITNESS_DIR: where.repoRoot }, live, where),
    ).not.toBeNull();
    // A sibling whose name starts like the repo is outside it.
    expect(
      refuseReason(
        { KORA_WITNESS_DIR: `${where.repoRoot}-witness` },
        live,
        where,
      ),
    ).toBeNull();
  });

  it("tests themselves run under VITEST, so they are refused", () => {
    expect(environmentRefusal(process.env, where)).toMatch(/VITEST/);
  });
});

describe("witnessDir and insideRepo (S17)", () => {
  it("defaults to <home>/.kora-witness and takes KORA_WITNESS_DIR", () => {
    expect(witnessDir({}, where.home)).toBe(
      path.join(where.home, ".kora-witness"),
    );
    expect(witnessDir({ KORA_WITNESS_DIR: "  " }, where.home)).toBe(
      path.join(where.home, ".kora-witness"),
    );
    expect(witnessDir({ KORA_WITNESS_DIR: "/srv/w" }, where.home)).toBe(
      path.resolve("/srv/w"),
    );
  });

  it("knows the repo, its subfolders and its siblings", () => {
    expect(insideRepo(where.repoRoot, where.repoRoot)).toBe(true);
    expect(
      insideRepo(path.join(where.repoRoot, "a", "b"), where.repoRoot),
    ).toBe(true);
    expect(insideRepo(path.resolve("/work/kora2"), where.repoRoot)).toBe(false);
    expect(insideRepo(path.resolve("/work"), where.repoRoot)).toBe(false);
  });
});
