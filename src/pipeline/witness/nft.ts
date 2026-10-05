import { anchors, cells, elements, hasClass, isoDate, text } from "./html.ts";

// national-football-teams.com pages, read for the private witness (P43,
// P48): caps only. Nothing read here is ever published (S29). Pure.
//
// The country page parser follows a real page's shape (the research probe
// of 4 October 2026: `td.name a[href^="/player/"]`, `td.dob`, `td.club`, the
// first `td.stats.matches` under the "FIFA" header, the match table's
// `td.date` and `td.stats.fifa`, "Last update"); the player page parser too
// (sample run, 5 October 2026: the chart data and the career table).

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

// Anchored: only this exact path shape is ever followed (fix round 1).
const PLAYER = /^\/player\/(\d+)\/[\w%.-]+\.html$/;

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
  /** The chart data's "fifa" entry, when the page has it. */
  chartFifa: number | null;
  /** The career table's Tunisia "A" rows, summed, when the page has them. */
  tableFifa: number | null;
};

/** The chart script's `"dataProvider": [...]`: its "fifa" entry's matches. */
function chartFifa(html: string): number | null {
  const block = /"dataProvider"\s*:\s*\[([\s\S]*?)\]/.exec(html)?.[1];
  if (!block) return null;
  for (const entry of block.match(/\{[^{}]*\}/g) ?? []) {
    if (!/"type"\s*:\s*"fifa"/.test(entry)) continue;
    const m = /"matches"\s*:\s*(\d+)/.exec(entry);
    return m ? Number(m[1]) : null;
  }
  return null;
}

/**
 * The career table: the one whose header has a "FIFA" and a "Non FIFA"
 * group. Each row of the senior team (td.country[data-order^="Tunisia_A_"])
 * counts its first "matches" cell, the FIFA one; youth rows carry other
 * codes and are left out. The footer, which adds them all, is not read.
 */
function tableFifa(html: string): number | null {
  for (const table of elements(html, "table")) {
    const head = elements(elements(table, "thead")[0] ?? "", "th").map((h) =>
      text(h),
    );
    if (!head.includes("FIFA") || !head.includes("Non FIFA")) continue;
    let sum = 0;
    let rows = 0;
    for (const row of elements(elements(table, "tbody")[0] ?? "", "tr")) {
      const row_ = cells(row);
      const country = row_.find((c) => hasClass(c.cls, "country"));
      if (!/data-order="Tunisia_A_/.test(country?.attrs ?? "")) continue;
      const matches = row_.find((c) => hasClass(c.cls, "stats", "matches"));
      const n = matches ? count(matches.html) : null;
      if (n === null) continue;
      sum += n;
      rows++;
    }
    return rows > 0 ? sum : null;
  }
  return null;
}

/**
 * A player page (checked on the sample of 5 October 2026): his career FIFA
 * matches for Tunisia, from the chart data, else from the career table.
 */
export function parsePlayerPage(html: string): NftPlayerPage {
  const chart = chartFifa(html);
  const table = tableFifa(html);
  return { careerFifa: chart ?? table, chartFifa: chart, tableFifa: table };
}
