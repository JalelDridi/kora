import { describe, expect, it } from "vitest";
import { validateOverrides } from "./overrides.ts";

const governorates = new Set(["sfax", "tunis"]);
const by = { by: "jalel", at: "2026-10-05" };
/** Footballers and clubs of the pool the overrides must name. */
const known = {
  players: new Set(["Q1", "Q2836275"]),
  clubs: new Set(["Q201", "Q202"]),
};

describe("validateOverrides", () => {
  it("accepts a well-formed file", () => {
    const result = validateOverrides(
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
      known,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.overrides.players.Q2836275.club?.value).toBe("Q201");
    expect(result.overrides.clubTitles["en:Esperance de Tunis"]).toBe("Q202");
  });

  // Fix round 1, finding 5: any error means nothing may be applied, so the
  // result carries the errors and no overrides at all.
  it("names every problem and gives nothing to apply", () => {
    const result = validateOverrides(
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
      known,
    );
    expect(result).toEqual({
      ok: false,
      errors: [
        "players.Q1.colour: unknown field",
        "players.Q1.caps: invalid value -3",
        'players.Q1.governorate: invalid value "atlantis"',
        "players.Q1.position: needs value, by and at (YYYY-MM-DD)",
        "players.maaloul: not a Wikidata id with an object",
        'clubTitles.Esperance: must map "en:Title" or "fr:Title" to a Wikidata id',
        'clubTitles.fr:EST: must map "en:Title" or "fr:Title" to a Wikidata id',
      ],
    });
  });

  it("rejects footballers and clubs that are not in the pool", () => {
    const result = validateOverrides(
      {
        players: {
          Q999: { exclude: { value: true, ...by } },
          Q1: { club: { value: "Q5", ...by } },
          Q2836275: { club: { value: null, ...by } },
        },
        clubTitles: { "fr:EST": "Q6" },
      },
      governorates,
      known,
    );
    expect(result).toEqual({
      ok: false,
      errors: [
        "players.Q999: not a footballer in the pool",
        'players.Q1.club: "Q5" is not a club in the pool',
        'clubTitles.fr:EST: "Q6" is not a club in the pool',
      ],
    });
  });

  // Not in the brief: CHECKS is a plain object, so "toString" must not find
  // Object.prototype.toString and pass as a field.
  it("calls a field named after an object method unknown", () => {
    expect(
      validateOverrides(
        { players: { Q1: { toString: { value: 1, ...by } } }, clubTitles: {} },
        governorates,
        known,
      ),
    ).toEqual({ ok: false, errors: ["players.Q1.toString: unknown field"] });
  });

  it("treats a missing file as no overrides, and a wrong shape as an error", () => {
    expect(validateOverrides(null, governorates, known)).toEqual({
      ok: true,
      overrides: { players: {}, clubTitles: {} },
    });
    expect(validateOverrides([], governorates, known)).toEqual({
      ok: false,
      errors: ["overrides.json must be { players: {}, clubTitles: {} }"],
    });
  });
});
