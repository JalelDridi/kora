import type { Infobox, SkippedRow, Spell } from "../types.ts";
import { parseEnBirth } from "./birth.ts";
import { parseEnDate } from "./dates.ts";
import {
  clip,
  findTemplate,
  intOrNull,
  links,
  parseYears,
  plainText,
  splitParams,
} from "./wikitext.ts";

const TEMPLATE = /^infobox football biography$/i;
const STAFF =
  /\((?=[^)]*\b(?:analyst|coach|manager|assistant|director|scout|staff|ambassador|technical|president|chairman)\b)[^)]*\)/i;
const NATIONAL_TEAM = /national (?:under-\d+ )?(?:football|soccer) team/i;
const CLUB_ROWS = 40;
const NATIONAL_ROWS = 20;
const NO_CLUB =
  /^(?:|retired|free agent|unattached|none|retraité|libre|sans club|-|—)$/i;

/** True for the senior team row: label exactly "Tunisia" (not "Tunisia U23"). */
export function isSeniorTunisia(
  text: string,
  label: string,
  title: string,
): boolean {
  const link = links(text)[0];
  if (link)
    return (
      link.label === label ||
      (link.label === link.title && link.title === title)
    );
  return plainText(text) === label;
}

/** A leading flag before a team name: {{flagicon|TUN}} or {{TUN}}. */
const FLAG_ICON = /^\{\{\s*flag ?icon\s*\|[^{}]*\}\}\s*/i;
const FLAG_CODE = /^\{\{\s*[A-Z]{3}\s*\}\}\s*/;
/** Team templates: {{fb|TUN}}, {{nft|Tunisia}} (senior), {{fbu|23|TUN}} (youth). */
const TEAM_TEMPLATE = /^\{\{\s*(fb|nft|fbu|fbw)\s*\|([^{}]*)\}\}$/i;

/**
 * A nationalteamN cell without a link: "senior" for the senior Tunisia team
 * ({{fb|TUN}}, {{fb|Tunisia}}, {{nft|Tunisia}}, an optional flag then the text
 * "Tunisia"), "other" for another named team ("Tunisia U20", {{fbu|23|TUN}}),
 * and null for a cell the parser cannot read as a team.
 */
export function unlinkedTeam(cell: string): "senior" | "other" | null {
  const rest = cell.trim().replace(FLAG_ICON, "").replace(FLAG_CODE, "");
  const template = TEAM_TEMPLATE.exec(rest);
  if (template) {
    const [name, team = ""] = [
      template[1].toLowerCase(),
      template[2].split("|")[0].trim(),
    ];
    return (name === "fb" || name === "nft") && /^(?:tun|tunisia)$/i.test(team)
      ? "senior"
      : "other";
  }
  if (rest.includes("{{")) return null;
  const text = plainText(rest);
  if (text === "") return null;
  return /^tunisia$/i.test(text) ? "senior" : "other";
}

export function readCurrentClub(
  text: string,
  staff: RegExp,
  nationalTeam: RegExp,
): { title: string | null; staff: boolean } {
  const plain = plainText(text);
  if (NO_CLUB.test(plain)) return { title: null, staff: false };
  const link = links(text)[0];
  if (
    staff.test(plain) ||
    (link !== undefined && nationalTeam.test(link.title))
  ) {
    return { title: null, staff: true };
  }
  return { title: link?.title ?? plain, staff: false };
}

/** The lowest-numbered non-empty `family<n>` with n above the limit. */
function beyondLimit(
  params: Map<string, string>,
  family: string,
  limit: number,
): { field: string; raw: string } | null {
  let first: { n: number; field: string; raw: string } | null = null;
  for (const [key, value] of params) {
    const suffix = key.startsWith(family) ? key.slice(family.length) : "";
    const n = /^\d+$/.test(suffix) ? Number(suffix) : 0;
    if (n > limit && value !== "" && (first === null || n < first.n)) {
      first = { n, field: key, raw: clip(value) };
    }
  }
  return first && { field: first.field, raw: first.raw };
}

export function parseEnInfobox(
  title: string,
  wikitext: string,
): Infobox | null {
  const body = findTemplate(wikitext, TEMPLATE);
  if (body === null) return null;
  const params = splitParams(body);
  const get = (key: string) => params.get(key) ?? "";

  // Skipped rows are named by their numbered parameter: clubs3, nationalteam2.
  const skipped: SkippedRow[] = [];
  const spells: Spell[] = [];
  for (let n = 1; n <= CLUB_ROWS; n++) {
    const clubs = get(`clubs${n}`);
    if (clubs === "") continue;
    const link = links(clubs)[0];
    const name =
      link?.title ??
      plainText(clubs)
        .replace(/^→\s*/, "")
        .replace(/\s*\(loan\)\s*$/i, "");
    if (name === "") {
      skipped.push({ field: `clubs${n}`, raw: clip(clubs), reason: "no-club" });
      continue;
    }
    const years = parseYears(get(`years${n}`));
    spells.push({
      clubTitle: name,
      from: years.from,
      to: years.to,
      apps: intOrNull(get(`caps${n}`)),
      goals: intOrNull(get(`goals${n}`)),
      loan: /→|\(loan\)/i.test(clubs),
    });
  }

  let caps: number | null = null;
  let goals: number | null = null;
  let nationalOpen = false;
  for (let n = 1; n <= NATIONAL_ROWS; n++) {
    const team = get(`nationalteam${n}`);
    if (team === "") continue;
    // A linked cell is always a named team; an unlinked one is recognised or
    // reported, so "no senior row" never hides a row the parser missed.
    const kind =
      links(team).length > 0
        ? isSeniorTunisia(team, "Tunisia", "Tunisia national football team")
          ? "senior"
          : "other"
        : unlinkedTeam(team);
    if (kind === null) {
      skipped.push({
        field: `nationalteam${n}`,
        raw: clip(team),
        reason: "no-club",
      });
      continue;
    }
    if (kind === "other") continue;
    const rowCaps = intOrNull(get(`nationalcaps${n}`));
    if (rowCaps !== null) caps = (caps ?? 0) + rowCaps;
    const rowGoals = intOrNull(get(`nationalgoals${n}`));
    if (rowGoals !== null) goals = (goals ?? 0) + rowGoals;
    nationalOpen ||= parseYears(get(`nationalyears${n}`)).open;
  }
  if (caps !== null && goals === null) goals = 0;
  for (const [family, limit] of [
    ["clubs", CLUB_ROWS],
    ["nationalteam", NATIONAL_ROWS],
  ] as const) {
    const beyond = beyondLimit(params, family, limit);
    if (beyond) skipped.push({ ...beyond, reason: "limit" });
  }

  const current = readCurrentClub(get("currentclub"), STAFF, NATIONAL_TEAM);
  return {
    lang: "en",
    title,
    currentClub: current.title,
    currentClubIsStaff: current.staff,
    positionText: plainText(get("position")) || null,
    spells,
    caps,
    goals,
    nationalOpen,
    clubsAsOf: parseEnDate(get("pcupdate") || get("club-update")),
    capsAsOf: parseEnDate(get("ntupdate") || get("nationalteam-update")),
    skipped,
    // splitParams writes "birth_date" as "birth date".
    birthDate: parseEnBirth(get("birth date")),
  };
}
