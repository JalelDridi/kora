import { CROSS_CHECKED, isAnswerReady, SINGLE_SOURCE } from "./confidence.ts";
import type { Sighting } from "./squads/match.ts";
import { WITNESS_FRESH_DAYS } from "./witness/apply.ts";
import type { WitnessSummary } from "./witness/apply.ts";
import { droppedReasons } from "./types.ts";
import type { SquadList } from "./wiki/squads.ts";
import type {
  Competition,
  Flag,
  HonourIssue,
  Pool,
  PoolHonour,
  PoolPlayer,
  ProvenancedField,
  SourceId,
  SourceStatus,
} from "./types.ts";

// The nightly report, read by a person in a pull request: what is doubtful
// comes first, then how complete the pool is, then what changed.

export type CoverageRow = { field: string; count: number; total: number };

const MEASURES: [string, (p: PoolPlayer) => boolean][] = [
  ["Arabic name", (p) => p.nameArabic !== null],
  ["French name", (p) => p.nameFrench !== null],
  ["Photo", (p) => p.photo !== null],
  [
    "Governorate or born abroad",
    (p) =>
      p.governorate !== null ||
      (p.birthCountry !== null && p.birthCountry !== "TN"),
  ],
  ["Current club", (p) => p.clubId !== null],
  ["Caps with an as-of date", (p) => p.capsAsOf !== null],
  ["Three or more career spells", (p) => p.history.length >= 3],
  ["Detailed position", (p) => p.positionDetail !== null],
  ["English article", (p) => p.wiki.en !== null],
  ["French article", (p) => p.wiki.fr !== null],
];

export function computeCoverage(players: PoolPlayer[]): CoverageRow[] {
  return MEASURES.map(([field, has]) => ({
    field,
    count: players.filter(has).length,
    total: players.length,
  }));
}

/** Flags for infobox rows the parsers could not read (addendum §8). */
export const SKIP_KINDS: readonly string[] = [
  "caps-row-skipped",
  "career-row-skipped",
];

/** Flags that make a left-out footballer worth a look: his caps or a row could not be read. */
export const LEFT_OUT_DOUBT: readonly string[] = [
  "caps-unknown",
  "goals-unknown",
  ...SKIP_KINDS,
];

export type ConfidenceRow = {
  field: ProvenancedField;
  high: number;
  medium: number;
  low: number;
  none: number;
};

/** Per field, how many footballers have it high, medium, low, or not rated at all. */
export function computeConfidence(players: PoolPlayer[]): ConfidenceRow[] {
  return [...CROSS_CHECKED, ...SINGLE_SOURCE].map((field) => {
    const row: ConfidenceRow = { field, high: 0, medium: 0, low: 0, none: 0 };
    for (const p of players) row[p.provenance[field]?.confidence ?? "none"]++;
    return row;
  });
}

const VALUE: Record<ProvenancedField, (p: PoolPlayer) => string> = {
  caps: (p) => `${p.caps}${p.capsAsOf ? ` (as of ${p.capsAsOf})` : ""}`,
  goals: (p) => String(p.goals),
  clubId: (p) => p.clubId ?? "none",
  birthDate: (p) => p.birthDate,
  position: (p) => p.position,
  positionDetail: (p) => p.positionDetail ?? "",
  history: (p) => `${p.history.length} spells`,
  nameLatin: (p) => p.nameLatin,
  governorate: (p) => p.governorate ?? "",
  birthPlace: (p) => p.birthPlace ?? "",
  nameArabic: (p) => p.nameArabic ?? "",
  photo: (p) => p.photo?.file ?? "",
  pools: (p) =>
    `${p.pools.active ? "active" : ""}${p.pools.active && p.pools.legend ? ", " : ""}${p.pools.legend ? "legend" : ""}`,
};

/** "none" is not a source: a value no source gives is said so in words. */
export function sourceNames(agreeing: SourceId[] | undefined): string {
  const names = (agreeing ?? []).map((s) => (s === "none" ? "no source" : s));
  return names.length === 0 ? "no source" : names.join(", ");
}

export type LowField = {
  id: string;
  field: ProvenancedField;
  value: string;
  sources: string;
  note: string;
};

/** Low fields that two sources could have confirmed: by footballer, then in field order. */
export function lowFields(players: PoolPlayer[]): LowField[] {
  return [...players]
    .sort((a, b) => a.id.localeCompare(b.id))
    .flatMap((p) =>
      CROSS_CHECKED.filter(
        (field) => p.provenance[field]?.confidence === "low",
      ).map((field) => ({
        id: p.id,
        field,
        value: VALUE[field](p),
        sources: sourceNames(p.provenance[field]?.agreeing),
        note: p.provenance[field]?.confidenceNote ?? "",
      })),
    );
}

export type PoolDiff = {
  added: string[];
  removed: string[];
  clubChanges: { id: string; from: string | null; to: string | null }[];
  capsChanged: number;
  otherChanged: number;
  changed: boolean;
};

export function diffPools(previous: Pool | null, next: Pool): PoolDiff {
  const before = new Map((previous?.players ?? []).map((p) => [p.id, p]));
  const after = new Map(next.players.map((p) => [p.id, p]));
  const rest = (p: PoolPlayer) =>
    JSON.stringify({ ...p, clubId: null, caps: 0, goals: 0, provenance: null });
  const diff: PoolDiff = {
    added: [...after.keys()].filter((id) => !before.has(id)),
    removed: [...before.keys()].filter((id) => !after.has(id)),
    clubChanges: [],
    capsChanged: 0,
    otherChanged: 0,
    changed:
      previous === null || JSON.stringify(previous) !== JSON.stringify(next),
  };
  for (const [id, p] of after) {
    const old = before.get(id);
    if (!old) continue;
    if (old.clubId !== p.clubId)
      diff.clubChanges.push({ id, from: old.clubId, to: p.clubId });
    if (old.caps !== p.caps || old.goals !== p.goals) diff.capsChanged++;
    if (rest(old) !== rest(p)) diff.otherChanged++;
  }
  return diff;
}

/** A pool that loses more than a tenth of its footballers means a source broke. */
export function shrinkRefusal(before: number, after: number): string | null {
  return after < before * 0.9
    ? `the pool would shrink from ${before} to ${after} footballers; refusing (a source probably failed)`
    : null;
}

export function guardChange(previous: Pool | null, next: Pool): string | null {
  if (!previous) return null;
  return shrinkRefusal(previous.players.length, next.players.length);
}

export function missingSeasons(
  honours: PoolHonour[],
  competition: Competition,
  from: number,
  to: number,
): number[] {
  const have = new Set(
    honours
      .filter((h) => h.competition === competition)
      .map((h) => h.seasonStart),
  );
  const out: number[] = [];
  for (let y = from; y <= to; y++) if (!have.has(y)) out.push(y);
  return out;
}

/** The squad lists (P42) as the report shows them. */
export type SquadSummary = {
  lists: (Pick<
    SquadList,
    "lang" | "page" | "kind" | "date" | "season" | "status"
  > & {
    rows: number;
    matched: number;
  })[];
  votes: Record<"clubId" | "caps", { agree: number; differ: number }>;
  /** Rows that named two footballers at once (no match). */
  notes: string[];
};

const SQUAD_SOURCES: readonly SourceId[] = [
  "enwiki-squad",
  "frwiki-squad",
  "enwiki-national",
];

/**
 * Per list, its rows and how many matched; per field, the footballers in the
 * pool whose value a squad list agrees with or differs from.
 */
export function squadSummary(
  lists: SquadList[],
  sightings: Sighting[],
  pool: Pool,
  notes: string[] = [],
): SquadSummary {
  const key = (l: Pick<SquadList, "lang" | "page">) => `${l.lang}:${l.page}`;
  const inPool = new Map(pool.players.map((p) => [p.wikidataId, p]));
  const agrees = (p: PoolPlayer, field: "clubId" | "caps") =>
    (p.provenance[field]?.agreeing ?? []).some((s) =>
      SQUAD_SOURCES.includes(s),
    );
  const capsDiffer = new Set(
    sightings
      .filter((s) => {
        const p = inPool.get(s.qid);
        return (
          p !== undefined &&
          s.list.kind === "national" &&
          s.caps !== undefined &&
          s.caps !== p.caps
        );
      })
      .map((s) => s.qid),
  );
  return {
    lists: lists.map((l) => ({
      lang: l.lang,
      page: l.page,
      kind: l.kind,
      date: l.date,
      season: l.season,
      status: l.status,
      rows: l.rows.length,
      matched: sightings.filter((s) => key(s.list) === key(l)).length,
    })),
    votes: {
      clubId: {
        agree: pool.players.filter((p) => agrees(p, "clubId")).length,
        differ: new Set(
          pool.flags
            .filter((f) => f.kind === "club-squad-list-differs")
            .map((f) => f.subject),
        ).size,
      },
      caps: {
        agree: pool.players.filter((p) => agrees(p, "caps")).length,
        differ: capsDiffer.size,
      },
    },
    notes,
  };
}

function squadSection(squads: SquadSummary | null): string[] {
  if (squads === null)
    return [
      "## Squad lists (P42)",
      "",
      "No squad list was read in this build: the squads source failed or has no cached copy. The pool is what it would be without them.",
    ];
  const current = squads.lists.filter((l) => l.status === "current");
  const named = (status: string) =>
    squads.lists
      .filter((l) => l.status === status)
      .map(
        (l) => `${l.lang}:${l.page}${l.date ? ` (${l.season ?? l.date})` : ""}`,
      );
  const stale = named("stale");
  const undated = named("undated");
  const none = named("none");
  return [
    `## Squad lists (P42): ${current.length} current of ${squads.lists.length}`,
    "",
    "Each list read tonight, by its own date or season (never the page edit). Only a current list votes; the national table's caps count at any date. A row counts when it matches a footballer by its link or by name and birth date.",
    "",
    "| List | Language | Date or season | Status | Tunisian rows | Matched |",
    "| --- | --- | --- | --- | --- | --- |",
    ...squads.lists.map(
      (l) =>
        `| ${l.page}${l.kind === "national" ? " (national table)" : ""} | ${l.lang} | ${l.season ?? l.date ?? "none"} | ${l.status} | ${l.rows} | ${l.matched} |`,
    ),
    "",
    `Club: a squad list agrees with ${squads.votes.clubId.agree} footballers' club and differs for ${squads.votes.clubId.differ} (flag club-squad-list-differs). Caps: the national table agrees with ${squads.votes.caps.agree} and differs for ${squads.votes.caps.differ}.`,
    "",
    `- Stale, no vote (${stale.length}): ${stale.join(", ") || "none"}`,
    `- Undated, no vote (${undated.length}): ${undated.join(", ") || "none"}`,
    `- No list on the page (${none.length}): ${none.join(", ") || "none"}`,
    ...(squads.notes.length > 0
      ? [
          "",
          `Rows that name two footballers, not matched (${squads.notes.length}):`,
          "",
          ...squads.notes.map((n) => `- ${n}`),
        ]
      : []),
  ];
}

function witnessSection(w: WitnessSummary): string[] {
  const total = w.counts.reduce(
    (n, c) => n + Object.values(c.verdicts).reduce((a, b) => a + b, 0),
    0,
  );
  return [
    `## Private checks (P43): ${total} verdicts in use`,
    "",
    `Verdicts of the private witness (data/witness.json): which site was checked on which day, and whether it agrees with our published value. The sites' values are never stored or shown. A verdict counts for ${WITNESS_FRESH_DAYS} days and only while we publish the value it was made on; an "agrees" is one more agreeing source, a "differs" is flagged and rates the field low until Jalel settles it with an override.`,
    "",
    ...(w.counts.length === 0
      ? ["No verdict in use."]
      : [
          "| Field | Site | Agrees | Differs | Not found | Not comparable |",
          "| --- | --- | --- | --- | --- | --- |",
          ...w.counts.map(
            (c) =>
              `| ${c.field} | ${c.site} | ${c.verdicts.agrees} | ${c.verdicts.differs} | ${c.verdicts["not-found"]} | ${c.verdicts["not-comparable"]} |`,
          ),
        ]),
    "",
    `Stale (over ${WITNESS_FRESH_DAYS} days): ${w.stale}. Unused (our value changed, or no longer in the pool): ${w.unused}.`,
    ...(w.differs.length === 0
      ? []
      : [
          "",
          `Each "differs", with our value only (${w.differs.length}):`,
          "",
          ...w.differs.map((d) => `- ${d}`),
        ]),
  ];
}

/** What parseHonoursReport corrected or dropped while reading Wikidata's honours. */
export type HonoursReading = {
  issues: HonourIssue[];
  skipped: { unlabelled: number; noStart: number };
};

const season = (start: number) =>
  `${start}–${String((start + 1) % 100).padStart(2, "0")}`;
const percent = (count: number, total: number) =>
  total === 0 ? "0%" : `${Math.round((count * 100) / total)}%`;
const list = (ids: string[]) =>
  ids.length === 0
    ? "none"
    : ids.slice(0, 50).join(", ") + (ids.length > 50 ? ", …" : "");
const LOW_LIMIT = 150;
const FLAG_LIMIT = 100;

export function renderReport(input: {
  pool: Pool;
  diff: PoolDiff;
  statuses: Record<string, SourceStatus>;
  today: string;
  /** From parseHonoursReport; absent when this run did not read Wikidata's honours. */
  honoursReading?: HonoursReading | null;
  /** The warnings of validateOverrides: stale overrides, not applied. */
  overrideWarnings?: string[];
  /** A deliberate offline rebuild (`--offline`): every source is cached on purpose. */
  offline?: boolean;
  /** P42: the squad lists; null when none was read; absent: no section. */
  squads?: SquadSummary | null;
  /** P43: the private witness's verdicts; absent: no section. */
  witness?: WitnessSummary;
}): string {
  const { pool, diff, statuses, today } = input;
  const clubName = new Map(pool.clubs.map((c) => [c.id, c.nameLatin]));
  const club = (id: string | null) =>
    id === null ? "none" : (clubName.get(id) ?? id);
  const byQid = new Map(pool.players.map((p) => [p.wikidataId, p.nameLatin]));
  const flagLine = (f: Flag) =>
    `- ${byQid.get(f.subject) ?? f.subject} (${f.subject}): ${f.detail}`;
  const flagList = (flags: Flag[]) =>
    flags.length === 0
      ? ["None."]
      : [
          ...flags.slice(0, FLAG_LIMIT).map(flagLine),
          ...(flags.length > FLAG_LIMIT
            ? [`- … ${flags.length - FLAG_LIMIT} more in data/pool.json`]
            : []),
        ];
  const active = pool.players.filter((p) => p.pools.active).length;
  const legend = pool.players.filter((p) => p.pools.legend).length;
  const both = pool.players.filter(
    (p) => p.pools.active && p.pools.legend,
  ).length;
  const low = lowFields(pool.players);
  const lowHistories = low.filter((l) => l.field === "history").length;
  const skipped = pool.flags.filter((f) => SKIP_KINDS.includes(f.kind));
  const undatedSpells = pool.flags.filter((f) => f.kind === "fr-undated-spell");
  const reading = input.honoursReading ?? null;
  const stale = input.overrideWarnings ?? [];
  // Every one is listed: an override can bring each of them in.
  const missingField = pool.dropped.filter((d) => d.reason === "missing-field");
  // In neither pool, yet the merge could not read his caps or a row: a former
  // international may be hiding here, so each is named.
  const unread = pool.dropped.filter(
    (d) =>
      d.reason === "no-pool" &&
      d.flags.some((f) => LEFT_OUT_DOUBT.includes(f.kind)),
  );

  // A source read from the cache is said before anything else.
  const fromCache = Object.entries(statuses)
    .filter(([, s]) => s.status === "cached")
    .map(
      ([name, s]) => `${name} (read on ${s.retrievedAt ?? "an unknown date"})`,
    );
  // An offline rebuild reads the cache on purpose: say so, not a warning.
  const saved = [
    ...new Set(
      Object.values(statuses)
        .map((s) => s.retrievedAt)
        .filter((d): d is string => d != null),
    ),
  ].sort();
  const savedOn =
    saved.length === 0
      ? "an unknown date"
      : saved.length === 1
        ? saved[0]
        : `${saved[0]} to ${saved.at(-1)}`;
  const answerReady = pool.players.filter(isAnswerReady).length;
  const out = [
    `# Nightly pool, ${today}`,
    "",
    ...(input.offline
      ? [
          `> Offline rebuild from the cache saved on ${savedOn}; no source was read.`,
          "",
        ]
      : fromCache.length > 0
        ? [
            `> **Not every source was read tonight.** From the cache: ${fromCache.join(", ")}. Their values may be out of date.`,
            "",
          ]
        : []),
    "| Source | Status | Read on | Note |",
    "| --- | --- | --- | --- |",
  ];
  for (const [name, s] of Object.entries(statuses))
    out.push(
      `| ${name} | ${s.status} | ${s.retrievedAt ?? "never"} | ${s.note ?? ""} |`,
    );
  out.push(
    "",
    `**${pool.players.length} footballers** (${active} active, ${legend} legends, ${both} in both), ${pool.clubs.length} clubs, ${pool.honours.length} honours.`,
    "",
    `Active footballers ready to be a daily answer (P27): ${answerReady} of ${active}.`,
    "",
    `## Low confidence, review first (${low.length})`,
    "",
    "Fields that two sources could confirm but do not, by footballer: the value, the sources that give it, and why it is low. " +
      "Club histories are often low on a first build: French club titles often match no known club, so the French career cannot agree with the English one. " +
      `${lowHistories} of the ${low.length} are club histories; the rules are not tuned to hide them.`,
    "",
    ...(low.length === 0
      ? ["None."]
      : low
          .slice(0, LOW_LIMIT)
          .map(
            (l) =>
              `- ${l.id}: ${l.field} ${l.value}${l.note ? `: ${l.note}` : ""}; sources: ${l.sources}`,
          )),
    ...(low.length > LOW_LIMIT
      ? [`- … ${low.length - LOW_LIMIT} more in data/pool.json`]
      : []),
    "",
    `Single-source fields: one source each. The governorate and the birthplace are medium when Wikidata gives a precise place (P36), else low; the Arabic name and the photo stay low until Jalel confirms them. Low: ${SINGLE_SOURCE.map((f) => `${f} ${pool.players.filter((p) => p.provenance[f]?.confidence === "low").length}`).join(", ")}.`,
    "",
    `### Rows the infobox parsers skipped (${skipped.length})`,
    "",
    "Each names the source, the infobox field, why it was skipped and the row as written. A skipped row keeps that source's caps or career from rating high.",
    "",
    ...flagList(skipped),
    "",
    `### French spells without a start year, left out beside an English career (${undatedSpells.length})`,
    "",
    ...flagList(undatedSpells),
    "",
    ...(input.squads === undefined ? [] : [...squadSection(input.squads), ""]),
    ...(input.witness === undefined
      ? []
      : [...witnessSection(input.witness), ""]),
    `## Left out of the pool (${pool.dropped.length})`,
    "",
    ...droppedReasons.map(
      (r) => `- ${r}: ${pool.dropped.filter((d) => d.reason === r).length}`,
    ),
    "",
    `### In neither pool, with unknown caps or goals or skipped rows (${unread.length})`,
    "",
    ...(unread.length === 0
      ? ["None."]
      : [
          ...unread
            .slice(0, FLAG_LIMIT)
            .map(
              (d) =>
                `- ${d.name} (${d.wikidataId}): ${d.flags.map((f) => `${f.kind}: ${f.detail}`).join("; ")}`,
            ),
          ...(unread.length > FLAG_LIMIT
            ? [`- … ${unread.length - FLAG_LIMIT} more in data/pool.json`]
            : []),
        ]),
    "",
    `### Missing a required field: an override can supply it (${missingField.length})`,
    "",
    ...(missingField.length === 0
      ? ["None."]
      : missingField.map(
          (d) =>
            `- ${d.name} (${d.wikidataId}): ${d.flags.find((f) => f.kind === "dropped-missing-field")?.detail ?? "a field"}`,
        )),
    "",
    `## Stale overrides (${stale.length})`,
    "",
    ...(stale.length === 0 ? ["None."] : stale.map((w) => `- ${w}`)),
    "",
    `## Honours read from Wikidata: corrections and drops (${reading ? reading.issues.length : "not read"})`,
    "",
  );
  if (!reading) {
    out.push(
      "Wikidata's honours were not read in this run, so nothing here was checked.",
    );
  } else {
    out.push(
      ...(reading.issues.length === 0
        ? ["No edition corrected or dropped."]
        : reading.issues.map(
            (i) =>
              `- ${i.kind}: ${i.competition} ${i.seasonStart}: ${i.detail}`,
          )),
      "",
      `Seasons left out: ${reading.skipped.unlabelled} without an English label, ${reading.skipped.noStart} without a start year.`,
    );
  }
  const replaced = pool.flags.filter(
    (f) => f.kind === "honour-replaced-by-curated",
  );
  out.push(
    "",
    `### Replaced by a curated honour (${replaced.length})`,
    "",
    ...(replaced.length === 0
      ? ["None."]
      : replaced.map((f) => `- ${f.subject}: ${f.detail}`)),
  );

  out.push(
    "",
    "## Coverage",
    "",
    "| Field | Footballers | Share |",
    "| --- | --- | --- |",
    ...computeCoverage(pool.players).map(
      (r) =>
        `| ${r.field} | ${r.count} of ${r.total} | ${percent(r.count, r.total)} |`,
    ),
    "",
    "## Confidence",
    "",
    "None means the field has no value to rate (for example no current club).",
    "",
    "| Field | High | Medium | Low | None |",
    "| --- | --- | --- | --- | --- |",
    ...computeConfidence(pool.players).map(
      (r) => `| ${r.field} | ${r.high} | ${r.medium} | ${r.low} | ${r.none} |`,
    ),
  );

  const before = pool.players.length - diff.added.length + diff.removed.length;
  const refusal = shrinkRefusal(before, pool.players.length);
  const onlyProvenance =
    diff.changed &&
    before > 0 &&
    diff.added.length +
      diff.removed.length +
      diff.clubChanges.length +
      diff.capsChanged +
      diff.otherChanged ===
      0;
  out.push(
    "",
    "## Changes since the previous pool",
    "",
    before === 0
      ? "No previous pool to compare with, so the shrink guard does not apply."
      : `${before} footballers before, ${pool.players.length} now. ${refusal ? `**Refused:** ${refusal}.` : "Shrink guard passed (it refuses a loss of more than a tenth)."}`,
    "",
    `## Club changes, review each (${diff.clubChanges.length})`,
    "",
    ...(diff.clubChanges.length === 0
      ? ["None."]
      : diff.clubChanges.map(
          (c) => `- ${c.id}: ${club(c.from)} → ${club(c.to)}`,
        )),
    "",
    "## Other changes",
    "",
    `- Added (${diff.added.length}): ${list(diff.added)}`,
    `- Removed (${diff.removed.length}): ${list(diff.removed)}`,
    `- Caps or goals changed: ${diff.capsChanged}. Other fields changed: ${diff.otherChanged}.`,
    ...(onlyProvenance
      ? ["- Only dates, sources or confidence ratings changed."]
      : []),
    "",
    `## Flags (${pool.flags.length})`,
  );
  const kinds = new Map<string, Flag[]>();
  for (const flag of pool.flags)
    kinds.set(flag.kind, [...(kinds.get(flag.kind) ?? []), flag]);
  for (const [kind, flags] of kinds)
    out.push("", `### ${kind} (${flags.length})`, "", ...flagList(flags));
  const last = Number(today.slice(0, 4)) - 1;
  const gaps = (c: Competition) =>
    missingSeasons(pool.honours, c, 1990, last).map(season).join(", ") ||
    "none";
  out.push(
    "",
    "## Honours to curate (data/curated/honours.json)",
    "",
    `- Ligue 1 seasons without a winner since 1990–91: ${gaps("tn_ligue1")}`,
    `- Tunisian Cup seasons without a winner since 1990–91: ${gaps("tn_cup")}`,
  );
  return out.join("\n") + "\n";
}
