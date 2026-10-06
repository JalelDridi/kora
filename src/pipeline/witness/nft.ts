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
  /**
   * Fix round 3: his senior Tunisia A matches, FIFA and non-FIFA together,
   * the count Wikipedia's caps are compared with; null when unreadable.
   */
  careerA: number | null;
  /** FIFA matches only (kept privately, for later). */
  careerFifa: number | null;
  /** The chart data's "fifa" and "nonfifa" entries, when the page has them. */
  chartFifa: number | null;
  chartNonFifa: number | null;
  /** The career table's Tunisia "A" rows, summed per column, when the page has them. */
  tableFifa: number | null;
  tableNonFifa: number | null;
  /** The newest match date in his match list: how far the site has him. */
  latestMatch: string | null;
};

/** The chart script's `"dataProvider": [...]`: an entry's matches by its type. */
function chartMatches(html: string, type: "fifa" | "nonfifa"): number | null {
  const block = /"dataProvider"\s*:\s*\[([\s\S]*?)\]/.exec(html)?.[1];
  if (!block) return null;
  for (const entry of block.match(/\{[^{}]*\}/g) ?? []) {
    const typed =
      type === "fifa" ? /"type"\s*:\s*"fifa"/ : /"type"\s*:\s*"nonfifa"/;
    if (!typed.test(entry)) continue;
    const m = /"matches"\s*:\s*(\d+)/.exec(entry);
    return m ? Number(m[1]) : null;
  }
  return null;
}

/**
 * The career table: the one whose header has a "FIFA" and a "Non FIFA"
 * group. Each row of the senior team (td.country[data-order^="Tunisia_A_"])
 * counts its first "matches" cell (FIFA) and its second (Non FIFA); youth
 * rows carry other codes and are left out. The footer, which adds them
 * all, is not read.
 */
function tableMatches(html: string): { fifa: number; nonFifa: number } | null {
  for (const table of elements(html, "table")) {
    const head = elements(elements(table, "thead")[0] ?? "", "th").map((h) =>
      text(h),
    );
    if (!head.includes("FIFA") || !head.includes("Non FIFA")) continue;
    let fifa = 0;
    let nonFifa = 0;
    let rows = 0;
    for (const row of elements(elements(table, "tbody")[0] ?? "", "tr")) {
      const row_ = cells(row);
      const country = row_.find((c) => hasClass(c.cls, "country"));
      if (!/data-order="Tunisia_A_/.test(country?.attrs ?? "")) continue;
      const [f, n] = row_.filter((c) => hasClass(c.cls, "stats", "matches"));
      const a = f ? count(f.html) : null;
      if (a === null) continue;
      fifa += a;
      nonFifa += (n ? count(n.html) : null) ?? 0;
      rows++;
    }
    return rows > 0 ? { fifa, nonFifa } : null;
  }
  return null;
}

/** The newest date of the page's match list (a table of class "matches"). */
function latestListedMatch(html: string): string | null {
  let latest: string | null = null;
  for (const table of elements(html, "table", /class="[^"]* matches[ "]/))
    for (const row of elements(elements(table, "tbody")[0] ?? "", "tr")) {
      const date = cells(row).find((c) => hasClass(c.cls, "date"));
      const iso = date ? isoDate(text(date.html)) : null;
      if (iso && (latest === null || iso > latest)) latest = iso;
    }
  return latest;
}

/**
 * A player page (checked on the sample of 5 October 2026 and the first
 * weekly run): his senior Tunisia matches from the chart data, else from
 * the career table; FIFA and non-FIFA apart and together.
 */
export function parsePlayerPage(html: string): NftPlayerPage {
  const chartFifa = chartMatches(html, "fifa");
  const chartNonFifa = chartMatches(html, "nonfifa");
  const table = tableMatches(html);
  const fromChart = chartFifa === null ? null : chartFifa + (chartNonFifa ?? 0);
  return {
    careerA: fromChart ?? (table ? table.fifa + table.nonFifa : null),
    careerFifa: chartFifa ?? table?.fifa ?? null,
    chartFifa,
    chartNonFifa,
    tableFifa: table?.fifa ?? null,
    tableNonFifa: table?.nonFifa ?? null,
    latestMatch: latestListedMatch(html),
  };
}
