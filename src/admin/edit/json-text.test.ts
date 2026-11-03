import { readFileSync } from "node:fs";
import { format } from "prettier";
import { expect, it } from "vitest";
import { layoutOf, writeJson } from "./json-text.ts";

const FILES = [
  "data/overrides.json",
  ...[
    "ligue1-strength",
    "club-short",
    "honours",
    "afcon-2004",
    "ligue1-clubs",
    "governorates",
  ].map((f) => `data/curated/${f}.json`),
];
for (const file of FILES)
  it(`${file}: parse then write gives the file back, as Prettier leaves it`, async () => {
    const text = readFileSync(file, "utf8");
    expect(await writeJson(JSON.parse(text), layoutOf(text))).toBe(text);
    expect(await format(text, { parser: "json" })).toBe(text);
  });

it("a new club-short row takes its siblings' layout (the committed rows are open)", async () => {
  const text = readFileSync("data/curated/club-short.json", "utf8");
  const json = JSON.parse(text);
  json.clubs["new-club"] = { latin: "NEW", arabic: "الجديد" };
  expect(await writeJson(json, layoutOf(text))).toContain(
    '    "new-club": {\n      "latin": "NEW",\n      "arabic": "الجديد"\n    }\n',
  );
});

it("a new row among one-line siblings is one line too", async () => {
  const text = '{\n  "a": { "x": 1 },\n  "b": { "x": 2 }\n}\n';
  const json = JSON.parse(text);
  json.c = { x: 3 };
  expect(await writeJson(json, layoutOf(text))).toBe(
    '{\n  "a": { "x": 1 },\n  "b": { "x": 2 },\n  "c": { "x": 3 }\n}\n',
  );
});

it("a new footballer's fields take the layout of another footballer's fields", async () => {
  const text =
    '{\n  "players": {\n    "Q1": { "caps": { "value": 1, "by": "jalel", "at": "2026-11-03" } }\n  },\n  "clubTitles": {}\n}\n';
  const json = JSON.parse(text);
  json.players.Q2 = { goals: { value: 2, by: "jalel", at: "2026-11-03" } };
  expect(await writeJson(json, layoutOf(text))).toContain(
    '"Q2": { "goals": { "value": 2, "by": "jalel", "at": "2026-11-03" } }',
  );
});

it("Prettier still has the last word: a one-line object too long breaks", async () => {
  const text = '{ "by": "jalel", "at": null, "footballers": [] }\n';
  const json = JSON.parse(text);
  json.footballers = Array.from({ length: 12 }, (_, i) => `Q10000${i}`);
  const out = await writeJson(json, layoutOf(text));
  expect(await format(out, { parser: "json" })).toBe(out);
  expect(out.split("\n").length).toBeGreaterThan(3);
});
