import { expect, it } from "vitest";
import { commitMessage } from "./message.ts";

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
