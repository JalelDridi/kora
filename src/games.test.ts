import { describe, expect, it } from "vitest";
import arLatnTN from "../messages/ar-Latn-TN.json";
import arTN from "../messages/ar-TN.json";
import fr from "../messages/fr.json";
import { getGame, launchGames, liveRoute, type LaunchGame } from "./games";

const messages = { "ar-TN": arTN, "ar-Latn-TN": arLatnTN, fr };

describe("launch games", () => {
  it("are Chkoun?, 30–0 and Aktar wala A9all, in that order (decision D8)", () => {
    expect(launchGames.map((game) => game.id)).toEqual([
      "chkoun",
      "season",
      "aktar",
    ]);
  });

  it("each have a name, a pitch and a badge label in every locale", () => {
    for (const [locale, strings] of Object.entries(messages)) {
      for (const game of launchGames) {
        expect(
          strings.games[game.id].name,
          `${locale} ${game.id}`,
        ).toBeTruthy();
        expect(
          strings.games[game.id].pitch,
          `${locale} ${game.id}`,
        ).toBeTruthy();
        expect(
          strings.badges[game.badge],
          `${locale} ${game.badge}`,
        ).toBeTruthy();
      }
    }
  });

  it("only Chkoun? has a route", () => {
    expect(
      launchGames.filter((game) => game.route !== null).map((g) => g.id),
    ).toEqual(["chkoun"]);
    expect(getGame("chkoun").route).toBe("/chkoun");
  });

  it("a game is linked from the hub only when its switch is on", () => {
    const chkoun = getGame("chkoun");
    const off: LaunchGame = { ...chkoun, live: false };
    const on: LaunchGame = { ...chkoun, live: true };
    expect(liveRoute(off)).toBeNull();
    expect(liveRoute(on)).toBe("/chkoun");
    expect(liveRoute({ ...getGame("season"), live: true })).toBeNull();
  });

  it("only a game with a route can be live", () => {
    for (const game of launchGames)
      if (game.live) expect(game.route).not.toBeNull();
  });
});
