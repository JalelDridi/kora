import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanProps, EVENT_NAMES, registerAnalytics, track } from "./events";

afterEach(() => registerAnalytics(null));

describe("game events", () => {
  it("track does nothing without a key (no instance registered)", () => {
    expect(track("chkoun_opened", { n: 3, locale: "fr" })).toBe(false);
  });

  it("event names are chkoun_opened, chkoun_guessed, chkoun_finished, chkoun_shared, chkoun_no_match and the six 30–0 events", () => {
    expect(EVENT_NAMES).toEqual([
      "chkoun_opened",
      "chkoun_guessed",
      "chkoun_finished",
      "chkoun_shared",
      "chkoun_no_match",
      "season_opened",
      "slot_drafted",
      "respin_used",
      "season_simulated",
      "season_shared",
      "board_viewed",
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

describe("30–0 events (D-S3-13: no names, ids, codes or squads)", () => {
  it("the six 30–0 events are known", () => {
    for (const n of [
      "season_opened",
      "slot_drafted",
      "respin_used",
      "season_simulated",
      "season_shared",
      "board_viewed",
    ])
      expect(EVENT_NAMES).toContain(n);
  });

  it("slot_drafted carries the line and the rating band only", () =>
    expect(
      cleanProps({ line: "forward", band: "80", id: "msakni", name: "Msakni" }),
    ).toEqual({ line: "forward", band: "80" }));

  it("season_simulated carries W-D-L and an integer rating, never a squad or a code", () =>
    expect(
      cleanProps({ w: 28, d: 2, l: 0, rating: 91.2, xi: "a_0~b_1", code: "x" }),
    ).toEqual({ w: 28, d: 2, l: 0, rating: 91 }));

  it("an out-of-range W-D-L or band is dropped", () => {
    expect(cleanProps({ w: 31, band: "50" })).toEqual({});
    expect(cleanProps({ rating: 59.4 })).toEqual({});
    expect(cleanProps({ rating: 99.6 })).toEqual({});
    expect(cleanProps({ w: 2.5 })).toEqual({});
    expect(cleanProps({ line: "libero" })).toEqual({});
    expect(cleanProps({ rating: 89.5 })).toEqual({ rating: 90 });
  });
});
