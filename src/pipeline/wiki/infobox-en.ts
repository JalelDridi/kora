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
  stripNoise,
} from "./wikitext.ts";

const TEMPLATE = /^infobox football biography$/i;
const STAFF =
  /\((?=[^)]*\b(?:analyst|coach|manager|assistant|director|scout|staff|ambassador|technical|president|chairman|supervisor|adviser|advisor)\b)[^)]*\)/i;
const NATIONAL_TEAM = /national (?:under-\d+ )?(?:football|soccer) team/i;
const CLUB_ROWS = 40;
const NATIONAL_ROWS = 20;
const NO_CLUB =
  /^(?:|retired|free agent|unattached|none|retraité|libre|sans club|-|—)$/i;

const SENIOR_ARTICLE = "Tunisia national football team";
/** Names of the senior team, as a cell or a link label may write it. */
const SENIOR_NAME =
  /^(?:tunisia|tunisia national football team|tunisia national team|tunisie|tun)$/i;
/** Youth and olympic teams: "Tunisia U17", "Tunisia U-20", "Tunisia Olympic". */
const YOUTH_NAME =
  /^tunisi[ae]\s+(?:national\s+)?(?:u\s?-?\s?\d{2}|under-?\s?\d{2}|olympic|olympique)\b/i;
/** Text that names Tunisia somehow: "Tunisia B", "Tunisia XI", "TUN A". */
const MENTIONS_TUNISIA = /tunis|\bTUN\b/;

/**
 * A team name as text: "senior" for the senior Tunisia team, "other" for a
 * Tunisian youth team or a team that does not name Tunisia, and null for a
 * Tunisia team the parser cannot place ("Tunisia B"), to be reported.
 */
function teamName(text: string): "senior" | "other" | null {
  const name = text.trim();
  if (SENIOR_NAME.test(name)) return "senior";
  if (YOUTH_NAME.test(name)) return "other";
  if (/tunis/i.test(name) || MENTIONS_TUNISIA.test(name)) return null;
  return name === "" ? null : "other";
}

/** Redirects to the senior article met in the cache (en/najeh-braham). */
const SENIOR_REDIRECTS = new Set(["Tunisian national football team"]);
/** An article about a youth or olympic team, whatever its label says. */
const YOUTH_ARTICLE = /\b(?:under-?\s?\d+|u-?\d+|olympic|youth)\b/i;
/** An article about some national team ("… national football team"). */
const NATIONAL_ARTICLE = /\bnational\b.*\bteam\b|\bolympic\b/i;

/**
 * A nationalteamN cell: "senior", "other", or null for a row to report.
 * A link to the senior article is read by its label (youth labels are other
 * teams: en/youssef-msakni links "Tunisia U17" there). A link to a youth or
 * olympic article is another team whatever its label. A link to any other
 * article counts as senior only when labelled exactly "Tunisia" and the
 * article is a known redirect to the senior one or no national-team article
 * at all; another national-team article labelled "Tunisia" is reported.
 */
export function nationalTeam(cell: string): "senior" | "other" | null {
  const link = links(cell)[0];
  if (!link) return unlinkedTeam(cell);
  if (link.title === SENIOR_ARTICLE) return teamName(link.label);
  if (YOUTH_ARTICLE.test(link.title)) return "other";
  if (link.label !== "Tunisia") return "other";
  if (SENIOR_REDIRECTS.has(link.title) || !NATIONAL_ARTICLE.test(link.title))
    return "senior";
  return null;
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
  const rest = stripNoise(cell)
    .trim()
    .replace(FLAG_ICON, "")
    .replace(FLAG_CODE, "");
  const template = TEAM_TEMPLATE.exec(rest);
  if (template) {
    const [name, team = ""] = [
      template[1].toLowerCase(),
      template[2].split("|")[0].trim(),
    ];
    if (name === "fb" || name === "nft") {
      if (/^(?:tun|tunisia)$/i.test(team)) return "senior";
      return /tunis/i.test(team) || MENTIONS_TUNISIA.test(team)
        ? null
        : "other";
    }
    return "other"; // {{fbu|23|TUN}}, {{fbw|…}}: youth or women's teams
  }
  if (rest.includes("{{")) return null;
  return teamName(plainText(rest));
}

export type CurrentClub = {
  title: string | null;
  staff: boolean;
  /** The English title of a club named by a French {{Lien}}. */
  foreign?: string;
  /** The club a staff post names, when it names one (not a national team). */
  staffClub?: string;
};

/**
 * The current-club field: none, a staff post (with the club it names), or a
 * club. `read` reads the club from the text; by default the first link, else
 * the plain text (English). The French parser passes its career-cell reader.
 */
export function readCurrentClub(
  text: string,
  staff: RegExp,
  nationalTeam: RegExp,
  read: (text: string) => { title: string; foreign?: string } = (t) => ({
    title: links(t)[0]?.title ?? plainText(t),
  }),
): CurrentClub {
  const plain = plainText(text);
  const club = read(text);
  if (NO_CLUB.test(plain) && NO_CLUB.test(club.title.trim()))
    return { title: null, staff: false };
  const link = links(text)[0];
  if (link !== undefined && nationalTeam.test(link.title))
    return { title: null, staff: true };
  if (staff.test(plain)) {
    return link === undefined
      ? { title: null, staff: true }
      : { title: null, staff: true, staffClub: link.title };
  }
  return club.foreign === undefined
    ? { title: club.title, staff: false }
    : { title: club.title, staff: false, foreign: club.foreign };
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
  let seniorRow = false;
  /** The latest end year of the senior rows; null once one is open or unreadable. */
  let nationalEnd: number | null | undefined;
  /** The earliest start year of the senior rows. */
  let nationalStart: number | null = null;
  for (let n = 1; n <= NATIONAL_ROWS; n++) {
    const team = get(`nationalteam${n}`);
    // A cell empty but for comments or refs is no row.
    if (stripNoise(team).trim() === "") continue;
    // Every row is read as a team or reported, so "no senior row" never
    // hides a Tunisia row the parser missed.
    const kind = nationalTeam(team);
    if (kind === null) {
      skipped.push({
        field: `nationalteam${n}`,
        raw: clip(team),
        reason: "no-club",
      });
      continue;
    }
    if (kind === "other") continue;
    seniorRow = true;
    const rowCaps = intOrNull(get(`nationalcaps${n}`));
    if (rowCaps !== null) caps = (caps ?? 0) + rowCaps;
    const rowGoals = intOrNull(get(`nationalgoals${n}`));
    if (rowGoals !== null) goals = (goals ?? 0) + rowGoals;
    const years = parseYears(get(`nationalyears${n}`));
    nationalOpen ||= years.open;
    if (years.from !== null)
      nationalStart = Math.min(nationalStart ?? years.from, years.from);
    nationalEnd =
      nationalEnd === null || years.to === null
        ? null
        : Math.max(nationalEnd ?? years.to, years.to);
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
    ...(current.staffClub === undefined
      ? {}
      : { staffClub: current.staffClub }),
    positionText: plainText(get("position")) || null,
    spells,
    caps,
    goals,
    nationalOpen,
    nationalEnd: nationalEnd ?? null,
    nationalStart,
    clubsAsOf: parseEnDate(get("pcupdate") || get("club-update")),
    capsAsOf: parseEnDate(get("ntupdate") || get("nationalteam-update")),
    skipped,
    // splitParams writes "birth_date" as "birth date".
    birthDate: parseEnBirth(get("birth date")),
    seniorRow,
  };
}
