// {{Infobox Footballeur}}, shaped after the eight articles recorded in Task 1
// (src/pipeline/wiki/__fixtures__/fr). A career field holds a wrapper template
// ({{trois colonnes}}, {{parcours pro}}, {{parcours national}}) with one row
// per line and three cells:
//   |[[2009 en football|2009]]-[[2016 en football|2016]]|{{TUN-d}} [[Club sportif sfaxien (football)|CS Sfaxien]]|191 (40)
//    years                                              | team                                                    | apps (goals)

import type { Infobox, SkippedRow, Spell } from "../types.ts";
import { parseFrBirth } from "./birth.ts";
import { parseFrDate } from "./dates.ts";
import { readCurrentClub } from "./infobox-en.ts";
import {
  cells,
  clip,
  findTemplate,
  links,
  plainText,
  splitParams,
} from "./wikitext.ts";

const TEMPLATE = /^infobox (?:footballeur|football biographie)$/i;
const STAFF =
  /\((?=[^)]*\b(?:entraîneur|entraineur|adjoint|analyste|directeur|recruteur|sélectionneur|consultant|président)\b)[^)]*\)/i;
const NATIONAL_TEAM = /^équipe d(?:e|u|es|')\s?.*\bde football\b/i;
const SENIOR_TEAM = "Équipe de Tunisie de football";
/** Renders the senior team, flag and link; used in 7 of the 8 recorded articles. */
const SENIOR_TEMPLATE = /\{\{\s*TUN football\s*\}\}/i;
const LOAN = /\{\{\s*prêt\s*\}\}/i;
/** "2009-2016", "2025-", "2018", "?-2013", "-2015"; hyphen, en or em dash. */
const YEARS = /^(\?|\d{4})?\s*(?:([-–—])\s*(\?|\d{4})?)?$/;
/** "191 (40)", "120(17)", "? (?)" once {{0}} padding is gone. */
const STATS = /^(\d+|\?)?\s*(?:\(\s*(\d+|\?)\s*\))?$/;

export type CareerRow = {
  /** Null when unknown ("?-2013"). */
  from: number | null;
  /** Null for an open spell ("2025-") or an unknown end. */
  to: number | null;
  open: boolean;
  /** The team cell as written: flags, {{prêt}}, {{nobr}}, the link. */
  team: string;
  apps: number | null;
  goals: number | null;
  loan: boolean;
};

function known(value: string | undefined): number | null {
  return value === undefined || value === "?" ? null : Number(value);
}

function readYears(
  cell: string,
): Pick<CareerRow, "from" | "to" | "open"> | null {
  const m = YEARS.exec(plainText(cell));
  if (!m || (m[1] === undefined && m[3] === undefined)) return null;
  const from = known(m[1]);
  if (m[2] === undefined) return { from, to: from, open: false };
  return { from, to: known(m[3]), open: m[3] === undefined };
}

function readStats(cell: string): Pick<CareerRow, "apps" | "goals"> {
  const m = STATS.exec(plainText(cell));
  return m
    ? { apps: known(m[1]), goals: known(m[2]) }
    : { apps: null, goals: null };
}

/**
 * Rows of a French career field: the wrapper template's body, one row per
 * line, three cells per row (several rows on one line are read three cells
 * at a time). `name` is the field's name, for the skipped rows: a row whose
 * first cell is not a years cell ("years") or whose team cell names no team
 * by `hasName` ("no-club"), and a non-empty field that yields no row at all,
 * having no wrapper template to split ("no-wrapper", one entry for the field).
 */
export function readRows(
  name: string,
  field: string,
  hasName: (team: string) => boolean = (team) => team !== "",
): { rows: CareerRow[]; skipped: SkippedRow[] } {
  const value = field.trim();
  const rows: CareerRow[] = [];
  const skipped: SkippedRow[] = [];
  if (value === "") return { rows, skipped };
  const body = value.startsWith("{{") ? findTemplate(value, /./) : null;
  for (const line of (body ?? "").split("\n")) {
    const row = cells(line);
    for (let i = 0; i < row.length; i += 3) {
      const group = row.slice(i, i + 3);
      if (group.every((cell) => cell === "")) continue;
      const raw = clip(`|${group.join("|")}`);
      const years = readYears(row[i]);
      const team = row[i + 1] ?? "";
      if (years === null) {
        skipped.push({ field: name, raw, reason: "years" });
      } else if (!hasName(team)) {
        skipped.push({ field: name, raw, reason: "no-club" });
      } else {
        rows.push({
          ...years,
          team,
          ...readStats(row[i + 2] ?? ""),
          loan: LOAN.test(team),
        });
      }
    }
  }
  if (rows.length === 0 && skipped.length === 0) {
    skipped.push({ field: name, raw: clip(value), reason: "no-wrapper" });
  }
  return { rows, skipped };
}

/** The club a career row's team cell names: its first link, or its text. */
function clubTitle(team: string): string {
  return links(team)[0]?.title ?? plainText(team);
}

/** The rows alone; readRows also says which rows it skipped. */
export function parseRows(field: string): CareerRow[] {
  return readRows("", field).rows;
}

/**
 * The senior team: {{TUN football}}, or a cell reading exactly "Tunisie" that
 * links to the senior team's article or to nothing. Youth rows read
 * "Tunisie -20 ans", "Tunisie olympique", "Tunisie -23 ans" and so on.
 */
export function isSeniorTunisie(team: string): boolean {
  if (SENIOR_TEMPLATE.test(team)) return true;
  const link = links(team)[0];
  return (
    plainText(team) === "Tunisie" &&
    (link === undefined || link.title === SENIOR_TEAM)
  );
}

export function parseFrInfobox(
  title: string,
  wikitext: string,
): Infobox | null {
  const body = findTemplate(wikitext, TEMPLATE);
  if (body === null) return null;
  const params = splitParams(body);
  const get = (key: string) => params.get(key) ?? "";

  // "parcours senior" in 5 of the 8 recorded articles, "parcours pro" in 3.
  const careerField = get("parcours senior")
    ? "parcours senior"
    : "parcours pro";
  const career = readRows(
    careerField,
    get(careerField),
    (team) => clubTitle(team) !== "",
  );
  const national = readRows("sélection nationale", get("sélection nationale"));
  const skipped = [...career.skipped, ...national.skipped];
  const spells: Spell[] = career.rows.map((row) => ({
    clubTitle: clubTitle(row.team),
    from: row.from,
    to: row.to,
    apps: row.apps,
    goals: row.goals,
    loan: row.loan,
  }));

  let caps: number | null = null;
  let goals: number | null = null;
  let nationalOpen = false;
  for (const row of national.rows) {
    if (!isSeniorTunisie(row.team)) continue;
    if (row.apps !== null) caps = (caps ?? 0) + row.apps;
    if (row.goals !== null) goals = (goals ?? 0) + row.goals;
    nationalOpen ||= row.open;
  }
  if (caps !== null && goals === null) goals = 0;

  const asOf = parseFrDate(get("date de mise à jour"));
  const current = readCurrentClub(get("club actuel"), STAFF, NATIONAL_TEAM);
  return {
    lang: "fr",
    title,
    currentClub: current.title,
    currentClubIsStaff: current.staff,
    positionText: plainText(get("position")) || null,
    spells,
    caps,
    goals,
    nationalOpen,
    clubsAsOf: asOf,
    capsAsOf: asOf,
    skipped,
    birthDate: parseFrBirth(get("date de naissance")),
  };
}
