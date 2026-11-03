import { describe, expect, it } from "vitest";
import type { DataSource } from "../pipeline/check.ts";
import type { Pool } from "../pipeline/types.ts";
import {
  editorNames,
  editorProblems,
  formRecord,
  SAVE_ERRORS,
  saveErrorCode,
} from "./footballer-page.ts";

describe("the footballer editor's shared helpers", () => {
  it("reads a posted form or a query; a repeated name is a list; Next's own fields go", () => {
    const form = new FormData();
    form.append("$ACTION_ID_abc", "");
    form.append("qid", "Q1");
    form.append("pools.active", "off");
    form.append("pools.active", "on");
    expect(formRecord(form)).toEqual({
      qid: "Q1",
      "pools.active": ["off", "on"],
    });
    expect(
      formRecord({ qid: "Q1", caps: ["1", "2"], note: undefined }),
    ).toEqual({ qid: "Q1", caps: ["1", "2"] });
  });

  it("names clubs by Wikidata id and slug, and lists the governorates by name", async () => {
    const pool = {
      clubs: [
        { id: "esperance", wikidataId: "Q2", nameLatin: "Espérance" },
        { id: "africain", wikidataId: "Q1", nameLatin: "Club Africain" },
      ],
    } as unknown as Pool;
    const data: DataSource = {
      read: async () =>
        JSON.stringify([
          { id: "tunis", nameLatin: "Tunis" },
          { id: "ariana", nameLatin: "Ariana" },
        ]),
      publicFileExists: async () => false,
    };
    const names = await editorNames(pool, data);
    expect(names.club("Q2")).toBe("Espérance");
    expect(names.clubQid("africain")).toBe("Q1");
    expect(names.governorate("tunis")).toBe("Tunis");
    expect(names.clubs).toEqual([
      ["Q1", "Club Africain"],
      ["Q2", "Espérance"],
    ]);
    expect(names.governorates.map((g) => g.id)).toEqual(["ariana", "tunis"]);
  });

  // Task 3 review, M3: an empty select would quietly pick "none", and a
  // later save would commit governorate: X → none. Say so, and save nothing.
  it("names a governorates file it cannot read, and a club it cannot map, as problems", async () => {
    const pool = {
      clubs: [{ id: "africain", wikidataId: "Q1", nameLatin: "Club Africain" }],
    } as unknown as Pool;
    const broken = (read: DataSource["read"]): DataSource => ({
      read,
      publicFileExists: async () => false,
    });
    for (const [data, problem] of [
      [
        broken(async () => "{ not json"),
        "data/curated/governorates.json could not be read",
      ],
      [
        broken(async () => undefined),
        "data/curated/governorates.json could not be read",
      ],
      [broken(async () => "[]"), "data/curated/governorates.json lists none"],
      [
        broken(async () => {
          throw new Error("EACCES");
        }),
        "data/curated/governorates.json could not be read",
      ],
    ] as const) {
      const names = await editorNames(pool, data);
      expect(names.governorates).toEqual([]);
      expect(editorProblems(names, null)).toEqual([problem]);
    }
    const good = await editorNames(
      pool,
      broken(async () => JSON.stringify([{ id: "tunis", nameLatin: "Tunis" }])),
    );
    expect(editorProblems(good, null)).toEqual([]);
    const at = (clubId: string | null, governorate: string | null = null) =>
      ({ clubId, governorate }) as never;
    expect(editorProblems(good, at("africain", "tunis"))).toEqual([]);
    expect(editorProblems(good, at(null))).toEqual([]);
    expect(editorProblems(good, at("somewhere-else"))).toEqual([
      'his club "somewhere-else" is not among the pool\'s clubs',
    ]);
    expect(editorProblems(good, at("africain", "atlantis"))).toEqual([
      'his governorate "atlantis" is not in data/curated/governorates.json',
    ]);
  });

  it("turns a save's refusal into a code the page explains", () => {
    const cases: [string, string][] = [
      ["edits are off here: no GitHub token on this deployment", "off"],
      ["nothing to save: no value changed", "unchanged"],
      [
        "main changed twice while saving; nothing was saved, try again",
        "conflict",
      ],
      ["GitHub readFile: 502", "github"],
      ["note: required when a value changes", "note"],
      ["players.Q1: excluded and overridden at once", "refused"],
    ];
    for (const [error, code] of cases) {
      expect(saveErrorCode([error])).toBe(code);
      expect(SAVE_ERRORS[code]).toMatch(/^Not saved: /);
    }
    expect(SAVE_ERRORS.lists).toMatch(/^Not saved: /);
  });
});
