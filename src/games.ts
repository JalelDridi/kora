// The launch set (decision D8). Ids are message keys, database values and
// routes.

export type GameId = "chkoun" | "season" | "aktar";

export type LaunchGame = {
  id: GameId;
  badge: "daily" | "simulator" | "endless";
  /** The game's page under each locale ("/chkoun"); null until it is built. */
  route: string | null;
  /**
   * The go-live switch (Sprint 2, Task 16). While false, the game's page is
   * reachable by its URL for testing but the hub card says "soon", the page
   * is noindex and the sitemap leaves it out. Flipping it does all three.
   */
  live: boolean;
};

export const launchGames: readonly LaunchGame[] = [
  { id: "chkoun", badge: "daily", route: "/chkoun", live: true },
  { id: "season", badge: "simulator", route: null, live: false },
  { id: "aktar", badge: "endless", route: null, live: false },
];

export function getGame(id: GameId): LaunchGame {
  return launchGames.find((game) => game.id === id)!;
}

/** The game's route when it is live; null while the hub still says "soon". */
export function liveRoute(game: LaunchGame): string | null {
  return game.live ? game.route : null;
}
