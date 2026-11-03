import { describe, expect, it } from "vitest";
import type { DataSource } from "../pipeline/check.ts";
import type { Pool } from "../pipeline/types.ts";
import { editorNames, formRecord } from "./footballer-page.ts";

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
});
