import type { Line, Tile, TileRow } from "@/engine/chkoun/types.ts";
import type { Locale } from "@/i18n/locales";
import type { GovernorateRow, Pool } from "@/pipeline/types.ts";

// What the tiles and the card print, per locale (plan Task 12). The page
// builds the tables once at build time from data/pool.json and the
// governorates; the browser only looks values up. Club and governorate names
// come from the data (Arabic on /ar, Latin on /tn, French on /fr, each
// falling back to Latin); country names from Jalel's files for the two
// Derja locales and from Intl.DisplayNames for French (D-S2-12).

export type Labels = {
  clubs: Record<string, string>;
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
 * birth countries abroad of the active footballers (the guessable ones;
 * the answer is one of them).
 */
export function shownCountryCodes(pool: Pool): string[] {
  const clubs = new Map(pool.clubs.map((c) => [c.id, c]));
  const codes = new Set<string>();
  for (const p of pool.players) {
    if (!p.pools.active) continue;
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
): Labels {
  const active = pool.players.filter((p) => p.pools.active);
  const clubIds = new Set(active.map((p) => p.clubId));
  const clubs: Record<string, string> = {};
  for (const c of pool.clubs)
    if (clubIds.has(c.id)) clubs[c.id] = localName(c, locale);
  const govs: Record<string, string> = {};
  for (const g of governorates) govs[g.id] = localName(g, locale);
  const countries: Record<string, string> = {};
  for (const code of shownCountryCodes(pool))
    countries[code] = derjaCountries?.[code] ?? frenchCountryName(code);
  return { clubs, governorates: govs, countries };
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
  caps: Record<"band0" | "band1" | "band2" | "band3" | "band4", string>;
  abroad: string;
  noClub: string;
};

/**
 * The text a tile shows, and for an unknown club the words a screen reader
 * says instead of "?". A value missing from the tables falls back to its
 * code, never to nothing.
 */
export function tileText(
  column: TileColumn,
  tile: Tile,
  labels: Labels,
  strings: TileStrings,
): { text: string; label: string | null } {
  const v = tile.value;
  if (v === null)
    return { text: "?", label: column === "club" ? strings.noClub : null };
  switch (column) {
    case "club":
      return { text: labels.clubs[String(v)] ?? String(v), label: null };
    case "country":
      return { text: labels.countries[String(v)] ?? String(v), label: null };
    case "position":
      return {
        text: strings.positions[v as Line] ?? String(v),
        label: null,
      };
    case "age":
      return { text: String(v), label: null };
    case "caps": {
      const band = `band${v}` as keyof TileStrings["caps"];
      return { text: strings.caps[band] ?? String(v), label: null };
    }
    case "governorate":
      return { text: birthText(String(v), labels, strings), label: null };
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
