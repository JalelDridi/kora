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
/** A totals row's first cell, once bold marks are gone: not a spell. */
const TOTAL = /^(?:total|totaux)$/i;
/** Wrapper templates a career field holds; empty, they are an empty field. */
const WRAPPER = /^\{\{\s*(?:trois colonnes|parcours [^|{}]*?)\s*\}\}$/i;
const LIEN = /^lien$/i;
const ABBREVIATION = /^abréviation(?: discrète)?$/i;

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
 * Not rows, so neither read nor skipped: a totals row ("Total", "Totaux"), a
 * row whose years cell is only layout ({{clr}}) or empty and whose team does
 * not `matter` to the caller, and an empty wrapper ({{trois colonnes }}).
 */
export function readRows(
  name: string,
  field: string,
  hasName: (team: string) => boolean = (team) => team !== "",
  matters: (team: string) => boolean = () => true,
): { rows: CareerRow[]; skipped: SkippedRow[] } {
  const value = field.trim();
  const rows: CareerRow[] = [];
  const skipped: SkippedRow[] = [];
  if (value === "" || WRAPPER.test(value.replace(/\s+/g, " "))) {
    return { rows, skipped };
  }
  const body = value.startsWith("{{") ? findTemplate(value, /./) : null;
  /** Some row had content, even one ignored (a total, another team). */
  let seen = false;
  for (const line of (body ?? "").split("\n")) {
    const row = cells(line);
    for (let i = 0; i < row.length; i += 3) {
      const group = row.slice(i, i + 3);
      if (group.every((cell) => cell === "")) continue;
      seen = true;
      const raw = clip(`|${group.join("|")}`);
      const years = readYears(row[i]);
      const team = row[i + 1] ?? "";
      if (TOTAL.test(plainText(row[i]))) continue;
      // A years cell holding only layout ({{clr}}) or nothing, on a row that
      // does not matter to the caller (another national team): not a spell.
      if (years === null && plainText(row[i]) === "" && !matters(team)) {
        continue;
      }
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
  if (!seen) {
    skipped.push({ field: name, raw: clip(value), reason: "no-wrapper" });
  }
  return { rows, skipped };
}

/**
 * The club a career row's team cell names: its first link; else a {{Lien}}
 * (an article on another wiki: `fr`, the first positional, `texte`, then
 * `trad`, keeping `trad` as the foreign title); else the long form of
 * {{abréviation}} or {{abréviation discrète}}; else the cell's plain text.
 */
function readClub(team: string): { title: string; foreign?: string } {
  const link = links(team)[0];
  if (link) return { title: link.title };
  const lien = findTemplate(team, LIEN);
  if (lien !== null) {
    const p = splitParams(lien);
    const pick = (key: string) => plainText(p.get(key) ?? "");
    const foreign = pick("trad");
    const title = pick("fr") || pick("1") || pick("texte") || foreign;
    if (title !== "") return foreign ? { title, foreign } : { title };
  }
  const abbreviation = findTemplate(team, ABBREVIATION);
  if (abbreviation !== null) {
    const p = splitParams(abbreviation);
    const title = plainText(p.get("2") ?? "") || plainText(p.get("1") ?? "");
    if (title !== "") return { title };
  }
  return { title: plainText(team) };
}

function clubTitle(team: string): string {
  return readClub(team).title;
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
  const national = readRows(
    "sélection nationale",
    get("sélection nationale"),
    undefined,
    isSeniorTunisie,
  );
  const skipped = [...career.skipped, ...national.skipped];
  const spells: Spell[] = career.rows.map((row) => {
    const club = readClub(row.team);
    return {
      clubTitle: club.title,
      ...(club.foreign === undefined ? {} : { clubTitleForeign: club.foreign }),
      from: row.from,
      to: row.to,
      apps: row.apps,
      goals: row.goals,
      loan: row.loan,
    };
  });

  let caps: number | null = null;
  let goals: number | null = null;
  let nationalOpen = false;
  let seniorRow = false;
  for (const row of national.rows) {
    if (!isSeniorTunisie(row.team)) continue;
    seniorRow = true;
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
    seniorRow,
  };
}
