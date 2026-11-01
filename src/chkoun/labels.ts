import type { Line, Tile, TileRow } from "@/engine/chkoun/types.ts";
import type { Locale } from "@/i18n/locales";
import { isGuessable } from "@/pipeline/grace.ts";
import type { ClubShortFile } from "@/pipeline/check.ts";
import type { GovernorateRow, Pool } from "@/pipeline/types.ts";
import { autoShort } from "@/pipeline/short-label.ts";

// What the tiles and the card print, per locale (plan Task 12). The page
// builds the tables once at build time from data/pool.json and the
// governorates; the browser only looks values up. Club and governorate names
// come from the data (Arabic on /ar, Latin on /tn, French on /fr, each
// falling back to Latin); country names from Jalel's files for the two
// Derja locales and from Intl.DisplayNames for French (D-S2-12).

export type Labels = {
  clubs: Record<string, string>;
  /**
   * A club's short label for a tile (club-short.json, D-MP-1), else an
   * automatic one (src/pipeline/short-label.ts); absent when the full name fits as it is.
   */
  short: Record<string, string>;
  governorates: Record<string, string>;
  countries: Record<string, string>;
};

type Named = {
  nameLatin: string;
  nameArabic: string | null;
  nameFrench: string | null;
};

/** A name in the locale's script: Arabic on /ar, French on /fr, else Latin. */
export function localName(named: Named, locale: Locale): string {
  if (locale === "ar-TN") return named.nameArabic ?? named.nameLatin;
  if (locale === "fr") return named.nameFrench ?? named.nameLatin;
  return named.nameLatin;
}

export function frenchCountryName(code: string): string {
  return new Intl.DisplayNames(["fr"], { type: "region" }).of(code) ?? code;
}

/**
 * Every country the game can print: the current clubs' countries and the
 * birth countries abroad of the guessable footballers (the active pool and
 * those in grace, P54; the answer is one of them).
 */
export function shownCountryCodes(pool: Pool): string[] {
  const clubs = new Map(pool.clubs.map((c) => [c.id, c]));
  const codes = new Set<string>();
  for (const p of pool.players) {
    if (!isGuessable(p.pools)) continue;
    const club = p.clubId ? clubs.get(p.clubId) : undefined;
    if (club) codes.add(club.country);
    if (p.birthCountry && p.birthCountry !== "TN") codes.add(p.birthCountry);
  }
  return [...codes].sort();
}

export function buildLabels(
  pool: Pool,
  governorates: GovernorateRow[],
  locale: Locale,
  /** Jalel's country names for a Derja locale; null for French. */
  derjaCountries: Record<string, string> | null,
  /** data/curated/club-short.json's clubs. */
  clubShort: ClubShortFile["clubs"] = {},
): Labels {
  const guessable = pool.players.filter((p) => isGuessable(p.pools));
  const clubIds = new Set(guessable.map((p) => p.clubId));
  const clubs: Record<string, string> = {};
  const short: Record<string, string> = {};
  for (const c of pool.clubs) {
    if (!clubIds.has(c.id)) continue;
    clubs[c.id] = localName(c, locale);
    const s = shortName(clubShort, c.id, locale, clubs[c.id]);
    if (s !== clubs[c.id]) short[c.id] = s;
  }
  const govs: Record<string, string> = {};
  for (const g of governorates) govs[g.id] = localName(g, locale);
  const countries: Record<string, string> = {};
  for (const code of shownCountryCodes(pool))
    countries[code] = derjaCountries?.[code] ?? frenchCountryName(code);
  return { clubs, short, governorates: govs, countries };
}

/**
 * A club's short label in the locale's script: the curated one (the Derja
 * nickname on /ar, else the Latin one) when club-short.json lists the club,
 * else the automatic one made from `name`, the club's full name as the
 * locale prints it (the name itself when it fits).
 */
export function shortName(
  clubShort: ClubShortFile["clubs"],
  id: string,
  locale: Locale,
  name: string,
): string {
  const forms = clubShort[id];
  if (!forms) return autoShort(name);
  return locale === "ar-TN" ? forms.arabic : forms.latin;
}

/** The longest country name a tile prints before falling back to its ISO code. */
const SHORT_COUNTRY = 8;

function shortCountry(code: string, labels: Labels): string {
  const name = labels.countries[code] ?? code;
  return [...name].length <= SHORT_COUNTRY ? name : code;
}

/** "{n} of 8" with its values: the only templating the game needs. */
export function format(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}

export type TileColumn = keyof TileRow;

/** Club to governorate: the order of the grid and of the share text (N6). */
export const COLUMNS: readonly TileColumn[] = [
  "club",
  "country",
  "position",
  "age",
  "caps",
  "governorate",
];

export type TileStrings = {
  positions: Record<Line, string>;
  /** The line as a six-column tile prints it (messages positions.short). */
  positionsShort: Record<Line, string>;
  caps: Record<"band0" | "band1" | "band2" | "band3" | "band4", string>;
  abroad: string;
  noClub: string;
};

/**
 * The text of a tile: `text`, the whole value (the tile's title, the screen
 * reader and the card); `short`, what the tile shows (D-MP-1: a club's short
 * label, a country of more than 8 characters as its ISO code, a birthplace
 * abroad as its country only, by the same rule); and for an unknown club the words a screen
 * reader says instead of "?". A value missing from the tables falls back to
 * its code, never to nothing.
 */
export function tileText(
  column: TileColumn,
  tile: Tile,
  labels: Labels,
  strings: TileStrings,
): { text: string; short: string; label: string | null } {
  const v = tile.value;
  if (v === null)
    return {
      text: "?",
      short: "?",
      label: column === "club" ? strings.noClub : null,
    };
  const same = (text: string) => ({ text, short: text, label: null });
  switch (column) {
    case "club": {
      const text = labels.clubs[String(v)] ?? String(v);
      return { text, short: labels.short?.[String(v)] ?? text, label: null };
    }
    case "country":
      return {
        text: labels.countries[String(v)] ?? String(v),
        short: shortCountry(String(v), labels),
        label: null,
      };
    case "position":
      return {
        text: strings.positions[v as Line] ?? String(v),
        short:
          strings.positionsShort?.[v as Line] ??
          strings.positions[v as Line] ??
          String(v),
        label: null,
      };
    case "age":
      return same(String(v));
    case "caps": {
      const band = `band${v}` as keyof TileStrings["caps"];
      return same(strings.caps[band] ?? String(v));
    }
    case "governorate": {
      const value = String(v);
      const text = birthText(value, labels, strings);
      return {
        text,
        short: value.startsWith("abroad:")
          ? shortCountry(value.slice(7), labels)
          : text,
        label: null,
      };
    }
  }
}

/** `gov:<id>` or `abroad:<XX>`, as the tile and the card print it. */
export function birthText(
  value: string,
  labels: Labels,
  strings: Pick<TileStrings, "abroad">,
): string {
  if (value.startsWith("gov:")) {
    const id = value.slice(4);
    return labels.governorates[id] ?? id;
  }
  if (value.startsWith("abroad:")) {
    const code = value.slice(7);
    return format(strings.abroad, { country: labels.countries[code] ?? code });
  }
  return value;
}
