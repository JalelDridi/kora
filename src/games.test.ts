import { describe, expect, it } from "vitest";
import arLatnTN from "../messages/ar-Latn-TN.json";
import arTN from "../messages/ar-TN.json";
import fr from "../messages/fr.json";
import { launchGames } from "./games";

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
});
