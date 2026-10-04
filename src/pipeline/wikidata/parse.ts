import type {
  Competition,
  HonourIssue,
  WdClub,
  WdHonour,
  WdMembership,
  WdPlayer,
} from "../types.ts";

type Term = { type: string; value: string };
type Row = Record<string, Term | undefined>;

const MALE = "Q6581097";

function bindings(json: unknown): Row[] {
  const rows = (json as { results?: { bindings?: unknown } } | null)?.results
    ?.bindings;
  if (!Array.isArray(rows)) throw new Error("not a SPARQL JSON result");
  return rows as Row[];
}

function entity(term: Term | undefined): string | null {
  if (!term || term.type !== "uri") return null;
  const id = term.value.slice(term.value.lastIndexOf("/") + 1);
  return /^Q\d+$/.test(id) ? id : null;
}

function text(term: Term | undefined): string | null {
  const value = term?.value.trim();
  return value ? value : null;
}

function list(term: Term | undefined): string[] {
  return (text(term) ?? "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * P413 as "Q336286=defender|Q193592=midfielder", in Q-id order: GROUP_CONCAT
 * has no defined order, and the first position decides a footballer's line.
 * Entries without an id (older recordings hold bare labels) keep their order,
 * after those with one.
 */
function positions(term: Term | undefined): string[] {
  return list(term)
    .map((entry, index) => {
      const match = /^Q(\d+)=(.+)$/.exec(entry);
      return match
        ? { label: match[2].trim(), id: Number(match[1]), index }
        : { label: entry, id: Number.POSITIVE_INFINITY, index };
    })
    .sort((a, b) => a.id - b.id || a.index - b.index)
    .map((p) => p.label);
}

function year(term: Term | undefined): number | null {
  if (!term || term.type !== "literal") return null;
  const match = /^(\d{4})/.exec(term.value);
  return match ? Number(match[1]) : null;
}

function int(term: Term | undefined): number | null {
  const n = Number(term?.value);
  return term !== undefined && Number.isInteger(n) ? n : null;
}

/** Wikidata's "unknown value" comes back as a blank node. */
function unknown(term: Term | undefined): boolean {
  return (
    term?.type === "bnode" ||
    (term?.value.includes("/.well-known/genid/") ?? false)
  );
}

export function fileFromImage(uri: string): string {
  const name = decodeURIComponent(uri.slice(uri.lastIndexOf("/") + 1));
  return `File:${name.replace(/_/g, " ")}`;
}

export function parsePlayers(json: unknown): WdPlayer[] {
  return bindings(json).flatMap((row) => {
    const qid = entity(row.p);
    if (!qid) return [];
    const gender = entity(row.gender);
    return [
      {
        qid,
        nameEn: text(row.enLabel),
        nameFr: text(row.frLabel),
        nameAr: text(row.arLabel),
        aliases: [],
        male: gender === null || gender === MALE,
        birthDate: text(row.birth)?.slice(0, 10) ?? null,
        positions: positions(row.positions),
        birthPlaceQid: entity(row.birthPlace),
        birthPlaceName: text(row.birthPlaceName),
        birthCountry: text(row.birthCountry)?.toUpperCase() ?? null,
        governorates: list(row.governorates),
        imageFile: row.image ? fileFromImage(row.image.value) : null,
        titles: {
          en: text(row.enwiki),
          fr: text(row.frwiki),
          ar: text(row.arwiki),
        },
      },
    ];
  });
}

export function parseAliases(json: unknown): [string, string[]][] {
  return bindings(json).flatMap((row) => {
    const qid = entity(row.p);
    return qid ? [[qid, list(row.aliases)] as [string, string[]]] : [];
  });
}

export function parseMemberships(json: unknown): WdMembership[] {
  const seen = new Map<string, WdMembership>();
  for (const row of bindings(json)) {
    const playerQid = entity(row.p);
    const teamQid = entity(row.team);
    if (!playerQid || !teamQid) continue;
    const start = unknown(row.start) ? null : year(row.start);
    const endUnknown = unknown(row.end);
    const end = endUnknown ? null : year(row.end);
    const key = `${playerQid}|${teamQid}|${start}|${end}|${endUnknown}`;
    if (seen.has(key)) continue;
    seen.set(key, {
      playerQid,
      teamQid,
      teamName: text(row.teamEn),
      start,
      end,
      endUnknown,
      apps: int(row.apps),
      goals: int(row.goals),
      national: row.isNational?.value === "1",
    });
  }
  return [...seen.values()];
}

export function parseClubs(json: unknown): WdClub[] {
  const clubs = new Map<string, WdClub>();
  for (const row of bindings(json)) {
    const qid = entity(row.club);
    if (!qid || clubs.has(qid)) continue;
    clubs.set(qid, {
      qid,
      nameEn: text(row.en),
      nameFr: text(row.fr),
      nameAr: text(row.ar),
      country: text(row.iso)?.toUpperCase() ?? null,
      leagues: list(row.leagues),
      titleEn: text(row.enTitle),
      titleFr: text(row.frTitle),
    });
  }
  return [...clubs.values()];
}

const COMPETITIONS: Record<string, Competition> = {
  "Tunisian Ligue Professionnelle 1": "tn_ligue1",
  "Tunisian Cup": "tn_cup",
  "CAF Champions League": "caf_cl",
  "CAF Confederation Cup": "caf_cc",
};

/**
 * "2018–19 …", "2018-19 …", "2018/19 …" or "2018/2019 …" → 2019;
 * "1999–2000 …" → 2000; "2018 …" → null.
 */
function endFromLabel(label: string): number | null {
  const match = /^(\d{4})\s*[–—/-]\s*(\d{4}|\d{2})(?!\d)/.exec(label);
  if (!match) return null;
  if (match[2].length === 4) return Number(match[2]);
  const start = Number(match[1]);
  const end = Math.floor(start / 100) * 100 + Number(match[2]);
  return end < start ? end + 100 : end;
}

/** "2018 CAF Champions League": a single-year edition, ending the year it starts. */
function singleYearLabel(label: string): boolean {
  return /^\d{4}(?!\d|\s*[–—/-]\s*\d)/.test(label);
}

/** "Q900" → 900, to order winners by id. */
function qNumber(qid: string): number {
  return Number(qid.slice(1));
}

/**
 * Winners by competition and edition, with every correction and drop the
 * parser makes, so the reviewer sees them. Issues are sorted, and the winner
 * kept for an edition is the lowest Q-id, so the result does not depend on
 * the order SPARQL returns rows in.
 */
export function parseHonoursReport(json: unknown): {
  honours: WdHonour[];
  issues: HonourIssue[];
  skipped: { unlabelled: number; noStart: number };
} {
  const editions = new Map<
    string,
    {
      competition: Competition;
      seasonStart: number;
      seasonEnd: number;
      winners: Set<string>;
      seasons: Set<string>;
    }
  >();
  const issues = new Map<string, HonourIssue>();
  const report = (issue: HonourIssue) =>
    issues.set(JSON.stringify(issue), issue);
  // Dropped seasons, counted by season item (the row's ?season id), so rows
  // that SPARQL multiplies count once; a row without an id counts on its own.
  const unlabelled = new Set<string>();
  const noStart = new Set<string>();
  bindings(json).forEach((row, index) => {
    const competition = COMPETITIONS[text(row.compName) ?? ""];
    const winnerQid = entity(row.winner);
    if (!competition || !winnerQid) return;
    const id = entity(row.season);
    const label = text(row.seasonLabel);
    // Recent bulk imports have seasons with no English label, or whose label
    // is just their id (probe §3, Q4).
    if (!label || /^Q\d+$/.test(label)) {
      unlabelled.add(id ?? label ?? `row ${index}`);
      return;
    }
    const fromLabel = /^(\d{4})/.exec(label);
    const seasonStart =
      year(row.start) ?? (fromLabel ? Number(fromLabel[1]) : null);
    if (seasonStart === null) {
      noStart.add(id ?? label);
      return;
    }
    const season = `"${label}"${id ? ` (${id})` : ""}`;
    // An edition ends the year it starts or the next one (the database checks
    // it): the end date first, then the label, then the start year.
    const within = (end: number | null): end is number =>
      end !== null && end >= seasonStart && end <= seasonStart + 1;
    const endDate = year(row.end);
    const endLabel = endFromLabel(label);
    const seasonEnd = within(endDate)
      ? endDate
      : within(endLabel)
        ? endLabel
        : seasonStart;
    if (endDate !== null && !within(endDate)) {
      report({
        kind: "end-out-of-range",
        competition,
        seasonStart,
        detail: `${season}: end date year ${endDate} is neither ${seasonStart} nor ${seasonStart + 1}; stored end ${seasonEnd}, ${within(endLabel) ? "from the label" : "the start year"}`,
      });
    }
    // Silent when the label is a plain single year ("2018 CAF Champions
    // League"): ending the year it starts is what the label says, not a guess.
    // A row with no label never gets here (counted as unlabelled above), so
    // the start-year fallback is only reported when a label was there to read.
    if (!within(endDate) && !within(endLabel) && !singleYearLabel(label)) {
      report({
        kind: "label-unreadable",
        competition,
        seasonStart,
        detail:
          endLabel === null
            ? `${season}: no end year in the label, so the end is the start year ${seasonStart}`
            : `${season}: the label's end year ${endLabel} is neither ${seasonStart} nor ${seasonStart + 1}, so the end is the start year ${seasonStart}`,
      });
    }
    const key = `${competition}|${seasonStart}|${seasonEnd}`;
    const edition = editions.get(key) ?? {
      competition,
      seasonStart,
      seasonEnd,
      winners: new Set<string>(),
      seasons: new Set<string>(),
    };
    edition.winners.add(winnerQid);
    edition.seasons.add(season);
    editions.set(key, edition);
  });

  const honours: WdHonour[] = [];
  for (const edition of editions.values()) {
    const { competition, seasonStart, seasonEnd } = edition;
    const winners = [...edition.winners].sort(
      (a, b) => qNumber(a) - qNumber(b),
    );
    honours.push({
      competition,
      seasonStart,
      seasonEnd,
      winnerQid: winners[0],
    });
    // The same winner again is SPARQL row multiplication, not news.
    if (winners.length > 1) {
      report({
        kind: "duplicate-edition",
        competition,
        seasonStart,
        detail: `${[...edition.seasons].sort().join(" / ")}: edition ${seasonStart}–${seasonEnd} has winners ${winners.join(", ")}; kept ${winners[0]}`,
      });
    }
  }
  honours.sort(
    (a, b) =>
      a.competition.localeCompare(b.competition) ||
      a.seasonStart - b.seasonStart ||
      a.seasonEnd - b.seasonEnd,
  );
  const sortedIssues = [...issues.values()].sort(
    (a, b) =>
      a.competition.localeCompare(b.competition) ||
      a.seasonStart - b.seasonStart ||
      a.kind.localeCompare(b.kind) ||
      a.detail.localeCompare(b.detail),
  );
  return {
    honours,
    issues: sortedIssues,
    skipped: { unlabelled: unlabelled.size, noStart: noStart.size },
  };
}

export function parseHonours(json: unknown): WdHonour[] {
  return parseHonoursReport(json).honours;
}
