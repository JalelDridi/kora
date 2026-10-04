// What the admin pages show of the pool, as pure functions: the filters read
// from the query string, the summary, and the words for sources and levels.
// Imports only types and pure helpers from the pipeline (decision P16 page).

import { CROSS_CHECKED, SINGLE_SOURCE } from "@/pipeline/confidence.ts";
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
  return [player.pools.active && "active", player.pools.legend && "legend"]
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
