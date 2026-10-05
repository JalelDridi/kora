import { anchors, cells, elements, hasClass, isoDate, text } from "./html.ts";

// national-football-teams.com pages, read for the private witness (P43,
// P48): caps only. Nothing read here is ever published (S29). Pure.
//
// The country page parser follows a real page's shape (the research probe
// of 4 October 2026: `td.name a[href^="/player/"]`, `td.dob`, `td.club`, the
// first `td.stats.matches` under the "FIFA" header, the match table's
// `td.date` and `td.stats.fifa`, "Last update"). The player page parser is
// UNVERIFIED until the sample run (B5): no player page has been fetched yet.

export type NftCountryPlayer = {
  id: string;
  /** His player page's path, as the row links it. */
  path: string;
  /** "Family, Given" as the page shows it. */
  name: string;
  birthDate: string | null;
  club: string | null;
  /** FIFA matches this year (the first "M" column, under "FIFA"). */
  fifaMatches: number | null;
};

export type NftCountryPage = {
  players: NftCountryPlayer[];
  /** This year's matches, newest first as listed; `fifa` when the FIFA column is ticked. */
  matches: { date: string; fifa: boolean }[];
  /** "Last update : 10/4/26, 3:42 PM" read as an ISO date; null when absent. */
  lastUpdate: string | null;
};

const PLAYER = /^\/player\/(\d+)\//;

const count = (html: string): number | null => {
  const m = /\d+/.exec(text(html));
  return m ? Number(m[0]) : null;
};

export function parseCountryPage(html: string): NftCountryPage {
  const playerTable =
    elements(html, "table", /class="[^"]*\bplayer\b[^"]*"/)[0] ?? "";
  const players: NftCountryPlayer[] = [];
  for (const row of elements(elements(playerTable, "tbody")[0] ?? "", "tr")) {
    const row_ = cells(row);
    const nameCell = row_.find((c) => hasClass(c.cls, "name"));
    const link = anchors(nameCell?.html ?? "").find((a) => PLAYER.test(a.href));
    if (!link) continue;
    const dob = row_.find((c) => hasClass(c.cls, "dob"));
    const club = row_.find((c) => hasClass(c.cls, "club"));
    // The first "matches" cell sits under the "FIFA" header, the second under "Non FIFA".
    const fifa = row_.find((c) => hasClass(c.cls, "stats", "matches"));
    players.push({
      id: PLAYER.exec(link.href)![1],
      path: link.href,
      name: link.text.replace(/\s+,/g, ","),
      birthDate: dob ? isoDate(text(dob.html)) : null,
      club: club ? text(club.html) || null : null,
      fifaMatches: fifa ? count(fifa.html) : null,
    });
  }
  const matchTable = elements(html, "table", /id="table-matches"/)[0] ?? "";
  const matches: { date: string; fifa: boolean }[] = [];
  for (const row of elements(elements(matchTable, "tbody")[0] ?? "", "tr")) {
    const row_ = cells(row);
    const date = row_.find((c) => hasClass(c.cls, "date"));
    const iso = date ? isoDate(text(date.html)) : null;
    if (!iso) continue;
    const fifa = row_.find((c) => hasClass(c.cls, "fifa"));
    matches.push({ date: iso, fifa: /fa-check/.test(fifa?.html ?? "") });
  }
  const update = /Last update\s*:\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i.exec(
    text(html),
  );
  const lastUpdate = update
    ? `${update[3].length === 2 ? `20${update[3]}` : update[3]}-${update[1].padStart(2, "0")}-${update[2].padStart(2, "0")}`
    : null;
  return { players, matches, lastUpdate };
}

/** The newest FIFA match the page lists, or null. */
export function latestFifaMatch(page: NftCountryPage): string | null {
  return (
    page.matches
      .filter((m) => m.fifa)
      .map((m) => m.date)
      .sort()
      .at(-1) ?? null
  );
}

export type NftPlayerPage = {
  /** Career FIFA matches for the senior national team; null when unreadable. */
  careerFifa: number | null;
};

/**
 * UNVERIFIED until the sample run: a player page's national-team career.
 * Read from a table whose rows are years: the "Total" row's first FIFA
 * "matches" cell, else the sum of the year rows' cells.
 */
export function parsePlayerPage(html: string): NftPlayerPage {
  for (const table of elements(
    html,
    "table",
    /class="[^"]*\bplayer\b[^"]*"|career/i,
  )) {
    const rows = elements(table, "tr");
    let total: number | null = null;
    let sum = 0;
    let years = 0;
    for (const row of rows) {
      const row_ = cells(row);
      const matches = row_.find((c) => hasClass(c.cls, "stats", "matches"));
      if (!matches) continue;
      const n = count(matches.html);
      if (n === null) continue;
      if (
        /class="[^"]*\btotal\b/i.test(row) ||
        /^total\b/i.test(text(row_[0]?.html ?? ""))
      ) {
        total = n;
      } else if (/^\d{4}$/.test(text(row_[0]?.html ?? ""))) {
        sum += n;
        years++;
      }
    }
    if (total !== null) return { careerFifa: total };
    if (years > 0) return { careerFifa: sum };
  }
  return { careerFifa: null };
}
