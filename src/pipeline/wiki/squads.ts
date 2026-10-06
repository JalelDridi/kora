import { daysBetween } from "../confidence.ts";
import { parseEnDate } from "./dates.ts";
import {
  findTemplate,
  findTemplates,
  links,
  plainText,
  splitParams,
  stripNoise,
} from "./wikitext.ts";

// Decision P42 (P47 for the rules): the squad lists of English and French
// Wikipedia, read as a dated witness. Three kinds (S2): an English club's
// "Current squad" ({{Fs player}}), a French club's "Effectif professionnel"
// ({{Feff joueur}}), and the English national team's "Current squad"
// ({{nat fs g player}}). A list is dated by its own date or season label,
// never by the page's last edit (S3 to S5). Pure.

export type SquadRow = {
  /** The name as the list shows it (a link's label, or the plain text). */
  name: string;
  /** The link target, normalized; null for a name in plain text. */
  link: string | null;
  /** The current squad; out on loan; any other list (under contract, reserves). */
  part: "squad" | "loan" | "other";
  nat?: string;
  pos?: string;
  number?: number;
  /** French club rows and national rows: ISO birth date, when given. */
  birthDate?: string;
  /** National rows only. */
  caps?: number;
  goals?: number;
  /** National rows only: the link target of the club column. */
  clubLink?: string;
};

export type SquadList = {
  lang: "en" | "fr";
  /** The article's title, as the answer gives it (after redirects). */
  page: string;
  kind: "club" | "national";
  /** The list's own date (English `{{updated}}` or "as of"; a French season's 1 July; the national "correct as of"). */
  date: string | null;
  /** The French season label, "2026-2027"; null elsewhere or when absent. */
  season: string | null;
  /** `none`: the page has no list this parser reads. */
  status: "current" | "stale" | "undated" | "none";
  /** Tunisian rows only. */
  rows: SquadRow[];
};

/** S4: a list older than this is stale (the national table's club column too). */
export const SQUAD_DAYS = 120;

const TUNISIAN = /^(?:TUN|Tunisie|Tunisia)$/i;

type Heading = { level: number; title: string; start: number; end: number };

function headings(wikitext: string): Heading[] {
  return [...wikitext.matchAll(/^(={2,6})\s*(.+?)\s*\1[ \t]*$/gm)].map((m) => ({
    level: m[1].length,
    title: plainText(m[2]),
    start: m.index,
    end: m.index + m[0].length,
  }));
}

/** The text of the section that opens with heading `i`, up to the next heading. */
function body(text: string, all: Heading[], i: number): string {
  return text.slice(all[i].end, all[i + 1]?.start ?? text.length);
}

/** The season that `today` falls in: it starts on 1 July (S4). */
export function currentSeason(today: string): string {
  const year = Number(today.slice(0, 4));
  const first = today.slice(5) >= "07-01" ? year : year - 1;
  return `${first}-${first + 1}`;
}

/** S4 and S5: whether a list counts tonight, by its own date or season. */
export function squadStatus(
  list: Pick<SquadList, "lang" | "kind" | "date" | "season"> & {
    status?: SquadList["status"];
  },
  today: string,
): SquadList["status"] {
  if (list.status === "none") return "none";
  if (list.lang === "fr") {
    if (list.season === null) return "undated";
    return list.season === currentSeason(today) ? "current" : "stale";
  }
  if (list.date === null) return "undated";
  const recent =
    list.date <= today && daysBetween(list.date, today) <= SQUAD_DAYS;
  if (list.kind === "national") return recent ? "current" : "stale";
  const seasonStart = `${currentSeason(today).slice(0, 4)}-07-01`;
  return recent && list.date >= seasonStart ? "current" : "stale";
}

const int = (text: string | undefined): number | undefined => {
  const m = /\d+/.exec(plainText(text ?? ""));
  return m ? Number(m[0]) : undefined;
};

/** The name a row shows and the article it links to. */
function nameAndLink(raw: string): { name: string; link: string | null } {
  const link = links(raw)[0];
  return { name: plainText(raw), link: link ? link.title : null };
}

const iso = (y?: number, m?: number, d?: number) =>
  y && m && d && m <= 12 && d <= 31
    ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    : undefined;

function enRow(params: Map<string, string>, part: SquadRow["part"]): SquadRow {
  const row: SquadRow = { ...nameAndLink(params.get("name") ?? ""), part };
  const nat = plainText(params.get("nat") ?? "");
  if (nat) row.nat = nat;
  const pos = plainText(params.get("pos") ?? "");
  if (pos) row.pos = pos;
  const no = int(params.get("no"));
  if (no !== undefined) row.number = no;
  return row;
}

const SQUAD = /^current squad$/i;
const LOAN = /^out on loan$/i;
const OTHER = /^(?:other players under contract|reserve team|reserves)$/i;

function englishClub(
  text: string,
): Omit<SquadList, "lang" | "page" | "kind" | "status"> & { found: boolean } {
  const all = headings(text);
  const at = all.findIndex((h) => SQUAD.test(h.title) && h.level <= 3);
  if (at === -1) return { found: false, date: null, season: null, rows: [] };
  const main = body(text, all, at);
  const updated = findTemplate(main, /^updated$/i);
  const asOf = /\bas of\s+([^'\n|}]*\d{4})/i.exec(stripNoise(main));
  const date = updated
    ? parseEnDate(splitParams(updated).get("1") ?? "")
    : asOf
      ? parseEnDate(asOf[1])
      : null;
  const parts: [string, SquadRow["part"]][] = [[main, "squad"]];
  // The sub-lists right after it: loans, then other players under contract.
  for (let i = at + 1; i < all.length; i++) {
    const part = LOAN.test(all[i].title)
      ? "loan"
      : OTHER.test(all[i].title)
        ? "other"
        : null;
    if (!part) break;
    parts.push([body(text, all, i), part]);
  }
  const rows = parts.flatMap(([section, part]) =>
    // {{Fs player}} and the template it redirects to, {{Football squad
    // player}} (squad-lists review, L6). {{Football squad2 player}} appears
    // only in the navbox templates of the recorded answers, never in a list.
    findTemplates(section, /^(?:fs player|football squad player)$/i).map((b) =>
      enRow(splitParams(b), part),
    ),
  );
  return { found: true, date, season: null, rows };
}

const FR_SQUAD = /^(?:effectif professionnel|effectif actuel)\b/i;
const SEASON = /(\d{4})\s*[-–]\s*(\d{4})/;

function frenchClub(
  text: string,
): Omit<SquadList, "lang" | "page" | "kind" | "status"> & { found: boolean } {
  const all = headings(text);
  const at = all.findIndex((h) => FR_SQUAD.test(h.title));
  if (at === -1) return { found: false, date: null, season: null, rows: [] };
  const section = body(text, all, at);
  const start = findTemplate(section, /^feff début$/i);
  const label =
    SEASON.exec(all[at].title) ??
    SEASON.exec(plainText(splitParams(start ?? "").get("saison") ?? ""));
  const season = label ? `${label[1]}-${label[2]}` : null;
  const rows = findTemplates(section, /^feff joueur$/i).map((b): SquadRow => {
    const p = splitParams(b);
    const name = plainText(`${p.get("prénom") ?? ""} ${p.get("nom") ?? ""}`);
    // [U] lien= names the article when it differs from "prénom nom".
    const lien = p.get("lien");
    const dab = plainText(p.get("dab") ?? "");
    const link =
      lien !== undefined && lien !== ""
        ? (links(lien)[0]?.title ?? plainText(lien))
        : /^oui$/i.test(p.get("nolink") ?? "")
          ? null
          : dab
            ? `${name} (${dab})`
            : name;
    const row: SquadRow = { name, link: link || null, part: "squad" };
    const nat = plainText(p.get("nat") ?? "");
    if (nat) row.nat = nat;
    const pos = plainText(p.get("pos") ?? "");
    if (pos) row.pos = pos;
    const num = int(p.get("num"));
    if (num !== undefined) row.number = num;
    const birth = iso(int(p.get("an")), int(p.get("mois")), int(p.get("jour")));
    if (birth) row.birthDate = birth;
    return row;
  });
  return {
    found: true,
    date: season ? `${season.slice(0, 4)}-07-01` : null,
    season,
    rows,
  };
}

function national(
  text: string,
): Omit<SquadList, "lang" | "page" | "kind" | "status"> & { found: boolean } {
  const all = headings(text);
  const at = all.findIndex((h) => SQUAD.test(h.title));
  if (at === -1) return { found: false, date: null, season: null, rows: [] };
  const section = body(text, all, at);
  const asOf = /correct as of\s+([^,.'\n]*\d{4})/i.exec(plainText(section));
  const rows = findTemplates(section, /^nat fs g player$/i).map(
    (b): SquadRow => {
      const p = splitParams(b);
      const row: SquadRow = {
        ...nameAndLink(p.get("name") ?? ""),
        part: "squad",
        nat: "TUN",
      };
      const pos = plainText(p.get("pos") ?? "");
      if (pos) row.pos = pos;
      const no = int(p.get("no"));
      if (no !== undefined) row.number = no;
      const age = findTemplate(p.get("age") ?? "", /^birth date and age$/i);
      if (age) {
        const a = splitParams(age);
        const birth = iso(int(a.get("1")), int(a.get("2")), int(a.get("3")));
        if (birth) row.birthDate = birth;
      }
      const caps = int(p.get("caps"));
      if (caps !== undefined) row.caps = caps;
      const goals = int(p.get("goals"));
      if (goals !== undefined) row.goals = goals;
      const club = links(p.get("club") ?? "")[0];
      if (club) row.clubLink = club.title;
      return row;
    },
  );
  return {
    found: true,
    date: asOf ? parseEnDate(asOf[1]) : null,
    season: null,
    rows,
  };
}

/** One page's list, its Tunisian rows only, with its status on `today`. */
export function parseSquadList(input: {
  lang: "en" | "fr";
  page: string;
  kind: "club" | "national";
  wikitext: string;
  today: string;
}): SquadList {
  const read =
    input.kind === "national"
      ? national(input.wikitext)
      : input.lang === "en"
        ? englishClub(input.wikitext)
        : frenchClub(input.wikitext);
  const list: SquadList = {
    lang: input.lang,
    page: input.page,
    kind: input.kind,
    date: read.date,
    season: read.season,
    status: read.found ? "undated" : "none",
    rows: read.rows.filter((r) => TUNISIAN.test(r.nat ?? "")),
  };
  list.status = squadStatus(list, input.today);
  return list;
}
