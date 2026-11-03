import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyOverridePatch, parseOverrideForm } from "./overrides-patch.ts";
import { commitMessage } from "./message.ts";
import { EditRefused } from "./validate.ts";

const text = readFileSync("data/overrides.json", "utf8");
const today = "2026-11-03";

describe("an override patch", () => {
  it("sets a field with by jalel, today and the note, and touches nothing else", async () => {
    const out = await applyOverridePatch(
      text,
      {
        qid: "Q2409513",
        changes: [{ field: "caps", to: 102 }],
        note: "FTF page",
      },
      today,
    );
    const players = (
      out.json as { players: Record<string, Record<string, unknown>> }
    ).players;
    expect(players.Q2409513.caps).toEqual({
      value: 102,
      by: "jalel",
      at: today,
      note: "FTF page",
    });
    expect(players.Q2409513.governorate).toEqual(
      JSON.parse(text).players.Q2409513.governorate,
    );
    expect(out.diff).toEqual([
      { path: "players.Q2409513.caps", before: "none", after: "102" },
    ]);
    expect(out.changed).toBe(true);
    // Only the new lines differ: the rest of the file keeps its layout.
    const added = out.text
      .split("\n")
      .filter((l) => !text.split("\n").includes(l));
    expect(added.length).toBeLessThanOrEqual(7);
  });
  it("removes a field, and the footballer when it was his last", async () => {
    const out = await applyOverridePatch(
      text,
      {
        qid: "Q2409513",
        changes: [{ field: "governorate", remove: true }],
        note: "",
      },
      today,
    );
    expect((out.json as { players: object }).players).not.toHaveProperty(
      "Q2409513",
    );
    expect(out.diff).toEqual([
      { path: "players.Q2409513.governorate", before: "tunis", after: "none" },
    ]);
  });
  it("exclude replaces the whole entry; the diff lists what goes", async () => {
    const out = await applyOverridePatch(
      text,
      {
        qid: "Q58815643",
        changes: [{ field: "exclude", to: true }],
        note: "not Tunisian",
      },
      today,
    );
    expect(
      Object.keys(
        (out.json as { players: Record<string, object> }).players.Q58815643,
      ),
    ).toEqual(["exclude"]);
    expect(
      out.diff.some(
        (d) =>
          d.path === "players.Q58815643.club" && d.after === "none (excluded)",
      ),
    ).toBe(true);
    expect(out.diff).toContainEqual({
      path: "players.Q58815643.exclude",
      before: "none",
      after: "yes",
    });
  });
  it("no change is no commit", async () => {
    const same = JSON.parse(text).players.Q2409513.governorate.value;
    const out = await applyOverridePatch(
      text,
      {
        qid: "Q2409513",
        changes: [{ field: "governorate", to: same }],
        note: "",
      },
      today,
    );
    expect(out.changed).toBe(false);
    expect(out.text).toBe(text);
  });
  it("a new footballer goes last, with the note", async () => {
    const out = await applyOverridePatch(
      text,
      {
        qid: "Q42",
        changes: [{ field: "localStar", to: true }],
        note: "everyone knows him",
      },
      today,
    );
    const players = (out.json as { players: Record<string, unknown> }).players;
    expect(Object.keys(players).at(-1)).toBe("Q42");
    expect(out.text).toContain(
      '"Q42": {\n      "localStar": {\n        "value": true,\n        "by": "jalel",\n        "at": "2026-11-03",\n        "note": "everyone knows him"\n      }\n    }',
    );
  });
  it("a changed value needs a note", async () => {
    await expect(
      applyOverridePatch(
        text,
        { qid: "Q2409513", changes: [{ field: "caps", to: 102 }], note: " " },
        today,
      ),
    ).rejects.toEqual(new EditRefused(["note: required when a value changes"]));
  });
  it("shows a club with its pool name", async () => {
    const out = await applyOverridePatch(
      text,
      {
        qid: "Q724024",
        changes: [{ field: "club", to: "Q166724" }],
        note: "x",
      },
      today,
      { clubName: (q) => (q === "Q166724" ? "Al Ahly Benghazi" : undefined) },
    );
    expect(out.diff).toEqual([
      {
        path: "players.Q724024.club",
        before: "none",
        after: "Q166724 (Al Ahly Benghazi)",
      },
    ]);
  });
  it("reads the form: none, aliases per line, pools, and refuses a bad caps", () => {
    expect(
      parseOverrideForm({
        qid: "Q1",
        club: "none",
        aliases: "Msakni\nYoussef M.\n",
        "pools.active": "on",
        note: "x",
      }).patch?.changes,
    ).toEqual([
      { field: "club", to: null },
      { field: "aliases", to: ["Msakni", "Youssef M."] },
      { field: "pools", to: { active: true, legend: false } },
    ]);
    expect(
      parseOverrideForm({ qid: "Q1", caps: "-3", note: "" }).errors,
    ).toEqual(["caps: a whole number, 0 or more"]);
  });
  it("reads the form: remove boxes, numbers, dates, checkboxes, the note", () => {
    const { patch, errors } = parseOverrideForm({
      qid: "Q2409513",
      "remove.governorate": "on",
      governorate: "tunis",
      caps: "102",
      capsAsOf: "2026-11-01",
      birthCountry: "tn",
      localStar: "on",
      note: " FTF page ",
    });
    expect(errors).toEqual([]);
    expect(patch).toEqual({
      qid: "Q2409513",
      changes: [
        { field: "caps", to: 102 },
        { field: "capsAsOf", to: "2026-11-01" },
        { field: "governorate", remove: true },
        { field: "birthCountry", to: "TN" },
        { field: "localStar", to: true },
      ],
      note: "FTF page",
    });
  });
  it("refuses what the overrides file would refuse, by field", () => {
    expect(
      parseOverrideForm({
        qid: "Messi",
        club: "Club Africain",
        position: "striker",
        birthDate: "1 May 1990",
        nameArabic: "Msakni",
        birthCountry: "TUN",
      }).errors,
    ).toEqual([
      "qid: a Wikidata id (Q and digits)",
      "club: a club's Wikidata id, or none",
      "position: goalkeeper, defender, midfielder or forward",
      "birthDate: a date, YYYY-MM-DD",
      "birthCountry: two letters",
      "nameArabic: in Arabic letters",
    ]);
  });
  it("writes a short conventional subject with a trailer", () => {
    const m = commitMessage({
      file: "overrides",
      subject: "Q2409513 Youssef Msakni: caps 102",
      lines: [{ path: "players.Q2409513.caps", before: "none", after: "102" }],
      note: "FTF page",
    });
    expect(m.split("\n")[0]).toBe(
      "data(overrides): Q2409513 Youssef Msakni: caps 102",
    );
    expect(m).toMatch(/\n\nAdmin-Edit: overrides$/);
  });
});
