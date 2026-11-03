import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Pool } from "../../pipeline/types.ts";
import { footballerEdit } from "./footballer.ts";

const text = readFileSync("data/overrides.json", "utf8");
const pool = JSON.parse(readFileSync("data/pool.json", "utf8")) as Pool;
const clubs = new Map(pool.clubs.map((c) => [c.wikidataId, c.nameLatin]));
const qids = new Map(pool.clubs.map((c) => [c.id, c.wikidataId]));
const names = {
  club: (id: string) => clubs.get(id),
  clubQid: (slug: string) => qids.get(slug),
  governorate: (id: string) => id,
};
const today = "2026-11-03";
// A footballer with a club override in force, so the form sends it back.
const someone = pool.players.find((p) => p.pools.active && p.clubId)!;
const entry = JSON.parse(text).players[someone.wikidataId] ?? {};

/** The form as the editor sends it untouched: every field at its value. */
const untouched = (): Record<string, string | string[]> => ({
  qid: someone.wikidataId,
  club: entry.club?.value ?? qids.get(someone.clubId ?? "") ?? "none",
  position: someone.position,
  positionDetail: someone.positionDetail ?? "",
  caps: String(someone.caps),
  goals: String(someone.goals),
  capsAsOf: someone.capsAsOf ?? "",
  birthDate: someone.birthDate,
  governorate: someone.governorate ?? "none",
  birthCountry: someone.birthCountry ?? "",
  nameArabic: someone.nameArabic ?? "",
  aliases: someone.aliases.join("\n"),
  "pools.active": ["off", someone.pools.active ? "on" : ""].filter(Boolean),
  "pools.legend": ["off", someone.pools.legend ? "on" : ""].filter(Boolean),
  note: "",
});

describe("footballerEdit", () => {
  it("an untouched form changes nothing and needs no note", async () => {
    const out = await footballerEdit({
      form: untouched(),
      text,
      player: someone,
      names,
      today,
    });
    expect(out).toMatchObject({ ok: true, applied: { changed: false } });
  });

  it("one changed field: today's value as the before, a subject with the id", async () => {
    const out = await footballerEdit({
      form: { ...untouched(), caps: String(someone.caps + 1), note: "FTF" },
      text,
      player: someone,
      names,
      today,
    });
    if (!out.ok) throw new Error(out.errors.join("; "));
    expect(out.applied.diff).toEqual([
      {
        path: `players.${someone.wikidataId}.caps`,
        before: String(someone.caps),
        after: String(someone.caps + 1),
      },
    ]);
    expect(out.applied.message.split("\n")[0]).toBe(
      `data(overrides): ${someone.wikidataId} ${someone.nameLatin}: caps`,
    );
    expect(out.applied.message).toContain(
      `- players.${someone.wikidataId}.caps: ${someone.caps} → ${someone.caps + 1}`,
    );
  });

  it("says what the form or the patch refuses", async () => {
    expect(
      await footballerEdit({
        form: { qid: someone.wikidataId, nameArabic: "Msakni", note: "x" },
        text,
        player: someone,
        names,
        today,
      }),
    ).toEqual({
      ok: false,
      errors: [
        'nameArabic: invalid value "Msakni", expected in Arabic letters',
      ],
    });
    expect(
      await footballerEdit({
        form: { ...untouched(), goals: "99" },
        text,
        player: someone,
        names,
        today,
      }),
    ).toEqual({ ok: false, errors: ["note: required when a value changes"] });
  });

  it("serves a footballer outside the pool by his id", async () => {
    const out = await footballerEdit({
      form: { qid: "Q1", exclude: "on", note: "not Tunisian" },
      text,
      player: null,
      names,
      today,
    });
    if (!out.ok) throw new Error(out.errors.join("; "));
    expect(out.applied.diff).toEqual([
      { path: "players.Q1.exclude", before: "none", after: "yes" },
    ]);
    expect(out.applied.message.split("\n")[0]).toBe(
      "data(overrides): Q1: exclude",
    );
  });

  it("an include from the add page names him in the subject when the pool cannot", async () => {
    const out = await footballerEdit({
      form: { qid: "Q999001", include: "on", note: "Tunisia squad, 2026" },
      text,
      player: null,
      names,
      today,
      name: "Hamza\nMsakni ",
    });
    if (!out.ok) throw new Error(out.errors.join("; "));
    expect(out.applied.diff).toEqual([
      { path: "players.Q999001.include", before: "none", after: "yes" },
    ]);
    expect(out.applied.message.split("\n")[0]).toBe(
      "data(overrides): Q999001 Hamza Msakni: include",
    );
  });

  it("an exclusion's subject says exclude, while its lines list every override that goes", async () => {
    const qid = "Q58815643";
    const player = pool.players.find((p) => p.wikidataId === qid) ?? null;
    const out = await footballerEdit({
      form: { qid, exclude: "on", note: "test" },
      text,
      player,
      names,
      today,
    });
    if (!out.ok) throw new Error(out.errors.join("; "));
    const gone = Object.keys(JSON.parse(text).players[qid]);
    expect(out.applied.diff.map((d) => d.path)).toEqual([
      ...gone.map((f) => `players.${qid}.${f}`),
      `players.${qid}.exclude`,
    ]);
    expect(out.applied.message.split("\n")[0]).toBe(
      `data(overrides): ${qid} ${player?.nameLatin}: exclude`,
    );
  });
});
