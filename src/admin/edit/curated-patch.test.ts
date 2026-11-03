import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  validateAfcon,
  validateClubShort,
  validateGovernorates,
  validateHonours,
  validateLigue1Clubs,
  validateStrength,
} from "../../pipeline/check.ts";
import type { Pool } from "../../pipeline/types.ts";
import {
  applyCurated,
  CURATED,
  curatedEdit,
  readCuratedForm,
  setFileNote,
} from "./curated-patch.ts";
import type { CuratedId, Row } from "./curated-patch.ts";
import { EditRefused } from "./validate.ts";

const today = "2026-11-03";
const pool = JSON.parse(readFileSync("data/pool.json", "utf8")) as Pool;
const clubIds = pool.clubs.map((c) => c.id);
const ligue1 = pool.clubs.filter((c) => c.ligue1).map((c) => c.id);
const committed = (id: CuratedId): unknown =>
  JSON.parse(readFileSync(CURATED[id].path, "utf8"));
const apply = (
  id: CuratedId,
  json: unknown,
  kind: "set" | "add" | "remove",
  key: string,
  row?: Row,
) => CURATED[id].apply(json, { kind, key, row }, today);

describe("ligue1-strength", () => {
  const valid = (json: unknown) => validateStrength(json, ligue1);
  it("set, remove and add again, stamped on the file, the note kept", () => {
    const file = committed("ligue1-strength") as { note: string };
    const set = apply("ligue1-strength", file, "set", "club-africain", {
      id: "club-africain",
      strength: 79,
    }) as {
      by: string;
      at: string;
      note: string;
      clubs: Record<string, number>;
    };
    expect(set.clubs["club-africain"]).toBe(79);
    expect([set.by, set.at, set.note]).toEqual(["jalel", today, file.note]);
    expect(valid(set)).toEqual([]);
    const removed = apply("ligue1-strength", set, "remove", "club-africain");
    expect(valid(removed)).toEqual([
      "ligue1-strength.json: no strength for club-africain",
    ]);
    const added = apply("ligue1-strength", removed, "add", "club-africain", {
      id: "club-africain",
      strength: 77,
    });
    expect(valid(added)).toEqual([]);
  });
  it("refuses a strength of 91", () => {
    const json = apply(
      "ligue1-strength",
      committed("ligue1-strength"),
      "set",
      "club-africain",
      {
        id: "club-africain",
        strength: 91,
      },
    );
    expect(valid(json)).toEqual([
      "ligue1-strength.json: club-africain: strength must be a whole number from 55 to 90, not 91",
    ]);
  });
  it("leaves the committed file as it was", () => {
    const file = committed("ligue1-strength");
    const copy = structuredClone(file);
    apply("ligue1-strength", file, "set", "club-africain", {
      id: "club-africain",
      strength: 60,
    });
    expect(file).toEqual(copy);
  });
});

describe("club-short", () => {
  const valid = (json: unknown) => validateClubShort(json, clubIds, ligue1);
  const unlisted = clubIds.find(
    (id) =>
      !(
        (committed("club-short") as { clubs: object }).clubs as object
      ).hasOwnProperty(id),
  )!;
  it("set, add and remove; by jalel; the DRAFT note stays until Jalel edits it (Open 9)", () => {
    const set = apply(
      "club-short",
      committed("club-short"),
      "set",
      "es-zarzis",
      {
        id: "es-zarzis",
        latin: "ESZ",
        arabic: "زرزيس",
      },
    ) as { by: string; note: string; clubs: Record<string, unknown> };
    expect(set.clubs["es-zarzis"]).toEqual({ latin: "ESZ", arabic: "زرزيس" });
    expect(set.by).toBe("jalel");
    expect(set.note).toContain("DRAFT");
    expect(valid(set)).toEqual([]);
    const added = apply("club-short", set, "add", unlisted, {
      id: unlisted,
      latin: "NEW",
      arabic: "جديد",
    });
    expect(valid(added)).toEqual([]);
    const removed = apply("club-short", added, "remove", "nashville-sc");
    expect(valid(removed)).toEqual([]);
    expect((removed as { clubs: object }).clubs).not.toHaveProperty(
      "nashville-sc",
    );
    const noted = setFileNote(
      "club-short",
      removed,
      "Jalel's labels",
      today,
    ) as {
      note: string;
    };
    expect(noted.note).toBe("Jalel's labels");
  });
  it("refuses a short label of three words", () => {
    const json = apply(
      "club-short",
      committed("club-short"),
      "set",
      "es-zarzis",
      {
        id: "es-zarzis",
        latin: "ES de Zarzis",
        arabic: "زرزيس",
      },
    );
    expect(valid(json)).toEqual([
      "club-short.json: es-zarzis latin has more than two words",
    ]);
  });
});

describe("afcon-2004", () => {
  it("add, set and remove, stamped on the file", () => {
    const added = apply("afcon-2004", committed("afcon-2004"), "add", "Q1", {
      id: "Q1",
    }) as {
      by: string;
      at: string;
      footballers: string[];
    };
    expect(added).toEqual({ by: "jalel", at: today, footballers: ["Q1"] });
    expect(validateAfcon(added)).toEqual([]);
    const set = apply("afcon-2004", added, "set", "Q1", { id: "Q2" });
    expect(set).toMatchObject({ footballers: ["Q2"] });
    expect(validateAfcon(set)).toEqual([]);
    const removed = apply("afcon-2004", set, "remove", "Q2");
    expect(removed).toMatchObject({ footballers: [] });
    expect(validateAfcon(removed)).toEqual([]);
  });
  it("refuses a 24th footballer", () => {
    let json = committed("afcon-2004");
    for (let i = 1; i <= 24; i++)
      json = apply("afcon-2004", json, "add", `Q${i}`, { id: `Q${i}` });
    expect(validateAfcon(json)).toEqual([
      "afcon-2004.json: at most 23 footballers, not 24",
    ]);
  });
});

describe("ligue1-clubs", () => {
  it("set, add and remove; no stamp", () => {
    const set = apply(
      "ligue1-clubs",
      committed("ligue1-clubs"),
      "set",
      "CA Bizertin",
      {
        title: "CA Bizertin (football)",
      },
    ) as { clubs: string[] };
    expect(set.clubs[2]).toBe("CA Bizertin (football)");
    expect(set).not.toHaveProperty("by");
    expect(validateLigue1Clubs(set)).toEqual([]);
    const added = apply("ligue1-clubs", set, "add", "AS Soliman", {
      title: "AS Soliman",
    });
    expect(validateLigue1Clubs(added)).toEqual([]);
    const removed = apply("ligue1-clubs", added, "remove", "AS Marsa") as {
      clubs: string[];
    };
    expect(removed.clubs).not.toContain("AS Marsa");
    expect(validateLigue1Clubs(removed)).toEqual([]);
  });
  it("refuses a 21st Ligue 1 club", () => {
    let json = committed("ligue1-clubs");
    for (let i = 17; i <= 21; i++)
      json = apply("ligue1-clubs", json, "add", `Club ${i}`, {
        title: `Club ${i}`,
      });
    expect(validateLigue1Clubs(json)).toEqual([
      "ligue1-clubs.json: must be { season, clubs: [up to 20 English titles] }",
    ]);
  });
});

describe("governorates", () => {
  const tunis = (committed("governorates") as Row[])[0];
  it("set a name; remove and add back; no stamp", () => {
    const set = apply(
      "governorates",
      committed("governorates"),
      "set",
      "tunis",
      {
        ...tunis,
        nameFrench: "Tunis (ville)",
      },
    ) as Row[];
    expect(set[0]).toEqual({ ...tunis, nameFrench: "Tunis (ville)" });
    expect(validateGovernorates(set)).toEqual([]);
    const removed = apply("governorates", set, "remove", "tunis");
    expect(validateGovernorates(removed)).toEqual([
      "governorates.json: must list the 24 governorates",
    ]);
    const added = apply("governorates", removed, "add", "tunis", tunis);
    expect(validateGovernorates(added)).toEqual([]);
  });
  it("refuses a 25th governorate", () => {
    const json = apply(
      "governorates",
      committed("governorates"),
      "add",
      "carthage",
      {
        ...tunis,
        id: "carthage",
      },
    );
    expect(validateGovernorates(json)).toEqual([
      "governorates.json: must list the 24 governorates",
    ]);
  });
});

describe("honours", () => {
  const cup = {
    competition: "tn_cup",
    seasonStart: 2018,
    seasonEnd: 2019,
    clubWikidataId: "Q1024482",
  };
  it("add, set and remove; each row stamped", () => {
    const added = apply(
      "honours",
      committed("honours"),
      "add",
      "tn_cup|2018|2019",
      cup,
    ) as Row[];
    expect(added).toEqual([{ ...cup, by: "jalel", at: today }]);
    expect(validateHonours(added)).toEqual([]);
    const set = apply("honours", added, "set", "tn_cup|2018|2019", {
      ...cup,
      clubWikidataId: "Q44897",
    });
    expect(set).toEqual([
      { ...cup, clubWikidataId: "Q44897", by: "jalel", at: today },
    ]);
    expect(validateHonours(set)).toEqual([]);
    const removed = apply("honours", set, "remove", "tn_cup|2018|2019");
    expect(removed).toEqual([]);
    expect(validateHonours(removed)).toEqual([]);
  });
  it("refuses an edition twice", () => {
    const once = apply(
      "honours",
      committed("honours"),
      "add",
      "tn_cup|2018|2019",
      cup,
    );
    expect(() =>
      apply("honours", once, "add", "tn_cup|2018|2019", cup),
    ).toThrow(new EditRefused(["tn_cup|2018|2019 is already there"]));
    // A set that moves a row onto another edition is refused the same way.
    const twice = apply("honours", once, "add", "tn_cup|2019|2020", {
      ...cup,
      seasonStart: 2019,
      seasonEnd: 2020,
    });
    expect(() =>
      apply("honours", twice, "set", "tn_cup|2019|2020", cup),
    ).toThrow(EditRefused);
  });
});

describe("every file", () => {
  it("names its rows and refuses a row that is not there, or already is", () => {
    for (const id of Object.keys(CURATED) as CuratedId[]) {
      const file = CURATED[id];
      expect(file.path).toBe(`data/curated/${id}.json`);
      const json = committed(id);
      const rows = file.rows(json);
      expect(() => apply(id, json, "remove", "nowhere")).toThrow(
        new EditRefused(["nowhere is not there"]),
      );
      if (rows.length > 0)
        expect(() =>
          apply(id, json, "add", file.key(rows[0]), rows[0]),
        ).toThrow(EditRefused);
    }
  });
  it("gives the text in the file's own layout, a diff, and no change for a same value", async () => {
    const text = readFileSync("data/curated/ligue1-strength.json", "utf8");
    const out = await applyCurated(
      "ligue1-strength",
      text,
      {
        kind: "set",
        key: "club-africain",
        row: { id: "club-africain", strength: 79 },
      },
      today,
    );
    expect(out.diff).toEqual([
      { path: "club-africain", before: "77", after: "79" },
    ]);
    expect(out.text).toBe(
      text
        .replace('"by": "claude"', '"by": "jalel"')
        .replace('"at": "2026-10-07"', `"at": "${today}"`)
        .replace('"club-africain": 77', '"club-africain": 79'),
    );
    const same = await applyCurated(
      "ligue1-strength",
      text,
      {
        kind: "set",
        key: "club-africain",
        row: { id: "club-africain", strength: 77 },
      },
      today,
    );
    expect(same).toMatchObject({ changed: false, text, diff: [] });
  });
});

describe("the settings pages' forms (Task 6)", () => {
  const text = (id: CuratedId) => readFileSync(CURATED[id].path, "utf8");
  const edit = (id: CuratedId, form: Record<string, string>) =>
    curatedEdit({ id, form, text: text(id), today });

  it("reads a row's fields, whole numbers as numbers, the strings trimmed", () => {
    expect(
      readCuratedForm("ligue1-strength", {
        op: "set",
        key: "club-africain",
        id: "club-africain",
        strength: " 79 ",
        note: " FTF table ",
      }),
    ).toEqual({
      ok: true,
      note: "FTF table",
      change: {
        kind: "row",
        op: {
          kind: "set",
          key: "club-africain",
          row: { id: "club-africain", strength: 79 },
        },
      },
    });
    expect(
      readCuratedForm("honours", {
        op: "add",
        competition: "tn_cup",
        seasonStart: "2024",
        seasonEnd: "2025",
        clubWikidataId: "Q1",
        note: "x",
      }),
    ).toMatchObject({
      ok: true,
      change: {
        op: {
          kind: "add",
          key: "tn_cup|2024|2025",
          row: {
            competition: "tn_cup",
            seasonStart: 2024,
            seasonEnd: 2025,
            clubWikidataId: "Q1",
          },
        },
      },
    });
  });

  it("refuses a missing note, a number that is not whole, and what a page does not offer", () => {
    const strength = { op: "set", key: "club-africain", id: "club-africain" };
    expect(
      readCuratedForm("ligue1-strength", { ...strength, strength: "79" }),
    ).toEqual({ ok: false, errors: ["note: required"] });
    expect(
      readCuratedForm("ligue1-strength", {
        ...strength,
        strength: "7.5",
        note: "x",
      }),
    ).toEqual({ ok: false, errors: ["strength: a whole number"] });
    expect(
      readCuratedForm("governorates", {
        op: "remove",
        key: "tunis",
        note: "x",
      }),
    ).toEqual({
      ok: false,
      errors: ["governorates: rows are edited, never removed"],
    });
    expect(
      readCuratedForm("ligue1-strength", {
        op: "add",
        id: "x",
        strength: "60",
        note: "x",
      }),
    ).toEqual({
      ok: false,
      errors: ["ligue1-strength: rows are edited, never added"],
    });
    expect(
      readCuratedForm("honours", {
        op: "header",
        field: "note",
        value: "x",
        note: "x",
      }),
    ).toEqual({ ok: false, errors: ["honours: no note to edit"] });
    expect(readCuratedForm("honours", { op: "nope", note: "x" })).toEqual({
      ok: false,
      errors: ["op: set, add, remove or header"],
    });
  });

  it("refuses a new key on a file whose rows are never added (branch review, I3)", () => {
    const tunis = {
      op: "set",
      key: "tunis",
      nameLatin: "Tunis",
      nameArabic: "تونس",
      nameFrench: "Tunis",
      region: "north-east",
      note: "x",
    };
    expect(
      readCuratedForm("governorates", { ...tunis, id: "tunis-x" }),
    ).toEqual({
      ok: false,
      errors: ["id: cannot change on this file"],
    });
    expect(
      readCuratedForm("governorates", { ...tunis, id: "tunis" }),
    ).toMatchObject({
      ok: true,
    });
    expect(
      readCuratedForm("ligue1-strength", {
        op: "set",
        key: "club-africain",
        id: "club-africaine",
        strength: "79",
        note: "x",
      }),
    ).toEqual({ ok: false, errors: ["id: cannot change on this file"] });
  });

  it("refuses a header value on two lines and a file note over 500 characters (T6 M4)", () => {
    const header = { op: "header", note: "x" };
    expect(
      readCuratedForm("ligue1-strength", {
        ...header,
        field: "note",
        value: "one\ntwo",
      }),
    ).toEqual({ ok: false, errors: ["note: one line"] });
    expect(
      readCuratedForm("ligue1-clubs", {
        ...header,
        field: "season",
        value: "2025\r26",
      }),
    ).toEqual({ ok: false, errors: ["season: one line"] });
    expect(
      readCuratedForm("ligue1-strength", {
        ...header,
        field: "note",
        value: "a".repeat(501),
      }),
    ).toEqual({ ok: false, errors: ["note: at most 500 characters"] });
    expect(
      readCuratedForm("ligue1-strength", {
        ...header,
        field: "note",
        value: "a".repeat(500),
      }),
    ).toMatchObject({ ok: true });
  });

  it("commits one row with the subjects the plan names", async () => {
    const strength = await edit("ligue1-strength", {
      op: "set",
      key: "club-africain",
      id: "club-africain",
      strength: "79",
      note: "FTF table",
    });
    expect(strength.ok && strength.applied.message.split("\n")[0]).toBe(
      "data(ligue1-strength): club-africain 77 → 79",
    );
    const short = await edit("club-short", {
      op: "set",
      key: "es-zarzis",
      id: "es-zarzis",
      latin: "ESZ",
      arabic: "زرزيس",
      note: "Fans write ESZ",
    });
    expect(short.ok && short.applied.message.split("\n")[0]).toBe(
      "data(club-short): es-zarzis ESZ / زرزيس",
    );
    expect(short.ok && short.applied.message).toContain("Fans write ESZ");
    const removed = await edit("ligue1-clubs", {
      op: "remove",
      key: "AS Marsa",
      note: "Relegated",
    });
    expect(removed.ok && removed.applied.message.split("\n")[0]).toBe(
      "data(ligue1-clubs): remove AS Marsa",
    );
    const added = await edit("honours", {
      op: "add",
      competition: "tn_cup",
      seasonStart: "2024",
      seasonEnd: "2025",
      clubWikidataId: "Q1",
      note: "x",
    });
    expect(added.ok && added.applied.message.split("\n")[0]).toBe(
      "data(honours): add tn_cup 2024–2025 Q1",
    );
  });

  it("edits a header: the note stamps the file, the season of ligue1-clubs does not", async () => {
    const note = await edit("club-short", {
      op: "header",
      field: "note",
      value: "Jalel's labels",
      note: "Taken over",
    });
    expect(note.ok).toBe(true);
    if (!note.ok) return;
    expect(note.applied.json).toMatchObject({
      by: "jalel",
      at: today,
      note: "Jalel's labels",
    });
    expect(note.applied.diff).toEqual([
      expect.objectContaining({ path: "note", after: "Jalel's labels" }),
    ]);
    expect(note.applied.message.split("\n")[0]).toBe(
      "data(club-short): note: Jalel's labels",
    );
    const season = await edit("ligue1-clubs", {
      op: "header",
      field: "season",
      value: "2027–28",
      note: "New season",
    });
    expect(season.ok && season.applied.json).toEqual({
      ...(committed("ligue1-clubs") as object),
      season: "2027–28",
    });
    const same = await edit("ligue1-clubs", {
      op: "header",
      field: "season",
      value: "2026–27",
      note: "x",
    });
    expect(same.ok && same.applied.changed).toBe(false);
  });

  it("gives the patch's refusal as errors", async () => {
    expect(
      await edit("afcon-2004", { op: "remove", key: "Q1", note: "x" }),
    ).toEqual({ ok: false, errors: ["Q1 is not there"] });
  });
});
