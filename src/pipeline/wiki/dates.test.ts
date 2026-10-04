import { describe, expect, it } from "vitest";
import { parseEnDate, parseFrDate } from "./dates.ts";

describe("parseEnDate", () => {
  it("reads the forms English infoboxes use", () => {
    // Recorded: en/ali-maaloul line 30, en/ellyes-skhiri line 44, en/ferjani-sassi line 47.
    expect(parseEnDate("4 September 2026")).toBe("2026-09-04");
    expect(parseEnDate("17:30, 19 September 2026 (UTC)")).toBe("2026-09-19");
    expect(parseEnDate("21:56, 3 January 2026 (UTC)")).toBe("2026-01-03");
    // Hand-made: forms from the research, not in the recorded eight.
    expect(parseEnDate("September 9, 2026")).toBe("2026-09-09");
    expect(parseEnDate("{{date|2026-09-19}}")).toBe("2026-09-19");
    expect(parseEnDate("{{Start date|2026|9|19}}")).toBe("2026-09-19");
    expect(parseEnDate("")).toBeNull();
    expect(parseEnDate("soon")).toBeNull();
  });
});

describe("parseFrDate", () => {
  // Trap: the update date comes in several formats (Task 1).
  it("reads every form recorded on French infoboxes", () => {
    expect(parseFrDate("{{date|25 juillet 2026}}")).toBe("2026-07-25"); // fr/ali-maaloul line 27
    expect(parseFrDate("{{date|19/09/2026}}")).toBe("2026-09-19"); // fr/ellyes-skhiri line 31
    expect(parseFrDate("{{date|01/07/2025}}")).toBe("2025-07-01"); // fr/wahbi-khazri line 38: day first
    expect(parseFrDate("6 septembre 2026")).toBe("2026-09-06"); // fr/hannibal-mejbri line 35: no template
  });
  // Hand-made: forms from the research, not in the recorded eight.
  it("reads {{date|28|09|2026}} and {{date-|1|octobre|2026}}", () => {
    expect(parseFrDate("{{date|28|09|2026}}")).toBe("2026-09-28");
    expect(parseFrDate("{{date-|1|octobre|2026}}")).toBe("2026-10-01");
  });
  it("reads plain text, accents or not, and 1er", () => {
    expect(parseFrDate("19 septembre 2026")).toBe("2026-09-19");
    expect(parseFrDate("1er aout 2026")).toBe("2026-08-01");
    expect(parseFrDate("3 février 2025")).toBe("2025-02-03");
  });
  it("returns null for anything else", () => {
    expect(parseFrDate("")).toBeNull();
    expect(parseFrDate("32/13/2026")).toBeNull();
  });
});
