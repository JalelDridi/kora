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

/**
 * Winners by competition and edition, with every correction and drop the
 * parser makes, so the reviewer sees them.
 */
export function parseHonoursReport(json: unknown): {
  honours: WdHonour[];
  issues: HonourIssue[];
} {
  const out = new Map<string, WdHonour>();
  const issues = new Map<string, HonourIssue>();
  const report = (issue: HonourIssue) =>
    issues.set(JSON.stringify(issue), issue);
  for (const row of bindings(json)) {
    const competition = COMPETITIONS[text(row.compName) ?? ""];
    const label = text(row.seasonLabel);
    const winnerQid = entity(row.winner);
    // Recent bulk imports have seasons with no real label (probe §3, Q4).
    if (!competition || !label || /^Q\d+$/.test(label) || !winnerQid) continue;
    const fromLabel = /^(\d{4})/.exec(label);
    const seasonStart =
      year(row.start) ?? (fromLabel ? Number(fromLabel[1]) : null);
    if (seasonStart === null) continue;
    const id = entity(row.season);
    const season = `"${label}"${id ? ` (${id})` : ""}`;
    // An edition ends the year it starts or the next one (the database checks
    // it): the end date first, then the label, then the start year.
    const within = (end: number | null): end is number =>
      end !== null && end >= seasonStart && end <= seasonStart + 1;
    const endDate = year(row.end);
    const endLabel = endFromLabel(label);
    let seasonEnd: number;
    if (within(endDate)) {
      seasonEnd = endDate;
    } else {
      if (endDate !== null) {
        report({
          kind: "end-out-of-range",
          competition,
          seasonStart,
          detail: `${season}: end date year ${endDate} is neither ${seasonStart} nor ${seasonStart + 1}`,
        });
      }
      if (within(endLabel)) {
        seasonEnd = endLabel;
      } else {
        seasonEnd = seasonStart;
        // Silent when the label is a plain single year ("2018 CAF Champions
        // League"): ending the year it starts is what the label says, not a
        // guess. A row with no label never gets here (skipped above), so the
        // start-year fallback is only reported when a label was there to read.
        if (!singleYearLabel(label)) {
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
      }
    }
    const key = `${competition}|${seasonStart}|${seasonEnd}`;
    const kept = out.get(key);
    if (!kept) {
      out.set(key, { competition, seasonStart, seasonEnd, winnerQid });
    } else if (kept.winnerQid !== winnerQid) {
      // The same winner again is SPARQL row multiplication, not news.
      report({
        kind: "duplicate-edition",
        competition,
        seasonStart,
        detail: `${season}: edition ${seasonStart}–${seasonEnd} won by ${kept.winnerQid} and by ${winnerQid}; kept ${kept.winnerQid}`,
      });
    }
  }
  const honours = [...out.values()].sort(
    (a, b) =>
      a.competition.localeCompare(b.competition) ||
      a.seasonStart - b.seasonStart ||
      a.seasonEnd - b.seasonEnd,
  );
  return { honours, issues: [...issues.values()] };
}

export function parseHonours(json: unknown): WdHonour[] {
  return parseHonoursReport(json).honours;
}
