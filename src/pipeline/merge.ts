import {
  capsCeiling,
  NATIONAL_FIELD,
  rateFields,
  titleName,
} from "./confidence.ts";
import type { Chosen, Evidence, Vote } from "./confidence.ts";
import { governorateSlug, TUNISIA_TEAM } from "./places.ts";
import { firstPosition, lineFromLabel } from "./positions.ts";
import { playedAfter } from "./results.ts";
import type { OverrideValue, Overrides, PlayerOverride } from "./overrides.ts";
import type {
  FlagKind,
  Infobox,
  Line,
  Match,
  Photo,
  Provenance,
  ProvenancedField,
  SourceId,
  WdClub,
  WdMembership,
  WdPlayer,
} from "./types.ts";

// One footballer, field by field: which source wins, what it is worth
// flagging, where each value came from, and how far the sources agree on it.

const TUNISIA = "Q948";

export type Found = { kind: FlagKind; detail: string };

export type ClubIndex = {
  byQid: Map<string, WdClub>;
  resolve(lang: "en" | "fr", title: string): WdClub | null;
};

export function buildClubIndex(
  clubs: WdClub[],
  redirects: { en: Map<string, string>; fr: Map<string, string> },
  clubTitles: Record<string, string>,
): ClubIndex {
  const byQid = new Map(clubs.map((c) => [c.qid, c]));
  const byTitle = {
    en: new Map<string, WdClub>(),
    fr: new Map<string, WdClub>(),
  };
  for (const club of clubs) {
    if (club.titleEn) byTitle.en.set(club.titleEn, club);
    if (club.titleFr) byTitle.fr.set(club.titleFr, club);
  }
  return {
    byQid,
    resolve(lang, title) {
      const pinned = clubTitles[`${lang}:${title}`];
      if (pinned) return byQid.get(pinned) ?? null;
      return byTitle[lang].get(redirects[lang].get(title) ?? title) ?? null;
    },
  };
}

type Dated = { source: SourceId; asOf: string | null };
const SOURCE_ORDER: SourceId[] = ["override", "enwiki", "frwiki", "wikidata"];

/** Newest "as of" first; undated last; English before French on a tie. */
export function newestFirst(a: Dated, b: Dated): number {
  if (a.asOf !== b.asOf) {
    if (a.asOf === null) return 1;
    if (b.asOf === null) return -1;
    return a.asOf < b.asOf ? 1 : -1;
  }
  return SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source);
}

function sourceOf(box: Infobox): SourceId {
  return box.lang === "en" ? "enwiki" : "frwiki";
}

function provenance(
  source: SourceId,
  retrievedAt: string,
  asOf: string | null,
  ref?: string,
): Provenance {
  const p: Provenance = { source, retrievedAt };
  if (asOf) p.asOf = asOf;
  if (ref) p.ref = ref;
  return p;
}

function fromOverride(o: OverrideValue<unknown>): Provenance {
  return { source: "override", retrievedAt: o.at, by: o.by };
}

export type CapsCandidate = Dated & {
  caps: number;
  /** Null when the source has caps but no goals count: no goals vote. */
  goals: number | null;
  ref: string;
};

/** Decision D-S1-3: the newest dated source wins; disagreements are flagged. */
export function pickCaps(candidates: CapsCandidate[]): {
  chosen: CapsCandidate | null;
  flags: Found[];
} {
  if (candidates.length === 0) return { chosen: null, flags: [] };
  const [chosen, ...others] = [...candidates].sort(newestFirst);
  const say = (c: CapsCandidate) =>
    `${c.source} ${c.caps} (${c.asOf ?? "undated"})`;
  const flags: Found[] = [];
  for (const other of others) {
    if (other.caps === chosen.caps) continue;
    if (other.asOf === chosen.asOf) {
      flags.push({
        kind: "caps-sources-disagree",
        detail: `${say(chosen)} vs ${say(other)}`,
      });
    } else if (other.caps > chosen.caps) {
      flags.push({
        kind: "caps-newer-but-lower",
        detail: `${say(chosen)} < ${say(other)}`,
      });
    }
  }
  return { chosen, flags };
}

export type ClubPick = {
  club: WdClub | null;
  provenance: Provenance | null;
  flags: Found[];
};

/** Decision D-S1-2: override, newest infobox, then one recent open Wikidata club. */
export function pickClub(input: {
  en: Infobox | null;
  fr: Infobox | null;
  memberships: WdMembership[];
  index: ClubIndex;
  override?: OverrideValue<string | null>;
  today: string;
}): ClubPick {
  const flags: Found[] = [];
  const proposals: (Dated & { club: WdClub; ref: string })[] = [];
  for (const box of [input.en, input.fr]) {
    if (!box) continue;
    const source = sourceOf(box);
    if (box.currentClubIsStaff)
      flags.push({
        kind: "club-staff-role",
        detail: `${source}: ${box.title}`,
      });
    if (box.currentClub === null) continue;
    const club = input.index.resolve(box.lang, box.currentClub);
    if (!club) {
      flags.push({
        kind: "club-unresolved",
        detail: `${source}: ${box.currentClub}`,
      });
      continue;
    }
    proposals.push({ source, asOf: box.clubsAsOf, club, ref: box.title });
  }
  proposals.sort(newestFirst);
  if (
    proposals.length === 2 &&
    proposals[0].club.qid !== proposals[1].club.qid
  ) {
    flags.push({
      kind: "club-sources-disagree",
      detail: proposals
        .map(
          (p) =>
            `${p.source} ${p.club.nameEn ?? p.club.qid} (${p.asOf ?? "undated"})`,
        )
        .join(" vs "),
    });
  }

  if (input.override) {
    const wanted = input.override.value;
    const club =
      wanted === null ? null : (input.index.byQid.get(wanted) ?? null);
    if (wanted !== null && club === null)
      flags.push({ kind: "club-unresolved", detail: `override: ${wanted}` });
    const proposed = proposals[0]?.club.qid;
    if (proposed !== undefined && proposed !== wanted) {
      flags.push({
        kind: "club-override-disagrees",
        detail: `override ${wanted ?? "none"}, ${proposals[0].source} ${proposed}`,
      });
    }
    return { club, provenance: fromOverride(input.override), flags };
  }

  const best = proposals[0];
  if (best)
    return {
      club: best.club,
      provenance: provenance(best.source, input.today, best.asOf, best.ref),
      flags,
    };
  // An infobox that names no club means retired or free: no fallback.
  if (input.en || input.fr) return { club: null, provenance: null, flags };

  const open = input.memberships.filter(
    (m) => !m.national && m.end === null && !m.endUnknown,
  );
  if (open.length > 1) {
    flags.push({
      kind: "multiple-open-clubs",
      detail: open.map((m) => m.teamName ?? m.teamQid).join(", "),
    });
    return { club: null, provenance: null, flags };
  }
  const only = open[0];
  const recent = Number(input.today.slice(0, 4)) - 8;
  if (only && only.start !== null && only.start < recent) {
    flags.push({
      kind: "wd-club-too-old",
      detail: `${only.teamQid} since ${only.start}, over 8 years ago`,
    });
  }
  const club =
    only && only.start !== null && only.start >= recent
      ? input.index.byQid.get(only.teamQid)
      : undefined;
  if (club)
    return {
      club,
      provenance: provenance("wikidata", input.today, null, `P54 ${club.qid}`),
      flags,
    };
  return { club: null, provenance: null, flags };
}

/**
 * Ruling R1: beside an English career (one spell or more), a French spell with
 * no start year ("?–2013") is taken for a youth spell and left out of the
 * career, with a flag naming it. Without an English career it stays.
 */
export function dropUndatedFrench(
  en: Infobox | null,
  fr: Infobox | null,
): { fr: Infobox | null; flags: Found[] } {
  if (
    !en ||
    en.spells.length === 0 ||
    !fr ||
    fr.spells.every((s) => s.from !== null)
  )
    return { fr, flags: [] };
  const flags: Found[] = fr.spells
    .filter((s) => s.from === null)
    .map((s) => ({
      kind: "fr-undated-spell",
      detail: `frwiki ${fr.title}: ${s.clubTitle} (?–${s.to ?? ""})`,
    }));
  return {
    fr: { ...fr, spells: fr.spells.filter((s) => s.from !== null) },
    flags,
  };
}

export type DraftSpell = {
  club: WdClub | null;
  clubName: string;
  from: number | null;
  to: number | null;
  apps: number | null;
  goals: number | null;
  loan: boolean;
};

export function pickHistory(input: {
  en: Infobox | null;
  fr: Infobox | null;
  memberships: WdMembership[];
  index: ClubIndex;
  today: string;
}): { spells: DraftSpell[]; provenance: Provenance | null; flags: Found[] } {
  const { fr, flags } = dropUndatedFrench(input.en, input.fr);
  const best = [input.en, fr]
    .filter((b): b is Infobox => b !== null && b.spells.length > 0)
    .map((box) => ({ box, source: sourceOf(box), asOf: box.clubsAsOf }))
    .sort(newestFirst)[0];
  if (best) {
    return {
      spells: best.box.spells.map((s) => {
        const club = input.index.resolve(best.box.lang, s.clubTitle);
        return {
          club,
          clubName: club?.nameEn ?? s.clubTitle,
          from: s.from,
          to: s.to,
          apps: s.apps,
          goals: s.goals,
          loan: s.loan,
        };
      }),
      provenance: provenance(
        best.source,
        input.today,
        best.asOf,
        best.box.title,
      ),
      flags,
    };
  }
  const clubs = input.memberships
    .filter((m) => !m.national)
    .sort((a, b) => (a.start ?? 9999) - (b.start ?? 9999));
  if (clubs.length === 0) return { spells: [], provenance: null, flags };
  return {
    spells: clubs.map((m) => ({
      club: input.index.byQid.get(m.teamQid) ?? null,
      clubName: m.teamName ?? m.teamQid,
      from: m.start,
      to: m.end,
      apps: m.apps,
      goals: m.goals,
      loan: false,
    })),
    provenance: provenance("wikidata", input.today, null, "P54"),
    flags,
  };
}

/** Decision D-S1-7: Wikidata's line, fixed by overrides, checked against the English infobox. */
export function pickPosition(input: {
  qid: string;
  wikidata: string[];
  en: Infobox | null;
  fr: Infobox | null;
  override?: OverrideValue<Line>;
  detailOverride?: OverrideValue<string>;
  today: string;
}): {
  line: Line | null;
  detail: string | null;
  provenance: { position?: Provenance; positionDetail?: Provenance };
  flags: Found[];
} {
  const flags: Found[] = [];
  const prov: { position?: Provenance; positionDetail?: Provenance } = {};
  const wdLine =
    input.wikidata
      .map((label) => lineFromLabel(label))
      .find((l) => l !== null) ?? null;
  if (input.wikidata.length > 0 && wdLine === null) {
    flags.push({
      kind: "position-unmapped",
      detail: input.wikidata.join(", "),
    });
  }
  const enText = input.en?.positionText
    ? firstPosition(input.en.positionText)
    : null;
  const frText = input.fr?.positionText
    ? firstPosition(input.fr.positionText)
    : null;
  const enLine = enText ? lineFromLabel(enText) : null;
  const frLine = frText ? lineFromLabel(frText) : null;

  let line: Line | null = null;
  if (input.override) {
    line = input.override.value;
    prov.position = fromOverride(input.override);
  } else if (wdLine) {
    line = wdLine;
    prov.position = provenance(
      "wikidata",
      input.today,
      null,
      `P413 ${input.qid}`,
    );
    if (enLine && enLine !== wdLine) {
      flags.push({
        kind: "position-disagrees",
        detail: `wikidata ${wdLine}, enwiki ${enLine} (${enText})`,
      });
    }
  } else if (enLine) {
    line = enLine;
    prov.position = provenance("enwiki", input.today, null, input.en?.title);
  } else if (frLine) {
    line = frLine;
    prov.position = provenance("frwiki", input.today, null, input.fr?.title);
  }

  let detail: string | null = null;
  if (input.detailOverride) {
    detail = input.detailOverride.value;
    prov.positionDetail = fromOverride(input.detailOverride);
  } else if (enText) {
    detail = enText;
    prov.positionDetail = provenance(
      "enwiki",
      input.today,
      null,
      input.en?.title,
    );
  } else if (frText) {
    detail = frText;
    prov.positionDetail = provenance(
      "frwiki",
      input.today,
      null,
      input.fr?.title,
    );
  }
  return { line, detail, provenance: prov, flags };
}

/** Decision D-S1-4: governorate from the birthplace; born abroad keeps the country. */
export function pickBirth(
  p: WdPlayer,
  o: PlayerOverride,
  governorateIds: Set<string>,
  today: string,
): {
  birthPlace: string | null;
  birthCountry: string | null;
  governorate: string | null;
  provenance: { birthPlace?: Provenance; governorate?: Provenance };
  flags: Found[];
} {
  const flags: Found[] = [];
  const prov: { birthPlace?: Provenance; governorate?: Provenance } = {};
  const birthCountry = o.birthCountry?.value ?? p.birthCountry;
  if (o.birthCountry) prov.birthPlace = fromOverride(o.birthCountry);
  else if (p.birthPlaceName || p.birthCountry)
    prov.birthPlace = provenance("wikidata", today, null, `P19 ${p.qid}`);
  if (p.birthPlaceQid === TUNISIA)
    flags.push({
      kind: "birthplace-country-only",
      detail: "born in Tunisia, town unknown",
    });

  let governorate: string | null = null;
  if (o.governorate) {
    governorate = o.governorate.value;
    prov.governorate = fromOverride(o.governorate);
  } else if (birthCountry === null || birthCountry === "TN") {
    governorate =
      p.governorates
        .map((label) => governorateSlug(label))
        .find((g): g is string => g !== null && governorateIds.has(g)) ?? null;
    if (governorate)
      prov.governorate = provenance(
        "wikidata",
        today,
        null,
        `P19/P131 ${p.qid}`,
      );
    else
      flags.push({
        kind: "governorate-unresolved",
        detail: p.birthPlaceName ?? "no birthplace",
      });
  }
  return {
    birthPlace: p.birthPlaceName,
    birthCountry,
    governorate,
    provenance: prov,
    flags,
  };
}

export type MergeContext = {
  today: string;
  memberships: Map<string, WdMembership[]>;
  index: ClubIndex;
  infoboxes: { en: Map<string, Infobox>; fr: Map<string, Infobox> };
  photos: Map<string, Photo>;
  tunisiaMatches: Match[];
  /** Only from an `ok` result of validateOverrides: never a partly valid file. */
  overrides: Overrides;
  governorateIds: Set<string>;
  /** Tunisia goals per footballer from martj42, a floor (Task 8). */
  goalsFloor?: Map<string, number>;
};

export type Draft = {
  wikidataId: string;
  nameLatin: string | null;
  nameArabic: string | null;
  nameFrench: string | null;
  aliases: string[];
  position: Line | null;
  positionDetail: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  birthCountry: string | null;
  governorate: string | null;
  club: WdClub | null;
  caps: number;
  goals: number;
  capsAsOf: string | null;
  history: DraftSpell[];
  photo: Photo | null;
  wiki: { en: string | null; fr: string | null; ar: string | null };
  provenance: Partial<Record<ProvenancedField, Provenance>>;
};

export function mergePlayer(
  p: WdPlayer,
  ctx: MergeContext,
): { draft: Draft; flags: Found[] } | null {
  const o = ctx.overrides.players[p.qid] ?? {};
  if (o.exclude?.value) return null;
  const en = p.titles.en ? (ctx.infoboxes.en.get(p.titles.en) ?? null) : null;
  const fr = p.titles.fr ? (ctx.infoboxes.fr.get(p.titles.fr) ?? null) : null;
  // Ruling R1: the French career without its undated spells, for every career rule.
  const frCareer = dropUndatedFrench(en, fr).fr;
  const memberships = ctx.memberships.get(p.qid) ?? [];
  const flags: Found[] = [];
  const prov: Draft["provenance"] = {};
  const wd = (ref: string) => provenance("wikidata", ctx.today, null, ref);

  const nameLatin = p.nameEn ?? p.nameFr;
  if (nameLatin) prov.nameLatin = wd(`label ${p.qid}`);
  const nameArabic = o.nameArabic?.value ?? p.nameAr;
  if (o.nameArabic) prov.nameArabic = fromOverride(o.nameArabic);
  else if (p.nameAr) prov.nameArabic = wd(`label ${p.qid}`);

  if (p.birthDate) {
    prov.birthDate = wd(`P569 ${p.qid}`);
    if (p.birthDate.endsWith("-01-01")) {
      flags.push({
        kind: "birthdate-january-first",
        detail: `${p.birthDate} may stand for a year only`,
      });
    }
  }

  const position = pickPosition({
    qid: p.qid,
    wikidata: p.positions,
    en,
    fr,
    override: o.position,
    detailOverride: o.positionDetail,
    today: ctx.today,
  });
  flags.push(...position.flags);
  Object.assign(prov, position.provenance);

  const birth = pickBirth(p, o, ctx.governorateIds, ctx.today);
  flags.push(...birth.flags);
  Object.assign(prov, birth.provenance);

  const club = pickClub({
    en,
    fr: frCareer,
    memberships,
    index: ctx.index,
    override: o.club,
    today: ctx.today,
  });
  flags.push(...club.flags);
  if (club.provenance) prov.clubId = club.provenance;

  const history = pickHistory({
    en,
    fr,
    memberships,
    index: ctx.index,
    today: ctx.today,
  });
  flags.push(...history.flags);
  if (history.provenance) prov.history = history.provenance;

  const candidates: CapsCandidate[] = [];
  for (const box of [en, fr]) {
    // A null count is no vote (an unreadable national row), never zero.
    if (box && box.caps !== null) {
      candidates.push({
        source: sourceOf(box),
        asOf: box.capsAsOf,
        caps: box.caps,
        goals: box.goals,
        ref: box.title,
      });
    }
  }
  const national = memberships.find(
    (m) => m.teamQid === TUNISIA_TEAM && m.apps !== null,
  );
  if (national && national.apps !== null) {
    candidates.push({
      source: "wikidata",
      asOf: null,
      caps: national.apps,
      goals: national.goals,
      ref: `P54 ${TUNISIA_TEAM} P1350`,
    });
  }
  const capsPick = pickCaps(candidates);
  flags.push(...capsPick.flags);
  let caps = capsPick.chosen?.caps ?? 0;
  // Goals from the caps source, else the newest source that has goals: a
  // source with caps but no goals count gives no goals vote.
  const goalsFrom =
    capsPick.chosen?.goals != null
      ? capsPick.chosen
      : [...candidates].sort(newestFirst).find((c) => c.goals !== null);
  let goals = goalsFrom?.goals ?? 0;
  let capsAsOf = capsPick.chosen?.asOf ?? null;
  if (capsPick.chosen) {
    prov.caps = provenance(
      capsPick.chosen.source,
      ctx.today,
      capsPick.chosen.asOf,
      capsPick.chosen.ref,
    );
  }
  if (goalsFrom) {
    prov.goals = provenance(
      goalsFrom.source,
      ctx.today,
      goalsFrom.asOf,
      goalsFrom.ref,
    );
  }
  // Caps and goals always carry provenance; the 0 the database needs is
  // never left looking like a known count.
  // An infobox with no senior Tunisia row (and no skipped national row) says 0:
  // the newer such infobox is the source. Otherwise no source has caps.
  // Only when NO infobox skipped a national-team row: a skipped row on either
  // page means a Tunisia row may exist, so the caps are unknown, not 0.
  const anyNationalSkip = [en, fr].some(
    (b) => b !== null && b.skipped.some((r) => NATIONAL_FIELD.test(r.field)),
  );
  const silent =
    capsPick.chosen || anyNationalSkip
      ? undefined
      : [en, fr]
          .filter((b): b is Infobox => b !== null)
          .map((box) => ({ box, source: sourceOf(box), asOf: box.capsAsOf }))
          .sort(newestFirst)[0];
  if (silent) {
    capsAsOf = silent.asOf;
    prov.caps = provenance(
      silent.source,
      ctx.today,
      silent.asOf,
      silent.box.title,
    );
    prov.goals = { ...prov.caps };
  } else if (!capsPick.chosen) {
    prov.caps = { source: "none", retrievedAt: ctx.today };
    prov.goals = { source: "none", retrievedAt: ctx.today };
    if (!o.caps) {
      flags.push({
        kind: "caps-unknown",
        detail: "no source gives his Tunisia caps or goals",
      });
    } else if (!o.goals) {
      // Jalel gave the caps, not the goals: the goals are still unknown.
      flags.push({
        kind: "goals-unknown",
        detail: "caps from an override; no source gives his goals",
      });
    }
  } else if (!goalsFrom) {
    prov.goals = { source: "none", retrievedAt: ctx.today };
    if (!o.goals) {
      flags.push({
        kind: "goals-unknown",
        detail: `${capsPick.chosen.source} gives ${capsPick.chosen.caps} caps but no goals, and no other source gives goals`,
      });
    }
  }
  // An override rates only its own field: caps and goals are each "decided by
  // Jalel" only when overridden; a capsAsOf override only re-dates the caps
  // (the source and its rating stay), saying who chose the date.
  caps = o.caps?.value ?? caps;
  goals = o.goals?.value ?? goals;
  capsAsOf = o.capsAsOf?.value ?? capsAsOf;
  if (o.caps) prov.caps = fromOverride(o.caps);
  else if (o.capsAsOf && prov.caps) {
    prov.caps = { ...prov.caps, asOf: o.capsAsOf.value, by: o.capsAsOf.by };
  }
  if (o.goals) prov.goals = fromOverride(o.goals);
  // The stale check is skipped only when Jalel confirmed the caps or their date.
  if (!(o.caps || o.capsAsOf) && capsPick.chosen && capsAsOf) {
    const source =
      capsPick.chosen.source === "enwiki"
        ? en
        : capsPick.chosen.source === "frwiki"
          ? fr
          : null;
    const missed = playedAfter(ctx.tunisiaMatches, capsAsOf);
    if (source?.nationalOpen && missed >= 3) {
      flags.push({
        kind: "caps-maybe-stale",
        detail: `${capsPick.chosen.source} as of ${capsAsOf}; Tunisia has played ${missed} matches since`,
      });
    }
  }

  const photo = p.imageFile ? (ctx.photos.get(p.imageFile) ?? null) : null;
  if (photo) {
    prov.photo = provenance("commons", ctx.today, null, photo.file);
    if (Math.min(photo.width, photo.height) < 300) {
      flags.push({
        kind: "photo-small",
        detail: `${photo.file} is ${photo.width}×${photo.height}`,
      });
    }
  }

  const names = new Set(
    [nameLatin, nameArabic, p.nameFr].filter((n): n is string => n !== null),
  );
  const aliases = [
    ...new Set([...p.aliases, ...(o.aliases?.value ?? [])]),
  ].filter((a) => !names.has(a));

  // Decision P26: every field's confidence, from the votes each source gives.
  const boxes = [en, frCareer].filter((b): b is Infobox => b !== null);
  const lineOf = (b: Infobox) =>
    b.positionText ? lineFromLabel(firstPosition(b.positionText)) : null;
  const ids = (qids: (string | undefined)[]) =>
    [...new Set(qids.filter((q): q is string => q !== undefined))].sort();
  const some = <T>(
    source: SourceId,
    value: T | null | undefined,
    asOf: string | null = null,
  ): Vote<T>[] =>
    value === null || value === undefined ? [] : [{ source, value, asOf }];
  const openClubs = memberships.filter(
    (m) => !m.national && m.end === null && !m.endUnknown,
  );
  const clubSpells = memberships.filter((m) => !m.national);
  const tunisia = memberships.find(
    (m) => m.teamQid === TUNISIA_TEAM && m.start !== null,
  );
  const wdLine =
    p.positions.map((label) => lineFromLabel(label)).find((l) => l !== null) ??
    null;
  const evidence: Evidence = {
    caps: candidates.map((c) => ({
      source: c.source,
      value: c.caps,
      asOf: c.asOf,
    })),
    goals: candidates.flatMap((c) => some(c.source, c.goals, c.asOf)),
    goalsFloor: ctx.goalsFloor?.get(p.qid) ?? null,
    capsCeiling: tunisia
      ? capsCeiling(ctx.tunisiaMatches, tunisia.start, tunisia.end, capsAsOf)
      : null,
    // An infobox naming no club votes "none"; a club title that does not resolve is no vote.
    clubId: [
      ...boxes.flatMap((b): Vote<string | null>[] =>
        b.currentClub === null
          ? [{ source: sourceOf(b), value: null, asOf: b.clubsAsOf }]
          : some(
              sourceOf(b),
              ctx.index.resolve(b.lang, b.currentClub)?.qid,
              b.clubsAsOf,
            ),
      ),
      ...(openClubs.length === 1
        ? some<string | null>("wikidata", openClubs[0].teamQid)
        : []),
    ],
    history: [
      ...boxes
        .filter((b) => b.spells.length > 0)
        .map((b) => ({
          source: sourceOf(b),
          value: ids(
            b.spells.map((s) => ctx.index.resolve(b.lang, s.clubTitle)?.qid),
          ),
          asOf: b.clubsAsOf,
        })),
      ...(clubSpells.length > 0
        ? some(
            "wikidata",
            ids(clubSpells.map((m) => ctx.index.byQid.get(m.teamQid)?.qid)),
          )
        : []),
    ],
    birthDate: [
      ...some("wikidata", p.birthDate),
      ...some("enwiki", en?.birthDate),
      ...some("frwiki", fr?.birthDate),
    ],
    position: [
      ...some("wikidata", wdLine),
      ...(en ? some("enwiki", lineOf(en)) : []),
      ...(fr ? some("frwiki", lineOf(fr)) : []),
    ],
    nameLatin: [
      ...some("wikidata", nameLatin),
      ...some("enwiki", p.titles.en && titleName(p.titles.en)),
      ...some("frwiki", p.titles.fr && titleName(p.titles.fr)),
    ],
    skipped: {
      national: boxes
        .filter((b) => b.skipped.some((r) => NATIONAL_FIELD.test(r.field)))
        .map(sourceOf),
      career: boxes
        .filter((b) => b.skipped.some((r) => !NATIONAL_FIELD.test(r.field)))
        .map(sourceOf),
    },
  };
  for (const b of boxes) {
    for (const row of b.skipped) {
      flags.push({
        kind: NATIONAL_FIELD.test(row.field)
          ? "caps-row-skipped"
          : "career-row-skipped",
        detail: `${sourceOf(b)} ${row.field} (${row.reason}): ${row.raw}`,
      });
    }
  }
  const chosen: Chosen = {
    caps,
    goals,
    clubQid: club.club?.qid ?? null,
    history: ids(history.spells.map((s) => s.club?.qid)),
    birthDate: p.birthDate,
    position: position.line,
    positionDetailLine: position.detail ? lineFromLabel(position.detail) : null,
    nameLatin,
  };
  const rated = rateFields(prov, chosen, evidence, ctx.today);
  flags.push(...rated.flags);
  if (silent) {
    for (const field of ["caps", "goals"] as const) {
      const entry = rated.provenance[field];
      if (entry && entry.source === silent.source) {
        entry.confidenceNote = "no senior national row";
      }
    }
  }

  return {
    draft: {
      wikidataId: p.qid,
      nameLatin,
      nameArabic,
      nameFrench: p.nameFr,
      aliases,
      position: position.line,
      positionDetail: position.detail,
      birthDate: p.birthDate,
      birthPlace: birth.birthPlace,
      birthCountry: birth.birthCountry,
      governorate: birth.governorate,
      club: club.club,
      caps,
      goals,
      capsAsOf,
      history: history.spells,
      photo,
      wiki: { en: p.titles.en, fr: p.titles.fr, ar: p.titles.ar },
      provenance: rated.provenance,
    },
    flags,
  };
}
