import { plainLatin } from "./places.ts";
import { parseCsvLine } from "./results.ts";
import type { WdPlayer } from "./types.ts";

// martj42 goalscorers.csv (CC0). It names a scorer for about 35% of Tunisia's
// goals, so a count is a floor, never a total. Fetched in Task 8; pure here.

export const GOALSCORERS_URL =
  "https://raw.githubusercontent.com/martj42/international_results/master/goalscorers.csv";

const fold = (name: string) =>
  plainLatin(name)
    .replace(/[^a-z]+/g, " ")
    .trim();

/** [folded scorer name, goals] for Tunisia, own goals left out; an array so the cache keeps it as JSON. */
export function tunisiaScorers(csv: string): [string, number][] {
  const [header = "", ...rows] = csv
    .replace(/\r/g, "")
    .split("\n")
    .filter(Boolean);
  const columns = parseCsvLine(header);
  if (!["team", "scorer", "own_goal"].every((c) => columns.includes(c)))
    throw new Error("goalscorers.csv lacks team, scorer or own_goal");
  const col = {
    team: columns.indexOf("team"),
    scorer: columns.indexOf("scorer"),
    own: columns.indexOf("own_goal"),
  };
  const counts = new Map<string, number>();
  for (const row of rows.map(parseCsvLine)) {
    if (
      row[col.team] !== "Tunisia" ||
      row[col.own] === "TRUE" ||
      !row[col.scorer]
    )
      continue;
    const key = fold(row[col.scorer]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts];
}

/** A floor per Wikidata id, only for names exactly one footballer answers to. */
export function goalsFloors(
  scorers: [string, number][],
  players: WdPlayer[],
): Map<string, number> {
  const owners = new Map<string, Set<string>>();
  for (const p of players) {
    for (const key of [p.nameEn, p.nameFr, ...p.aliases]
      .map((n) => (n ? fold(n) : ""))
      .filter(Boolean)) {
      owners.set(key, (owners.get(key) ?? new Set<string>()).add(p.qid));
    }
  }
  const floors = new Map<string, number>();
  for (const [key, goals] of scorers) {
    const who = owners.get(key);
    if (who?.size === 1) {
      const [qid] = who;
      floors.set(qid, (floors.get(qid) ?? 0) + goals);
    }
  }
  return floors;
}
