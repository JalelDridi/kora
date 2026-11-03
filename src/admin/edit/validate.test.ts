import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fsSource, inspectSource } from "../../pipeline/check.ts";
import type { DataSource } from "../../pipeline/check.ts";
import { overlay, validateEdit } from "./validate.ts";

const disk = fsSource(process.cwd());
const asked: string[] = [];
/** The repository's data, recording any photo the check would look for. */
const base: DataSource = {
  read: (name) => disk.read(name),
  publicFileExists: async (p) => {
    asked.push(p);
    return true;
  },
};
const committed = (path: string) => readFileSync(path, "utf8");

describe("validateEdit", () => {
  it("passes an unchanged file, without its warnings about other files, and checks no photo", async () => {
    const result = await validateEdit(
      "data/overrides.json",
      committed("data/overrides.json"),
      base,
    );
    expect(result.errors).toEqual([]);
    expect(
      result.warnings.every((w) => w.startsWith("data/overrides.json: ")),
    ).toBe(true);
    expect(asked).toEqual([]);
  });

  it("a governorate the overrides use, removed, gives the overrides' error", async () => {
    const rows = JSON.parse(committed("data/curated/governorates.json")) as {
      id: string;
    }[];
    const { errors } = await validateEdit(
      "data/curated/governorates.json",
      JSON.stringify(rows.filter((r) => r.id !== "tunis")),
      base,
    );
    expect(errors).toContain(
      "data/curated/governorates.json: must list the 24 governorates",
    );
    expect(errors).toContain(
      'data/overrides.json: players.Q2409513.governorate: invalid value "tunis"',
    );
  });

  it("a strength entry removed gives no strength for its club", async () => {
    const json = JSON.parse(committed("data/curated/ligue1-strength.json"));
    delete json.clubs["club-africain"];
    const { errors } = await validateEdit(
      "data/curated/ligue1-strength.json",
      JSON.stringify(json),
      base,
    );
    expect(errors).toEqual([
      "data/curated/ligue1-strength.json: no strength for club-africain",
    ]);
  });

  it("an edited file's warning the base already gives is not repeated; one the edit changes is kept", async () => {
    const path = "data/curated/club-short.json";
    const json = JSON.parse(committed(path)) as {
      clubs: Record<string, { latin: string; arabic: string }>;
    };
    const before = await validateEdit(path, committed(path), base);
    expect(before.warnings).toEqual([]);
    // A row edited that leaves the automatic list as it was: no warning.
    const first = Object.keys(json.clubs)[0];
    json.clubs[first] = { ...json.clubs[first], latin: "ABC" };
    const unchanged = await validateEdit(path, JSON.stringify(json), base);
    expect(unchanged.errors).toEqual([]);
    expect(unchanged.warnings).toEqual([]);
    // A label given to a club on the automatic list changes the line: kept.
    const all = await inspectSource(base, { photos: false });
    const line = all.warnings.find((w) => w.startsWith(`${path}: `))!;
    const club = /curate them: ([a-z0-9-]+) /.exec(line)![1];
    json.clubs[club] = { latin: "XYZ", arabic: "س" };
    const changed = await validateEdit(path, JSON.stringify(json), base);
    expect(changed.warnings).toHaveLength(1);
    expect(changed.warnings[0]).not.toBe(line);
    expect(changed.warnings[0]).not.toContain(` ${club} (`);
  });

  it("keeps every error of the edited file, even one the base gives", async () => {
    const path = "data/curated/afcon-2004.json";
    const broken = JSON.stringify({
      by: "jalel",
      at: null,
      footballers: ["X1"],
    });
    const shifted: DataSource = overlay(base, { [path]: broken });
    const { errors } = await validateEdit(path, broken, shifted);
    expect(errors.some((e) => e.startsWith(`${path}: `))).toBe(true);
  });

  it("a file that is not JSON is named", async () => {
    const { errors } = await validateEdit(
      "data/curated/honours.json",
      "[",
      base,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^data\/curated\/honours\.json: .*JSON/);
  });

  it("refuses a path outside data/", async () => {
    await expect(validateEdit("package.json", "{}", base)).rejects.toThrow(
      "not a data file: package.json",
    );
  });
});

describe("overlay", () => {
  it("replaces the named files and reads the others from the base", async () => {
    const source = overlay(base, { "data/curated/honours.json": "[1]" });
    expect(await source.read("curated/honours.json")).toBe("[1]");
    expect(await source.read("curated/afcon-2004.json")).toBe(
      committed("data/curated/afcon-2004.json"),
    );
    expect(await source.read("nowhere.json")).toBeUndefined();
  });
});
