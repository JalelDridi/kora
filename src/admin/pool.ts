// What the admin pages show of the pool, as pure functions: the filters read
// from the query string, the summary, and the words for sources and levels.
// Imports only types and pure helpers from the pipeline (decision P16 page).

import { isDeepStrictEqual } from "node:util";
import { FIELDS } from "@/admin/edit/overrides-patch.ts";
import type { DiffLine, FieldChange } from "@/admin/edit/overrides-patch.ts";
import { CROSS_CHECKED, SINGLE_SOURCE } from "@/pipeline/confidence.ts";
import type { PlayerOverride } from "@/pipeline/overrides.ts";
import { SKIP_KINDS, sourceNames } from "@/pipeline/report.ts";
import { confidences, droppedReasons } from "@/pipeline/types.ts";
import type {
  Confidence,
  Flag,
  Pool,
  PoolDropped,
  PoolPlayer,
  Provenance,
  ProvenancedField,
  SourceId,
} from "@/pipeline/types.ts";

export { CROSS_CHECKED, sourceNames };

/** Every field with a confidence, in the order the pages list them. */
export const RATED_FIELDS: readonly ProvenancedField[] = [
  ...CROSS_CHECKED,
  ...SINGLE_SOURCE,
];

/** Flags for rows a parser could not use: skipped infobox rows and undated French spells. */
export const ROW_KINDS: readonly string[] = [...SKIP_KINDS, "fr-undated-spell"];

export const PAGE_SIZE = 50;

/** Short names for the compact indicator in the table. */
export const SHORT: Record<ProvenancedField, string> = {
  caps: "caps",
  goals: "goals",
  clubId: "club",
  birthDate: "born",
  position: "pos",
  positionDetail: "pos detail",
  history: "career",
  nameLatin: "name",
  governorate: "gov",
  birthPlace: "birthplace",
  nameArabic: "arabic",
  photo: "photo",
  pools: "pools",
};

export const FIELD_LABEL: Record<ProvenancedField, string> = {
  nameLatin: "Latin name",
  nameArabic: "Arabic name",
  position: "Position",
  positionDetail: "Detailed position",
  birthDate: "Birth date",
  birthPlace: "Birthplace",
  governorate: "Governorate",
  clubId: "Current club",
  caps: "Caps",
  goals: "Goals",
  history: "Career",
  photo: "Photo",
  pools: "Pools",
};

/** A level as the pages print it; a field without one has "no entry". */
export function confidenceLabel(confidence: Confidence | undefined | null) {
  return confidence ?? "no entry";
}

/** "none" is not a source: it prints as "no source". */
export function sourceLabel(source: SourceId | undefined): string {
  if (source === undefined) return "no entry";
  return source === "none" ? "no source" : source;
}

/** The provenance entry's line in the detail view; "pools" only exists when an override placed him. */
export function provenanceLabel(field: ProvenancedField): string {
  return field === "pools" ? "placed by an override" : FIELD_LABEL[field];
}

export type PoolName = "active" | "legend";

export type Filters = {
  confidence: Confidence | null;
  /** Narrows the confidence filter to one field; null means any cross-checked field. */
  field: ProvenancedField | null;
  pool: PoolName | null;
  flag: string | null;
  q: string;
  page: number;
};

export type Query = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

/** Reads the filters from the query string; anything unknown is ignored. */
export function parseFilters(query: Query): Filters {
  const confidence = one(query.confidence);
  const field = one(query.field);
  const pool = one(query.pool);
  const flag = one(query.flag);
  const page = Number(one(query.page));
  return {
    confidence: (confidences as readonly string[]).includes(confidence ?? "")
      ? (confidence as Confidence)
      : null,
    field: (RATED_FIELDS as readonly string[]).includes(field ?? "")
      ? (field as ProvenancedField)
      : null,
    pool: pool === "active" || pool === "legend" ? pool : null,
    flag: flag && /^[a-z0-9-]{1,60}$/.test(flag) ? flag : null,
    q: (one(query.q) ?? "").trim().slice(0, 100),
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** The query string for these filters, page 1 left out; "" when there is none. */
export function toQuery(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.confidence) params.set("confidence", filters.confidence);
  if (filters.field) params.set("field", filters.field);
  if (filters.pool) params.set("pool", filters.pool);
  if (filters.flag) params.set("flag", filters.flag);
  if (filters.q) params.set("q", filters.q);
  if (filters.page > 1) params.set("page", String(filters.page));
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** Lower case, accents and Arabic vowel marks removed, so "Ali Maaloul" finds "Ali Maâloul". */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Flags about footballers, by Wikidata id. */
export function flagsBySubject(flags: Flag[]): Map<string, Flag[]> {
  const by = new Map<string, Flag[]>();
  for (const flag of flags) {
    by.set(flag.subject, [...(by.get(flag.subject) ?? []), flag]);
  }
  return by;
}

export function matches(
  player: PoolPlayer,
  filters: Filters,
  flags: Flag[],
): boolean {
  if (filters.pool && !player.pools[filters.pool]) return false;
  if (filters.flag && !flags.some((f) => f.kind === filters.flag)) return false;
  if (filters.confidence) {
    const fields = filters.field ? [filters.field] : CROSS_CHECKED;
    const at = fields.some(
      (field) => player.provenance[field]?.confidence === filters.confidence,
    );
    if (!at) return false;
  }
  if (filters.q) {
    const wanted = fold(filters.q);
    const names = [
      player.nameLatin,
      player.nameArabic,
      player.nameFrench,
      player.id,
      ...player.aliases,
    ];
    if (!names.some((name) => name !== null && fold(name).includes(wanted)))
      return false;
  }
  return true;
}

export type Page<T> = { items: T[]; page: number; pages: number };

/** One page of the list; a page past the end shows the last one. */
export function paginate<T>(
  list: T[],
  page: number,
  size = PAGE_SIZE,
): Page<T> {
  const pages = Math.max(1, Math.ceil(list.length / size));
  const shown = Math.min(page, pages);
  return {
    items: list.slice((shown - 1) * size, shown * size),
    page: shown,
    pages,
  };
}

export type Summary = {
  players: number;
  active: number;
  legend: number;
  both: number;
  clubs: number;
  honours: number;
  flags: number;
  dropped: [PoolDropped["reason"], number][];
  /** The newest date any value was read; the pool file carries no build date. */
  newestRead: string | null;
};

export function summarize(pool: Pool): Summary {
  const dates = pool.players.flatMap((p) =>
    Object.values(p.provenance).map((e) => e.retrievedAt),
  );
  return {
    players: pool.players.length,
    active: pool.players.filter((p) => p.pools.active).length,
    legend: pool.players.filter((p) => p.pools.legend).length,
    both: pool.players.filter((p) => p.pools.active && p.pools.legend).length,
    clubs: pool.clubs.length,
    honours: pool.honours.length,
    flags: pool.flags.length,
    dropped: droppedReasons.map((reason) => [
      reason,
      pool.dropped.filter((d) => d.reason === reason).length,
    ]),
    newestRead: dates.length === 0 ? null : dates.sort().at(-1)!,
  };
}

/** Footballer flags by kind, most frequent first. */
export function flagKinds(pool: Pool): [string, number][] {
  const players = new Set(pool.players.map((p) => p.wikidataId));
  const counts = new Map<string, number>();
  for (const flag of pool.flags) {
    if (players.has(flag.subject))
      counts.set(flag.kind, (counts.get(flag.kind) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** The value of a field as the detail view prints it. */
export function fieldValue(
  player: PoolPlayer,
  field: ProvenancedField,
  clubName: (id: string) => string,
): string {
  switch (field) {
    case "caps":
      return `${player.caps}${player.capsAsOf ? ` (as of ${player.capsAsOf})` : ""}`;
    case "goals":
      return String(player.goals);
    case "clubId":
      return player.clubId ? clubName(player.clubId) : "none";
    case "history":
      return `${player.history.length} spells`;
    case "photo":
      return player.photo?.file ?? "none";
    case "pools":
      return poolsLabel(player);
    case "nameArabic":
      return player.nameArabic ?? "none";
    case "birthPlace":
      return (
        [player.birthPlace, player.birthCountry].filter(Boolean).join(", ") ||
        "none"
      );
    default:
      return player[field] ?? "none";
  }
}

export function poolsLabel(player: PoolPlayer): string {
  return [
    player.pools.active && "active",
    player.pools.legend && "legend",
    // P54: out of the active pool, still guessable until then.
    player.pools.graceUntil && `grace until ${player.pools.graceUntil}`,
  ]
    .filter(Boolean)
    .join(", ");
}

/** Every provenance entry of a footballer, in page order; "pools" last when present. */
export function provenanceRows(
  player: PoolPlayer,
): [ProvenancedField, Provenance | undefined][] {
  const fields: ProvenancedField[] = [...RATED_FIELDS];
  if (player.provenance.pools) fields.push("pools");
  return fields.map((field) => [field, player.provenance[field]]);
}

const wiki = (lang: "en" | "fr", title: string) =>
  `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`;

export function articleLinks(
  player: PoolPlayer,
): { label: string; href: string }[] {
  const links = [];
  if (player.wiki.en)
    links.push({
      label: "English Wikipedia",
      href: wiki("en", player.wiki.en),
    });
  if (player.wiki.fr)
    links.push({ label: "French Wikipedia", href: wiki("fr", player.wiki.fr) });
  links.push({
    label: "Wikidata",
    href: `https://www.wikidata.org/wiki/${encodeURIComponent(player.wikidataId)}`,
  });
  return links;
}

// The footballer editor (/admin/footballers/[qid]): one row per override
// field, with today's value in the deployed pool, where it came from, and
// the override in force on main.

export type OverrideField = (typeof FIELDS)[number];

export const OVERRIDE_LABEL: Record<OverrideField, string> = {
  club: "Club",
  position: "Position",
  positionDetail: "Detailed position",
  caps: "Caps",
  goals: "Goals",
  capsAsOf: "Caps as of",
  birthDate: "Birth date",
  governorate: "Governorate",
  birthCountry: "Birth country",
  nameArabic: "Arabic name",
  aliases: "Aliases",
  pools: "Pools",
  exclude: "Exclude",
  localStar: "Local star",
};

/** The provenance entry that rates each field's value; none for the editor's own. */
const PROVENANCE_OF: Record<OverrideField, ProvenancedField | null> = {
  club: "clubId",
  position: "position",
  positionDetail: "positionDetail",
  caps: "caps",
  goals: "goals",
  capsAsOf: "caps",
  birthDate: "birthDate",
  governorate: "governorate",
  birthCountry: "birthPlace",
  nameArabic: "nameArabic",
  aliases: null,
  pools: "pools",
  exclude: null,
  localStar: null,
};

export type Names = {
  /** A club's name by its Wikidata id (overrides name clubs by Wikidata id). */
  club: (id: string) => string | undefined;
  /** A club's Wikidata id by the pool's slug (a footballer's clubId). */
  clubQid: (slug: string) => string | undefined;
  governorate: (id: string) => string | undefined;
};

export type OverrideRow = {
  field: OverrideField;
  label: string;
  /** Today's value as the form and the patch hold it; undefined when he is not in the pool. */
  today: unknown;
  todayText: string;
  provenance: Provenance | undefined;
  override: {
    value: unknown;
    text: string;
    by: string;
    at: string;
    note?: string;
  } | null;
};

function todayOf(
  player: PoolPlayer,
  field: OverrideField,
  names: Names,
): unknown {
  switch (field) {
    case "club":
      return player.clubId === null
        ? null
        : (names.clubQid(player.clubId) ?? player.clubId);
    case "pools":
      return { active: player.pools.active, legend: player.pools.legend };
    case "exclude":
      return false;
    case "localStar":
      return player.fame?.localStar ?? false;
    default:
      return player[field];
  }
}

/** A value as the editor prints it: names for clubs and governorates. */
export function overrideText(
  field: OverrideField,
  value: unknown,
  names: Names,
): string {
  if (value === null || value === undefined) return "none";
  if (field === "club" && typeof value === "string")
    return names.club(value) ?? value;
  if (field === "governorate" && typeof value === "string")
    return names.governorate(value) ?? value;
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value))
    return value.length === 0 ? "none" : value.map(String).join(", ");
  if (field === "pools" && typeof value === "object") {
    const pools = value as { active?: boolean; legend?: boolean };
    return (
      [pools.active && "active", pools.legend && "legend"]
        .filter(Boolean)
        .join(" and ") || "none"
    );
  }
  return String(value);
}

/** Per field: today's value, its source and confidence, the override in force (null: none). */
export function overrideRows(
  player: PoolPlayer | null,
  entry: PlayerOverride | undefined,
  names: Names,
): OverrideRow[] {
  return FIELDS.map((field) => {
    const today = player ? todayOf(player, field, names) : undefined;
    const source = PROVENANCE_OF[field];
    const override = entry?.[field];
    return {
      field,
      label: OVERRIDE_LABEL[field],
      today,
      todayText: player ? overrideText(field, today, names) : "not in the pool",
      provenance: player && source ? player.provenance[source] : undefined,
      override: override
        ? {
            value: override.value,
            text: overrideText(field, override.value, names),
            by: override.by,
            at: override.at,
            ...(override.note === undefined ? {} : { note: override.note }),
          }
        : null,
    };
  });
}

/** A value as the form's input holds it ("none" picks the select's none). */
export function formValue(field: OverrideField, value: unknown): string {
  if (value === undefined) return "";
  if (value === null)
    return field === "club" || field === "governorate" ? "none" : "";
  if (Array.isArray(value)) return value.map(String).join("\n");
  return String(value);
}

/**
 * An input left at today's value, with no override in force, writes
 * nothing: the form sends every field, pre-filled, and only a real
 * difference becomes an override.
 */
export function dropUnchanged(
  changes: FieldChange[],
  rows: OverrideRow[],
): FieldChange[] {
  const by = new Map(rows.map((row) => [row.field as string, row]));
  return changes.filter((change) => {
    if ("remove" in change) return true;
    const row = by.get(change.field);
    if (!row || row.override || row.today === undefined) return true;
    return !isDeepStrictEqual(change.to, row.today);
  });
}

/** The diff's "before" of a field with no override is today's value, not "none". */
export function diffAgainstToday(
  diff: DiffLine[],
  rows: OverrideRow[],
): DiffLine[] {
  const by = new Map(rows.map((row) => [row.field as string, row]));
  return diff.map((line) => {
    const row = by.get(line.path.split(".").at(-1) ?? "");
    return row && !row.override && row.today !== undefined
      ? { ...line, before: row.todayText }
      : line;
  });
}
