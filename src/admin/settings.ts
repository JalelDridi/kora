import type { CuratedId } from "./edit/curated-patch.ts";

// What the settings pages call the six curated files (Task 6): a name, the
// sentence the list and each page lead with, and a row's fields' labels.
// The admin is English and not translated; the words are Jalel's to change
// (Open 11).

export const SETTINGS_TITLE: Record<CuratedId, string> = {
  "ligue1-strength": "Ligue 1 strength",
  "club-short": "Short club labels",
  honours: "Honours",
  "afcon-2004": "AFCON 2004 squad",
  "ligue1-clubs": "Ligue 1 clubs",
  governorates: "Governorates",
};

export const SETTINGS_BLURB: Record<CuratedId, string> = {
  "ligue1-strength":
    "Each Ligue 1 club's strength this season, 55 (weakest) to 90: 30–0 rates its candidates with it.",
  "club-short":
    "What a Chkoun? tile and a 30–0 match row print when a club's full name does not fit: at most two words, 7 Latin or 8 Arabic letters each.",
  honours:
    "The editions each club won (Ligue 1, the Cup, the CAF competitions), each stamped with who added it.",
  "afcon-2004": "The AFCON 2004 winners, by Wikidata id: 30–0 rates them up.",
  "ligue1-clubs":
    "This season's Ligue 1 clubs, by English Wikipedia title: the nightly build reads them.",
  governorates:
    "The 24 governorates and their regions, in three languages. There are always 24: rows are edited, never added or removed.",
};

export const FIELD_LABEL: Record<string, string> = {
  id: "Id",
  strength: "Strength",
  latin: "Latin",
  arabic: "Arabic",
  competition: "Competition",
  seasonStart: "Season start",
  seasonEnd: "Season end",
  clubWikidataId: "Club",
  title: "English Wikipedia title",
  nameLatin: "Latin name",
  nameArabic: "Arabic name",
  nameFrench: "French name",
  region: "Region",
};

export const COMPETITION_LABEL: Record<string, string> = {
  tn_ligue1: "Ligue 1",
  tn_cup: "Tunisian Cup",
  caf_cl: "CAF Champions League",
  caf_cc: "CAF Confederation Cup",
};

/** A short label's words and its longest word's letters, as the validator counts them. */
export function shortCount(value: string, most: number): string {
  const words = value.split(/\s+/).filter(Boolean);
  const longest = Math.max(0, ...words.map((w) => [...w].length));
  const counted =
    words.length === 1
      ? `1 word, ${longest} letters`
      : `${words.length} words, longest ${longest} letters`;
  return `${counted} (at most 2 words of ${most})`;
}

/**
 * club-short's filter (`?q=`): keeps a row whose club name, id, Latin or
 * Arabic label holds the query, ignoring case. A blank query keeps all.
 */
export function clubShortFilter(
  q: string,
  clubName: (id: string) => string | undefined,
): (row: Record<string, unknown>) => boolean {
  const needle = q.trim().toLowerCase();
  return (row) =>
    needle === "" ||
    [clubName(String(row.id)), row.id, row.latin, row.arabic].some(
      (value) =>
        typeof value === "string" && value.toLowerCase().includes(needle),
    );
}
