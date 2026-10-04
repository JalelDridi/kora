import type { Match } from "./types.ts";

// Every men's international since 1872, CC0, kept up to date by hand on
// GitHub. Used to tell when an infobox's caps are older than Tunisia's last
// matches.
export const RESULTS_URL =
  "https://raw.githubusercontent.com/martj42/international_results/master/results.csv";

export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        cell += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      cells.push(cell);
      cell = "";
    } else {
      cell += c;
    }
  }
  cells.push(cell);
  return cells;
}

function score(value: string | undefined): number | null {
  return value !== undefined && /^\d+$/.test(value) ? Number(value) : null;
}

export function tunisiaMatches(csv: string): Match[] {
  const [header = "", ...rows] = csv
    .replace(/\r/g, "")
    .split("\n")
    .filter(Boolean);
  const columns = parseCsvLine(header);
  const at = (name: string) => {
    const index = columns.indexOf(name);
    if (index === -1) throw new Error(`results.csv has no ${name} column`);
    return index;
  };
  const col = {
    date: at("date"),
    home: at("home_team"),
    away: at("away_team"),
    homeScore: at("home_score"),
    awayScore: at("away_score"),
    tournament: at("tournament"),
  };
  return rows
    .map(parseCsvLine)
    .filter((r) => r[col.home] === "Tunisia" || r[col.away] === "Tunisia")
    .map((r) => ({
      date: r[col.date],
      home: r[col.home],
      away: r[col.away],
      homeScore: score(r[col.homeScore]),
      awayScore: score(r[col.awayScore]),
      tournament: r[col.tournament],
    }));
}

/** Matches with a score played strictly after an ISO date. */
export function playedAfter(matches: Match[], isoDate: string): number {
  return matches.filter((m) => m.date > isoDate && m.homeScore !== null).length;
}

export function latestPlayed(matches: Match[]): string | null {
  const played = matches.filter((m) => m.homeScore !== null).map((m) => m.date);
  return played.length === 0 ? null : played.sort().at(-1)!;
}
