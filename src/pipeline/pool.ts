import { mergePlayer } from "./merge.ts";
import type { ClubIndex, Draft, MergeContext } from "./merge.ts";
import { confederationOf, LIGUE1, slugify, TUNISIA_TEAM } from "./places.ts";
import type {
  CuratedHonour,
  Flag,
  IdNamespace,
  IdRegistry,
  Line,
  Pool,
  PoolClub,
  PoolDropped,
  PoolHonour,
  PoolPlayer,
  ProvenancedField,
  WdClub,
  WdHonour,
  WdMembership,
  WdPlayer,
} from "./types.ts";

// Who is a candidate, which pool each footballer belongs to, and the pool
// itself: footballers, clubs, honours and flags, with stable ids.

export function ageOn(birthDate: string, today: string): number {
  const years = Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4));
  return today.slice(5) < birthDate.slice(5) ? years - 1 : years;
}

/** The research rule (probe §2), plus anyone an infobox gives caps or a club. */
export function isCandidate(
  p: WdPlayer,
  memberships: WdMembership[],
  index: ClubIndex,
  draft: { caps: number; hasClub: boolean },
): boolean {
  if (!p.male || p.birthDate === null) return false;
  const born = Number(p.birthDate.slice(0, 4));
  for (const m of memberships) {
    if (m.teamQid === TUNISIA_TEAM) {
      if (m.end !== null ? m.end >= 2000 && born >= 1970 : born >= 1975)
        return true;
      continue;
    }
    if (m.national || m.end !== null || m.endUnknown || born < 1986) continue;
    const club = index.byQid.get(m.teamQid);
    if (
      club &&
      (club.leagues.includes(LIGUE1) ||
        (club.country !== null && club.country !== "TN"))
    ) {
      return true;
    }
  }
  return (draft.caps > 0 && born >= 1970) || (draft.hasClub && born >= 1986);
}

/** Decision D-S1-1: active = a club and 38 or less; legend = 20 caps or more. */
export function poolsFor(
  draft: { club: unknown; caps: number; birthDate: string },
  today: string,
): { active: boolean; legend: boolean } {
  return {
    active: draft.club !== null && ageOn(draft.birthDate, today) <= 38,
    legend: draft.caps >= 20,
  };
}

/**
 * Ids are permanent. The registry (data/ids.json: Wikidata id → id) holds
 * every id ever given; a registered footballer keeps his for ever, even after
 * a night away. A new one gets a slug that no registered id uses, with the
 * Wikidata id on a clash, then a counter. Append-only: the registry passed in
 * is not changed; the returned one adds the new entries.
 */
export function assignIds(
  items: { key: string; name: string }[],
  registry: IdNamespace,
): { ids: Map<string, string>; registry: IdNamespace } {
  const next: IdNamespace = { ...registry };
  const ids = new Map<string, string>();
  const taken = new Set(Object.values(registry));
  for (const item of items) {
    if (Object.hasOwn(registry, item.key))
      ids.set(item.key, registry[item.key]);
  }
  for (const item of items) {
    if (ids.has(item.key)) continue;
    const base = slugify(item.name) || item.key.toLowerCase();
    let id = taken.has(base) ? `${base}-${item.key.toLowerCase()}` : base;
    for (let n = 2; taken.has(id); n++)
      id = `${base}-${item.key.toLowerCase()}-${n}`;
    ids.set(item.key, id);
    taken.add(id);
    next[item.key] = id;
  }
  return { ids, registry: next };
}

/** The value each provenance entry dates: "caps" covers caps and capsAsOf; goals are dated on their own. */
const FIELDS: Record<ProvenancedField, (p: PoolPlayer) => unknown> = {
  nameLatin: (p) => p.nameLatin,
  nameArabic: (p) => p.nameArabic,
  position: (p) => p.position,
  positionDetail: (p) => p.positionDetail,
  birthDate: (p) => p.birthDate,
  birthPlace: (p) => [p.birthPlace, p.birthCountry],
  governorate: (p) => p.governorate,
  clubId: (p) => p.clubId,
  caps: (p) => [p.caps, p.capsAsOf],
  goals: (p) => p.goals,
  history: (p) => p.history,
  photo: (p) => p.photo,
};

/** An unchanged value keeps the date it was first read, so a quiet night changes nothing. */
export function carryProvenance(
  previous: PoolPlayer | undefined,
  next: PoolPlayer,
): PoolPlayer {
  if (!previous) return next;
  const provenance = { ...next.provenance };
  for (const [field, read] of Object.entries(FIELDS) as [
    ProvenancedField,
    (p: PoolPlayer) => unknown,
  ][]) {
    const before = previous.provenance[field];
    const after = provenance[field];
    if (
      before &&
      after &&
      before.source === after.source &&
      JSON.stringify(read(previous)) === JSON.stringify(read(next))
    ) {
      provenance[field] = { ...after, retrievedAt: before.retrievedAt };
    }
  }
  return { ...next, provenance };
}

const usableYear = (y: number | null) =>
  y !== null && y >= 1900 && y <= 2100 ? y : null;

/** Years outside what the database accepts become unknown, never a failed build. */
function cleanYears(
  from: number | null,
  to: number | null,
): { from: number | null; to: number | null } {
  const a = usableYear(from);
  const b = usableYear(to);
  return a !== null && b !== null && a > b
    ? { from: a, to: null }
    : { from: a, to: b };
}

export type BuildInput = MergeContext & {
  players: WdPlayer[];
  /** Wikidata winners: the `honours` of parseHonoursReport. */
  honours: WdHonour[];
  curatedHonours: CuratedHonour[];
  ligue1Titles: string[];
  previous: Pool | null;
  /** data/ids.json, or emptyRegistry() before the first build: every id ever given. */
  ids: IdRegistry;
};

type Kept = {
  draft: Omit<Draft, "nameLatin" | "position" | "birthDate"> & {
    nameLatin: string;
    position: Line;
    birthDate: string;
  };
  pools: { active: boolean; legend: boolean };
};

const byNumber = (a: { qid: string }, b: { qid: string }) =>
  Number(a.qid.slice(1)) - Number(b.qid.slice(1));
const honourKey = (h: {
  competition: string;
  seasonStart: number;
  seasonEnd: number;
}) => `${h.competition}|${h.seasonStart}|${h.seasonEnd}`;

/** A registry with no ids yet, for the first build (no data/ids.json). */
export function emptyRegistry(): IdRegistry {
  return { players: {}, clubs: {} };
}

/** "id x given to Q1 and Q2" for each id that serves two Wikidata ids. */
export function sharedIds(namespace: IdNamespace): string[] {
  const owner = new Map<string, string>();
  const out: string[] = [];
  for (const [qid, id] of Object.entries(namespace)) {
    const first = owner.get(id);
    if (first) out.push(`id ${id} given to ${first} and ${qid}`);
    else owner.set(id, qid);
  }
  return out;
}

/**
 * The registry to assign from: refused when an id serves two Wikidata ids in
 * a namespace (ids would no longer be permanent), and, when it is empty while
 * a previous pool exists, seeded from that pool's footballers and clubs.
 */
function startingRegistry(ids: IdRegistry, previous: Pool | null): IdRegistry {
  for (const space of ["players", "clubs"] as const) {
    const shared = sharedIds(ids[space]);
    if (shared.length > 0)
      throw new Error(`id registry: ${space} ${shared.join("; ")}`);
  }
  const empty =
    Object.keys(ids.players).length === 0 &&
    Object.keys(ids.clubs).length === 0;
  if (!empty || !previous) return ids;
  return {
    players: Object.fromEntries(
      previous.players.map((p) => [p.wikidataId, p.id]),
    ),
    clubs: Object.fromEntries(previous.clubs.map((c) => [c.wikidataId, c.id])),
  };
}

/** The pool, and the id registry with tonight's new footballers added (Task 8 writes it to data/ids.json). */
export function buildPool(input: BuildInput): {
  pool: Pool;
  ids: IdRegistry;
} {
  const registry = startingRegistry(input.ids, input.previous);
  const flags: Flag[] = [];
  const kept: Kept[] = [];
  const dropped: PoolDropped[] = [];

  for (const p of [...input.players].sort(byNumber)) {
    const name = p.nameEn ?? p.nameFr ?? p.qid;
    const merged = mergePlayer(p, input);
    if (!merged) {
      dropped.push({ wikidataId: p.qid, name, reason: "excluded", flags: [] });
      continue;
    }
    const { draft } = merged;
    const found = [...merged.flags];
    if (draft.club && draft.club.country === null) {
      found.push({
        kind: "club-unresolved",
        detail: `${draft.club.nameEn ?? draft.club.qid} has no country on Wikidata`,
      });
      draft.club = null;
      delete draft.provenance.clubId;
    }
    const override = input.overrides.players[p.qid]?.pools;
    let pools = { active: false, legend: false };
    let candidate = true;
    if (override) {
      pools = override.value;
    } else if (
      draft.birthDate &&
      isCandidate(p, input.memberships.get(p.qid) ?? [], input.index, {
        caps: draft.caps,
        hasClub: draft.club !== null,
      })
    ) {
      pools = poolsFor(
        { club: draft.club, caps: draft.caps, birthDate: draft.birthDate },
        input.today,
      );
    } else {
      candidate = false;
    }
    if (!pools.active && !pools.legend) {
      dropped.push({
        wikidataId: p.qid,
        name,
        reason: candidate ? "no-pool" : "not-candidate",
        flags: found.map((f) => ({ subject: p.qid, ...f })),
      });
      continue;
    }

    const { nameLatin, position, birthDate } = draft;
    if (nameLatin === null || position === null || birthDate === null) {
      const missing = [
        nameLatin === null && "name",
        position === null && "position",
        birthDate === null && "birth date",
      ];
      flags.push({
        subject: p.qid,
        kind: "dropped-missing-field",
        detail: missing.filter(Boolean).join(", "),
      });
      // His other flags stay visible too.
      flags.push(...found.map((f) => ({ subject: p.qid, ...f })));
      continue;
    }
    for (const s of draft.history) {
      const years = cleanYears(s.from, s.to);
      if (years.from !== s.from || years.to !== s.to) {
        const shown = (y: number | null, none: string) =>
          y === null ? none : String(y);
        found.push({
          kind: "spell-years-unusable",
          detail: `${s.clubName} ${shown(s.from, "?")}–${shown(s.to, "")}: stored as ${shown(years.from, "(unknown)")}–${shown(years.to, "(no end)")}`,
        });
      }
    }
    flags.push(...found.map((f) => ({ subject: p.qid, ...f })));
    kept.push({ draft: { ...draft, nameLatin, position, birthDate }, pools });
  }

  const wanted = new Map<string, WdClub>();
  const keep = (club: WdClub | null | undefined) => {
    if (club && club.country !== null) wanted.set(club.qid, club);
  };
  for (const { draft } of kept) {
    keep(draft.club);
    for (const spell of draft.history) keep(spell.club);
  }
  for (const qid of [
    ...input.honours.map((h) => h.winnerQid),
    ...input.curatedHonours.map((h) => h.clubWikidataId),
  ]) {
    keep(input.index.byQid.get(qid));
  }
  const ligue1 = new Set<string>();
  for (const title of input.ligue1Titles) {
    const club = input.index.resolve("en", title);
    if (club && club.country !== null) {
      ligue1.add(club.qid);
      keep(club);
    } else {
      flags.push({
        subject: title,
        kind: "ligue1-club-unresolved",
        detail: club
          ? "no country on Wikidata"
          : "no Wikidata item with this English title",
      });
    }
  }

  const clubList = [...wanted.values()].sort(byNumber);
  const clubsAssigned = assignIds(
    clubList.map((c) => ({ key: c.qid, name: c.nameEn ?? c.nameFr ?? c.qid })),
    registry.clubs,
  );
  const clubIds = clubsAssigned.ids;
  const clubId = (club: WdClub | null) =>
    club ? (clubIds.get(club.qid) ?? null) : null;
  const clubs: PoolClub[] = clubList
    .map((c) => ({
      id: clubIds.get(c.qid)!,
      wikidataId: c.qid,
      nameLatin: c.nameEn ?? c.nameFr ?? c.qid,
      nameArabic: c.nameAr,
      nameFrench: c.nameFr,
      country: c.country!,
      confederation: confederationOf(c.country),
      leagueWikidataId: c.leagues[0] ?? null,
      ligue1: ligue1.has(c.qid),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const assigned = assignIds(
    kept.map(({ draft }) => ({ key: draft.wikidataId, name: draft.nameLatin })),
    registry.players,
  );
  const playerIds = assigned.ids;
  const before = new Map(
    (input.previous?.players ?? []).map((p) => [p.wikidataId, p]),
  );
  const players: PoolPlayer[] = kept
    .map(({ draft, pools }) =>
      carryProvenance(before.get(draft.wikidataId), {
        id: playerIds.get(draft.wikidataId)!,
        wikidataId: draft.wikidataId,
        nameLatin: draft.nameLatin,
        nameArabic: draft.nameArabic,
        nameFrench: draft.nameFrench,
        aliases: draft.aliases,
        position: draft.position,
        positionDetail: draft.positionDetail,
        birthDate: draft.birthDate,
        birthPlace: draft.birthPlace,
        birthCountry: draft.birthCountry,
        governorate: draft.governorate,
        clubId: clubId(draft.club),
        caps: draft.caps,
        goals: draft.goals,
        capsAsOf: draft.capsAsOf,
        history: draft.history.map((s) => ({
          clubId: clubId(s.club),
          clubName: s.clubName,
          ...cleanYears(s.from, s.to),
          apps: s.apps,
          goals: s.goals,
          loan: s.loan,
        })),
        photo: draft.photo,
        wiki: draft.wiki,
        pools,
        provenance: draft.provenance,
      }),
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  // One winner per edition (competition, start, end); a curated row replaces Wikidata's.
  // Ruling (fix round 1): a curated honour replaces every Wikidata edition of
  // its competition and start year, whatever its end year, with a flag for
  // each replaced row. Curated editions with different end years all stay
  // (the two CAF editions that start in 2018). A winner with no club row (no
  // country on Wikidata) is left out, with a flag.
  const season = (h: { competition: string; seasonStart: number }) =>
    `${h.competition} ${h.seasonStart}`;
  const winner = (qid: string) => `${qid} (${clubIds.get(qid) ?? "no club"})`;
  const curatedBySeason = new Map<string, CuratedHonour[]>();
  for (const h of input.curatedHonours) {
    curatedBySeason.set(season(h), [
      ...(curatedBySeason.get(season(h)) ?? []),
      h,
    ]);
  }
  const honours = new Map<string, PoolHonour>();
  const winners = [
    ...input.honours.map((h) => ({ ...h, source: "wikidata" as const })),
    ...input.curatedHonours.map((h) => ({
      ...h,
      winnerQid: h.clubWikidataId,
      source: "curated" as const,
    })),
  ];
  for (const h of winners) {
    const curated = curatedBySeason.get(season(h));
    if (h.source === "wikidata" && curated) {
      flags.push({
        subject: season(h),
        kind: "honour-replaced-by-curated",
        detail: `wikidata ${h.seasonStart}–${h.seasonEnd} ${winner(h.winnerQid)} replaced by curated ${curated
          .map(
            (c) =>
              `${c.seasonStart}–${c.seasonEnd} ${winner(c.clubWikidataId)}`,
          )
          .join(" and ")}`,
      });
      continue;
    }
    const id = clubIds.get(h.winnerQid);
    if (id) {
      honours.set(honourKey(h), {
        competition: h.competition,
        seasonStart: h.seasonStart,
        seasonEnd: h.seasonEnd,
        clubId: id,
        source: h.source,
      });
    } else {
      flags.push({
        subject: h.winnerQid,
        kind: "honour-winner-unresolved",
        detail: `${h.source} ${h.competition} ${h.seasonStart}–${h.seasonEnd}: no club with a country for this winner`,
      });
    }
  }

  const pool: Pool = {
    version: 1,
    players,
    clubs,
    honours: [...honours.values()].sort(
      (a, b) =>
        a.competition.localeCompare(b.competition) ||
        a.seasonStart - b.seasonStart ||
        a.seasonEnd - b.seasonEnd,
    ),
    flags: flags.sort(
      (a, b) =>
        a.kind.localeCompare(b.kind) || a.subject.localeCompare(b.subject),
    ),
    dropped,
  };
  return {
    pool,
    ids: { players: assigned.registry, clubs: clubsAssigned.registry },
  };
}
