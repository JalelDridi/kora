import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { curatedEdit } from "./curated-patch.ts";
import { commitMessage, diffFromMessage } from "./message.ts";

it("lists each change, the note, then the trailer", () => {
  expect(
    commitMessage({
      file: "club-short",
      subject: "es-zarzis ESZ / زرزيس",
      lines: [
        { path: "es-zarzis", before: "ESZ / الزرزيس", after: "ESZ / زرزيس" },
      ],
      note: "the fans' spelling",
    }),
  ).toBe(
    "data(club-short): es-zarzis ESZ / زرزيس\n\n- es-zarzis: ESZ / الزرزيس → ESZ / زرزيس\n\nthe fans' spelling\n\nAdmin-Edit: club-short",
  );
});

it("cuts a long subject at 72 characters with an ellipsis", () => {
  const first = commitMessage({
    file: "overrides",
    subject:
      "Q58815643 Firas Chaouat: club, caps, capsAsOf, goals, aliases, nameArabic",
    lines: [],
    note: "",
  }).split("\n")[0];
  expect([...first]).toHaveLength(72);
  expect(first.endsWith("…")).toBe(true);
  expect(first.startsWith("data(overrides): Q58815643 Firas Chaouat")).toBe(
    true,
  );
});

it("an undo names the commit it reverts, without a note", () => {
  const m = commitMessage({
    file: "overrides",
    subject: "data(overrides): Q2409513 Youssef Msakni: caps 102",
    lines: [{ path: "players.Q2409513.caps", before: "102", after: "none" }],
    note: "",
    reverts: "abc1234",
  });
  expect(m.split("\n")[0]).toBe(
    "revert(data): data(overrides): Q2409513 Youssef Msakni: caps 102",
  );
  expect(m).toMatch(/→ none\n\nAdmin-Edit: overrides\nReverts: abc1234$/);
});

it("reads the change lines back from a dashboard commit's message", () => {
  const lines = [
    { path: "players.Q1.caps", before: "0", after: "1" },
    { path: "players.Q1.club", before: "none", after: "Q2 (Club Africain)" },
  ];
  expect(
    diffFromMessage(
      commitMessage({
        file: "overrides",
        subject: "Q1: caps",
        lines,
        note: "- a note: x → y",
      }),
    ),
  ).toEqual(lines);
  expect(diffFromMessage("fix: something\n\nbody")).toEqual([]);
});

it("reads back a ligue1-clubs line, whose path has spaces", async () => {
  const edit = await curatedEdit({
    id: "ligue1-clubs",
    form: {
      op: "set",
      key: "Stade Tunisien",
      title: "Stade Tunisien (football)",
      note: "the article moved",
    },
    text: readFileSync("data/curated/ligue1-clubs.json", "utf8"),
    today: "2026-11-03",
  });
  if (!edit.ok) throw new Error(edit.errors.join("; "));
  const lines = diffFromMessage(edit.applied.message);
  expect(lines).toEqual(edit.applied.diff);
  expect(lines.some((l) => l.path.includes(" "))).toBe(true);
});
