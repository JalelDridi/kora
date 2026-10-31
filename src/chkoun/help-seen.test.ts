import { describe, expect, it } from "vitest";
import {
  HELP_KEY,
  helpSeen,
  markHelpSeen,
  shouldOpenHelp,
} from "./help-seen.ts";

const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};
const refusing = {
  getItem: () => {
    throw new Error("denied");
  },
  setItem: () => {
    throw new Error("denied");
  },
};

describe("the first-visit help", () => {
  it("opens once per game, then never again on this device", () => {
    const s = memory();
    expect(
      shouldOpenHelp({ storage: s, game: "chkoun", inProgress: false }),
    ).toBe(true);
    markHelpSeen(s, "chkoun");
    expect(helpSeen(s, "chkoun")).toBe(true);
    expect(helpSeen(s, "season")).toBe(false);
    expect(JSON.parse(s.getItem(HELP_KEY)!)).toEqual({ chkoun: 1 });
  });
  it("does not open over a game already under way", () =>
    expect(
      shouldOpenHelp({ storage: memory(), game: "chkoun", inProgress: true }),
    ).toBe(false));
  it("with storage refused (in-app browsers) it opens at most once per page view", () => {
    expect(
      shouldOpenHelp({ storage: refusing, game: "season", inProgress: false }),
    ).toBe(true);
    markHelpSeen(refusing, "season");
    expect(
      shouldOpenHelp({ storage: refusing, game: "season", inProgress: false }),
    ).toBe(false);
  });
});
