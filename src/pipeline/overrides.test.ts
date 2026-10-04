import { describe, expect, it } from "vitest";
import { validateOverrides } from "./overrides.ts";

const governorates = new Set(["sfax", "tunis"]);
const by = { by: "jalel", at: "2026-10-05" };

describe("validateOverrides", () => {
  it("accepts a well-formed file", () => {
    const { overrides, errors } = validateOverrides(
      {
        players: {
          Q2836275: {
            club: { value: "Q201", ...by, note: "Al Ahly since 2016" },
            position: { value: "defender", ...by },
            governorate: { value: "sfax", ...by },
            pools: { value: { active: true, legend: true }, ...by },
          },
        },
        clubTitles: { "en:Esperance de Tunis": "Q202" },
      },
      governorates,
    );
    expect(errors).toEqual([]);
    expect(overrides.players.Q2836275.club?.value).toBe("Q201");
    expect(overrides.clubTitles["en:Esperance de Tunis"]).toBe("Q202");
  });

  it("names every problem and keeps the valid entries", () => {
    const { overrides, errors } = validateOverrides(
      {
        players: {
          Q1: {
            colour: { value: "red", ...by },
            caps: { value: -3, ...by },
            governorate: { value: "atlantis", ...by },
            position: { value: "forward" },
            nameArabic: { value: "علي", ...by },
          },
          maaloul: {},
        },
        clubTitles: { Esperance: "Q1", "fr:EST": "esperance" },
      },
      governorates,
    );
    expect(errors).toEqual([
      "players.Q1.colour: unknown field",
      "players.Q1.caps: invalid value -3",
      'players.Q1.governorate: invalid value "atlantis"',
      "players.Q1.position: needs value, by and at (YYYY-MM-DD)",
      "players.maaloul: not a Wikidata id with an object",
      'clubTitles.Esperance: must map "en:Title" or "fr:Title" to a Wikidata id',
      'clubTitles.fr:EST: must map "en:Title" or "fr:Title" to a Wikidata id',
    ]);
    expect(overrides.players.Q1.nameArabic?.value).toBe("علي");
  });

  // Not in the brief: CHECKS is a plain object, so "toString" must not find
  // Object.prototype.toString and pass as a field.
  it("calls a field named after an object method unknown", () => {
    const { overrides, errors } = validateOverrides(
      { players: { Q1: { toString: { value: 1, ...by } } }, clubTitles: {} },
      governorates,
    );
    expect(errors).toEqual(["players.Q1.toString: unknown field"]);
    expect(overrides.players.Q1).toEqual({});
  });

  it("treats a missing file as no overrides, and a wrong shape as an error", () => {
    expect(validateOverrides(null, governorates)).toEqual({
      overrides: { players: {}, clubTitles: {} },
      errors: [],
    });
    expect(validateOverrides([], governorates).errors).toHaveLength(1);
  });
});
