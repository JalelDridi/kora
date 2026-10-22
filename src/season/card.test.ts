import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import fr from "../../messages/fr.json";
import { cardLines } from "./card.ts";
import type { SeasonDeps } from "./draft.ts";
import { handlePlay } from "./play.ts";
import { handleReplay } from "./replay.ts";
import type { SeasonView } from "./replay.ts";
import { draftToken, TEST_SEED, testData as data } from "./test-data.ts";

// The squad card (Task 17, Latin-only, T-S3-14): what the image shows,
// as plain strings, so the rules are tested without rendering a PNG.

const deps: SeasonDeps = {
  now: new Date("2026-10-07T10:00:00Z"),
  data,
  kv: null,
  env: "local",
  seed: TEST_SEED,
  secureCookie: false,
};

const ARABIC = /\p{Script=Arabic}/u;
const NON_WESTERN_DIGIT = /[٠-٩۰-۹]/;

let view: SeasonView;
beforeAll(async () => {
  const token = await draftToken(deps, 11);
  const played = await handlePlay(deps, JSON.stringify({ token }), {
    cookie: null,
    ip: null,
  });
  const r = handleReplay(
    { now: deps.now, data },
    { d: "2026-10-07", xi: played.body.code as string },
  );
  view = r.body as SeasonView;
  // Every footballer has an Arabic name too, as most do in the pool.
  view = {
    ...view,
    squad: view.squad.map((c, i) => ({
      ...c,
      names: { ...c.names, nameArabic: `لاعب ${i}` },
    })),
  };
});

const strings = (card: ReturnType<typeof cardLines>) => [
  card.header,
  card.record,
  card.points,
  card.rating,
  ...card.lines.flatMap((l) => [l.label, ...l.names]),
];

describe("the squad card", () => {
  it("Latin names are on their own lines, never mixed with Arabic in one text node", () => {
    const card = cardLines(view);
    expect(card.lines.map((l) => l.names.length)).toEqual([1, 4, 3, 3]);
    expect(card.lines.flatMap((l) => l.names)).toEqual(
      view.squad.map((c) => c.names.nameLatin),
    );
    for (const s of strings(card)) expect(s).not.toMatch(ARABIC);
  });

  it("a Latin name written in Arabic letters falls back to the French name, else is left out", () => {
    const squad = view.squad.map((c, i) => ({
      ...c,
      names: {
        ...c.names,
        nameLatin: i < 2 ? "عبد الله" : c.names.nameLatin,
        nameFrench: i === 0 ? "Abdallah" : null,
      },
    }));
    const card = cardLines({ ...view, squad });
    expect(card.lines[0].names).toEqual(["Abdallah"]);
    expect(card.lines[1].names).toHaveLength(3);
    for (const s of strings(card)) expect(s).not.toMatch(ARABIC);
  });

  it("the lines are in formation order, labelled with the French page's words", () => {
    const card = cardLines(view);
    expect(card.header).toBe(fr.season.share.header);
    expect(card.lines.map((l) => l.label)).toEqual([
      fr.season.lines.goalkeeper,
      fr.season.lines.defender,
      fr.season.lines.midfielder,
      fr.season.lines.forward,
    ]);
  });

  it("digits are Western", () => {
    const card = cardLines(view);
    const { w, d, l, points, rating } = view.season;
    expect(card.record).toBe(`${w}-${d}-${l}`);
    expect(card.points).toBe(`${points} ${fr.season.share.points}`);
    expect(card.rating).toBe(`${fr.season.rating} ${rating.toFixed(1)}`);
    for (const s of strings(card)) expect(s).not.toMatch(NON_WESTERN_DIGIT);
  });

  it("no photo in the card", () => {
    const card = cardLines(view);
    for (const s of strings(card))
      expect(s).not.toMatch(/https?:|\/\/|\.(png|jpe?g|webp|gif|svg)\b/i);
    const route = readFileSync(
      path.join(import.meta.dirname, "../app/api/season/card/route.tsx"),
      "utf8",
    );
    expect(route).not.toMatch(/<img\b|backgroundImage|url\(/);
  });
});
