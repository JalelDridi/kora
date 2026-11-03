import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fsSource } from "../../pipeline/check.ts";
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
