import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanProps, EVENT_NAMES, registerAnalytics, track } from "./events";

afterEach(() => registerAnalytics(null));

describe("game events", () => {
  it("track does nothing without a key (no instance registered)", () => {
    expect(track("chkoun_opened", { n: 3, locale: "fr" })).toBe(false);
  });

  it("event names are chkoun_opened, chkoun_guessed, chkoun_finished, chkoun_shared, chkoun_no_match", () => {
    expect(EVENT_NAMES).toEqual([
      "chkoun_opened",
      "chkoun_guessed",
      "chkoun_finished",
      "chkoun_shared",
      "chkoun_no_match",
    ]);
  });

  it("properties are only n, guesses, solved, channel, locale", () => {
    const capture = vi.fn();
    registerAnalytics({ capture });
    const leaky = {
      n: 12,
      guesses: 4,
      solved: true,
      channel: "copy",
      locale: "ar-TN",
      visitorId: "4b7f6c1e-8b1e-4a3a-9d55-0c6f1d2f9e11",
      footballer: "hannibal-mejbri",
      query: "mejbri",
    } as unknown as Parameters<typeof track>[1];
    expect(track("chkoun_finished", leaky)).toBe(true);
    expect(capture).toHaveBeenCalledWith("chkoun_finished", {
      n: 12,
      guesses: 4,
      solved: true,
      channel: "copy",
      locale: "ar-TN",
    });
  });

  it("drops values of the wrong type or outside the known sets", () => {
    expect(
      cleanProps({
        n: "12",
        guesses: 2.5,
        solved: "yes",
        channel: "facebook",
        locale: "en",
      }),
    ).toEqual({});
  });

  it("an unknown event name is never sent", () => {
    const capture = vi.fn();
    registerAnalytics({ capture });
    expect(
      track("chkoun_answer" as unknown as (typeof EVENT_NAMES)[number], {}),
    ).toBe(false);
    expect(capture).not.toHaveBeenCalled();
  });

  it("a failing analytics library never breaks the game", () => {
    registerAnalytics({
      capture: () => {
        throw new Error("blocked");
      },
    });
    expect(track("chkoun_opened", { n: 1 })).toBe(false);
  });
});
