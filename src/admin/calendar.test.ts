import { describe, expect, it } from "vitest";
import { CALENDAR_ERRORS, calendarErrorMessage } from "./calendar";

describe("the calendar page's error message", () => {
  it("maps a known code to its message", () => {
    expect(calendarErrorMessage("frozen")).toBe(CALENDAR_ERRORS.frozen);
    expect(calendarErrorMessage("failed")).toBe(
      "The change failed; nothing was written.",
    );
  });

  // Review 2a: ?error=__proto__ made the page fail.
  it("ignores inherited keys and anything unknown", () => {
    for (const code of [
      "__proto__",
      "constructor",
      "toString",
      "hasOwnProperty",
      "nope",
      undefined,
      ["frozen"],
    ])
      expect(calendarErrorMessage(code)).toBeNull();
  });
});
