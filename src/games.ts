// The launch set (decision D8). Ids are message keys, database values and,
// from Sprint 2, routes.
export const launchGames = [
  { id: "chkoun", badge: "daily" },
  { id: "season", badge: "simulator" },
  { id: "aktar", badge: "endless" },
] as const;

export type GameId = (typeof launchGames)[number]["id"];
