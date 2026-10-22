import { describe, expect, it } from "vitest";
import { isBoard } from "./board.tsx";

const entry = {
  id: "q1",
  names: { nameLatin: "A", nameArabic: null, nameFrench: null },
  line: "goalkeeper",
};
const row = {
  code: "a_0",
  rank: 1,
  w: 20,
  d: 5,
  l: 5,
  points: 65,
  rating: 80.4,
  squad: [entry],
};

describe("the board's shape check", () => {
  it("accepts the endpoint's answer, on or off", () => {
    expect(isBoard({ status: "on", rows: [row] })).toBe(true);
    expect(isBoard({ status: "off", rows: [] })).toBe(true);
  });

  it("refuses a squad entry without an id or a Latin name", () => {
    const bad = (squad: unknown[]) =>
      isBoard({ status: "on", rows: [{ ...row, squad }] });
    expect(bad([{ ...entry, id: 7 }])).toBe(false);
    expect(bad([{ ...entry, names: null }])).toBe(false);
    expect(bad([{ ...entry, names: { nameLatin: 3 } }])).toBe(false);
    expect(bad([null])).toBe(false);
  });

  it("refuses a row with a missing number or an unknown status", () => {
    expect(isBoard({ status: "on", rows: [{ ...row, rank: "1" }] })).toBe(
      false,
    );
    expect(isBoard({ status: "maybe", rows: [] })).toBe(false);
    expect(isBoard(null)).toBe(false);
  });
});
