import {
  capsCeiling,
  NATIONAL_FIELD,
  rateFields,
  titleName,
} from "./confidence.ts";
import type { Chosen, Evidence, Vote } from "./confidence.ts";
import { governorateSlug, TUNISIA_TEAM } from "./places.ts";
import type { BirthPlaceKind } from "./confidence.ts";
import { firstPosition, lineFromLabel } from "./positions.ts";
import { playedAfter } from "./results.ts";
import { squadEvidence } from "./squads/evidence.ts";
import { witnessEvidence } from "./witness/apply.ts";
import type { WitnessFile } from "./witness/verdicts.ts";
import type { SquadContext } from "./squads/evidence.ts";
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
  /** The title is pinned to a club in data/overrides.json (`clubTitles`). */
  pinned?(lang: "en" | "fr", title: string): boolean;
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
    pinned: (lang, title) => Object.hasOwn(clubTitles, `${lang}:${title}`),
  };
}

/**
 * A club named on a page (final wave, A6 and B3). A French {{Lien}} to an
 * English article marks a club with no French article: its English title
 * decides, and the French title counts only when pinned in the overrides.
 * In the cache of 4 October 2026, of 103 {{Lien}} clubs with an English
 * title, 59 resolve by it and only Sabri Ameri's by the French one, wrongly
 * ("Al-Safa" is a Syrian club's French article; his club is Al-Safa Club).
 */
export function resolveClub(
  index: ClubIndex,
  lang: "en" | "fr",
  title: string,
  foreign?: string,
): WdClub | null {
  if (!foreign || index.pinned?.(lang, title))
    return index.resolve(lang, title);
  return index.resolve("en", foreign);
}

type Dated = { source: SourceId; asOf: string | null };
// On a date tie the infoboxes come first, then the squad lists (S16).
const SOURCE_ORDER: SourceId[] = [
  "override",
  "enwiki",
  "frwiki",
  "wikidata",
  "enwiki-national",
  "enwiki-squad",
  "frwiki-squad",
  "transfermarkt",
  "national-football-teams",
];

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

const dated = (box: Infobox): Dated => ({
  source: sourceOf(box),
  asOf: box.clubsAsOf,
});

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

/**
 * Decision D-S1-2: override, newest infobox, then one recent open Wikidata
 * club. A staff post (final wave, A5) is no playing club: a page naming as
 * its current club the club where the other page says he works on the staff
 * proposes nothing, and a dated staff post newer than the other page's club
 * means no club.
 */
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
  const boxes = [input.en, input.fr].filter((b): b is Infobox => b !== null);
  const staffPosts = boxes.filter((b) => b.currentClubIsStaff);
  const staffClubs = new Set(
    staffPosts
      .map((b) =>
        b.staffClub === undefined
          ? undefined
          : input.index.resolve(b.lang, b.staffClub)?.qid,
      )
      .filter((q): q is string => q !== undefined),
  );
  for (const box of boxes) {
    const source = sourceOf(box);
    if (box.currentClubIsStaff)
      flags.push({
        kind: "club-staff-role",
        detail: `${source}: ${box.title}`,
      });
    if (box.currentClub === null) continue;
    const club = resolveClub(
      input.index,
      box.lang,
      box.currentClub,
      box.currentClubForeign,
    );
    if (!club) {
      flags.push({
        kind: "club-unresolved",
        detail: `${source}: ${box.currentClub}${box.currentClubForeign ? ` (English article: ${box.currentClubForeign})` : ""}`,
      });
      continue;
    }
    if (staffClubs.has(club.qid)) {
      // Mehdi Nafti, Maher Kanzari: one page has him coaching the club the
      // other page gives as his current club.
      flags.push({
        kind: "club-staff-role",
        detail: `${source}: ${box.currentClub} is where the other page has him on the staff`,
      });
      continue;
    }
    proposals.push({ source, asOf: box.clubsAsOf, club, ref: box.title });
  }
  proposals.sort(newestFirst);
  // Mohamed Ben Othman: a staff post dated after the other page's club.
  const newerStaff = staffPosts
    .filter((b) => b.clubsAsOf !== null)
    .sort((a, b) => newestFirst(dated(a), dated(b)))[0];
  const best = proposals[0];
  if (
    !input.override &&
    newerStaff?.clubsAsOf &&
    best &&
    (best.asOf === null || newerStaff.clubsAsOf > best.asOf)
  ) {
    flags.push({
      kind: "club-staff-role",
      detail: `${sourceOf(newerStaff)} staff post (${newerStaff.clubsAsOf}) is newer than ${best.source} ${best.club.nameEn ?? best.club.qid} (${best.asOf ?? "undated"})`,
    });
    return { club: null, provenance: null, flags };
  }
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
        const club = resolveClub(
          input.index,
          best.box.lang,
          s.clubTitle,
          s.clubTitleForeign,
        );
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

/** Decision P35 (replaces D-S1-7): the majority of the two pages and Wikidata; overrides beat everything. */
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

  // Votes in a fixed order: the English page, the French page, Wikidata.
  const votes = (
    [
      ["enwiki", enLine, input.en?.title],
      ["frwiki", frLine, input.fr?.title],
      ["wikidata", wdLine, `P413 ${input.qid}`],
    ] as const
  ).flatMap(([source, l, ref]) =>
    l === null ? [] : [{ source, line: l, ref }],
  );
  const say = (vs: typeof votes) =>
    vs.map((v) => `${v.source} ${v.line}`).join(", ");

  let line: Line | null = null;
  /** Three different lines, Wikidata deciding: no page wording fits it. */
  let threeWay = false;
  if (input.override) {
    line = input.override.value;
    prov.position = fromOverride(input.override);
  } else if (votes.length > 0) {
    // A line two or three sources give wins. Without a majority: of the two
    // pages, the English one; of one page and Wikidata, the page; of three
    // different lines, Wikidata (P35: it decides when the pages disagree).
    const majority = votes.find(
      (v) => votes.filter((w) => w.line === v.line).length >= 2,
    );
    const chosen =
      majority ??
      (votes.length === 3
        ? votes[2]
        : (votes.find((v) => v.source !== "wikidata") ?? votes[0]));
    line = chosen.line;
    threeWay = !majority && votes.length === 3;
    prov.position = provenance(chosen.source, input.today, null, chosen.ref);
    const dissent = votes.filter((v) => v.line !== chosen.line);
    if (dissent.length > 0) {
      const agree = votes.filter((v) => v.line === chosen.line);
      flags.push({
        kind: "position-disagrees",
        detail: majority
          ? `${say(dissent)} against ${agree.map((v) => v.source).join(", ")} ${chosen.line}`
          : `no majority: ${say(votes)}`,
      });
    }
  }

  // The wording comes from a page that gives the chosen line, if one does.
  const pages = [
    {
      source: "enwiki" as const,
      text: enText,
      line: enLine,
      title: input.en?.title,
    },
    {
      source: "frwiki" as const,
      text: frText,
      line: frLine,
      title: input.fr?.title,
    },
  ];
  const wording = pages.find((pg) => pg.text !== null && pg.line === line);
  let detail: string | null = null;
  if (input.detailOverride) {
    detail = input.detailOverride.value;
    prov.positionDetail = fromOverride(input.detailOverride);
  } else if (wording) {
    detail = wording.text;
    prov.positionDetail = provenance(
      wording.source,
      input.today,
      null,
      wording.title,
    );
  } else if (threeWay) {
    // Both pages give another line than the chosen one: no wording.
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

/**
 * Decisions P37-P39: the birth date two or three of the English page, the
 * French page and Wikidata give. One page against Wikidata: the page (rated
 * low). Three different dates: Wikidata. An override beats everything. Any
 * source that differs is flagged.
 */
export function pickBirthDate(input: {
  qid: string;
  wikidata: string | null;
  en: Infobox | null;
  fr: Infobox | null;
  override?: OverrideValue<string>;
  today: string;
}): { date: string | null; provenance?: Provenance; flags: Found[] } {
  if (input.override)
    return {
      date: input.override.value,
      provenance: fromOverride(input.override),
      flags: [],
    };
  // Votes in a fixed order: the English page, the French page, Wikidata.
  const votes = (
    [
      ["enwiki", input.en?.birthDate, input.en?.title],
      ["frwiki", input.fr?.birthDate, input.fr?.title],
      ["wikidata", input.wikidata, `P569 ${input.qid}`],
    ] as const
  ).flatMap(([source, date, ref]) =>
    date ? [{ source, date, ref: ref ?? "" }] : [],
  );
  if (votes.length === 0) return { date: null, flags: [] };
  const wd = votes.find((v) => v.source === "wikidata");
  const agreeing = (date: string) => votes.filter((v) => v.date === date);
  const majority = votes.find((v) => agreeing(v.date).length >= 2);
  const chosenDate =
    majority?.date ??
    (votes.length === 3
      ? wd!.date
      : (votes.find((v) => v.source !== "wikidata") ?? votes[0]).date);
  const agree = agreeing(chosenDate);
  // Wikidata stays the source of a date it gives, as before the final wave.
  const chosen = agree.find((v) => v.source === "wikidata") ?? agree[0];
  const dissent = votes.filter((v) => v.date !== chosenDate);
  const say = (vs: typeof votes) =>
    vs.map((v) => `${v.source} ${v.date}`).join(", ");
  const flags: Found[] =
    dissent.length === 0
      ? []
      : [
          {
            kind: "birthdate-sources-disagree",
            detail:
              agree.length >= 2 || votes.length === 2
                ? `${say(dissent)} against ${agree.map((v) => v.source).join(", ")} ${chosenDate}`
                : `no majority: ${say(votes)}`,
          },
        ];
  return {
    date: chosenDate,
    provenance: provenance(chosen.source, input.today, null, chosen.ref),
    flags,
  };
}

/**
 * What the birthplace says, for decision P36: a Tunisian place resolved to a
 * governorate, a place abroad with its country, Tunisia only, a place with
 * no country and no governorate (final wave, A9), or a Tunisian place with
 * no governorate.
 */
function placeKind(
  p: WdPlayer,
  birthCountry: string | null,
  governorate: string | null,
): BirthPlaceKind {
  if (p.birthPlaceQid === TUNISIA) return "country-only";
  if (governorate !== null) return "governorate";
  if (birthCountry !== null && birthCountry !== "TN")
    return p.birthPlaceName ? "abroad" : "no-place";
  if (birthCountry === null) return "no-country";
  return "unresolved";
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
  /** What the birthplace says, for its rating (P36). */
  place: BirthPlaceKind;
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
    place: placeKind(p, birthCountry, governorate),
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
  /**
   * Decision P42 (P47): the squad lists and the rows matched to each
   * footballer. Absent when no list was read: the merge is then exactly
   * what it was before the squad lists.
   */
  squads?: SquadContext;
  /**
   * Decision P48: data/witness.json, the private witness's verdicts. Absent
   * or empty, the merge is what it was before them.
   */
  witness?: WitnessFile;
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

/**
 * The club the merge gives a footballer (an override included), without the
 * rest of the merge: for the squad lists' namesake guard (S12).
 */
export function chosenClubOf(p: WdPlayer, ctx: MergeContext): string | null {
  const o = ctx.overrides.players[p.qid] ?? {};
  const en = p.titles.en ? (ctx.infoboxes.en.get(p.titles.en) ?? null) : null;
  const fr = p.titles.fr ? (ctx.infoboxes.fr.get(p.titles.fr) ?? null) : null;
  return (
    pickClub({
      en,
      fr: dropUndatedFrench(en, fr).fr,
      memberships: ctx.memberships.get(p.qid) ?? [],
      index: ctx.index,
      override: o.club,
      today: ctx.today,
    }).club?.qid ?? null
  );
}

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

  const birthDate = pickBirthDate({
    qid: p.qid,
    wikidata: p.birthDate,
    en,
    fr,
    override: o.birthDate,
    today: ctx.today,
  });
  flags.push(...birthDate.flags);
  if (birthDate.provenance) prov.birthDate = birthDate.provenance;
  if (birthDate.date?.endsWith("-01-01") && !o.birthDate) {
    flags.push({
      kind: "birthdate-january-first",
      detail: `${birthDate.date} may stand for a year only`,
    });
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

  // P42: the squad lists vote on the club and may give the caps (S7, S8).
  const squad = ctx.squads
    ? squadEvidence({
        sightings: ctx.squads.sightings.get(p.qid) ?? [],
        lists: ctx.squads.lists,
        chosenClub: club.club?.qid ?? null,
        index: ctx.index,
        namesakes: ctx.squads.namesakes?.get(p.qid),
      })
    : null;
  if (squad) flags.push(...squad.flags);

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
  if (squad) candidates.push(...squad.capsCandidates);
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
  // Decision P34: with no source of caps, a 0 inferred from absence. The
  // witnesses, in this order: the English page and the French page (each
  // with no senior Tunisia row), and Wikidata (memberships listed, none of
  // them the senior team). Absence has no as-of date. There is no absence
  // when a page skipped a national-team row (a Tunisia row may exist) or
  // Wikidata lists the senior team: the caps are then unknown, not 0.
  const anyNationalSkip = [en, fr].some(
    (b) => b !== null && b.skipped.some((r) => NATIONAL_FIELD.test(r.field)),
  );
  const wdListsSenior = memberships.some((m) => m.teamQid === TUNISIA_TEAM);
  // A page with a senior Tunisia row but no readable caps proves he is an
  // international: his caps are unknown, not 0 (fix round 5).
  const pageSeniorRow = [en, fr].find((b) => b !== null && b.seniorRow);
  // Wikidata testifies only when it lists memberships and no national team
  // of any country or age group.
  const wdNoNationalTeam =
    memberships.length > 0 && !memberships.some((m) => m.national);
  const witnesses: { source: SourceId; ref: string }[] =
    capsPick.chosen || anyNationalSkip || wdListsSenior || pageSeniorRow
      ? []
      : [
          ...(en ? [{ source: "enwiki" as const, ref: en.title }] : []),
          ...(fr ? [{ source: "frwiki" as const, ref: fr.title }] : []),
          ...(wdNoNationalTeam
            ? [{ source: "wikidata" as const, ref: `P54 ${p.qid}` }]
            : []),
        ];
  const silent = witnesses[0];
  if (silent) {
    prov.caps = provenance(silent.source, ctx.today, null, silent.ref);
    if (o.caps && o.caps.value > 0 && !o.goals) {
      // Jalel says he played: the page's silence says nothing about goals.
      prov.goals = { source: "none", retrievedAt: ctx.today };
      flags.push({
        kind: "goals-unknown",
        detail: `caps ${o.caps.value} from an override; ${silent.source} has no senior row and no source gives his goals`,
      });
    } else {
      prov.goals = { ...prov.caps };
    }
  } else if (!capsPick.chosen) {
    prov.caps = { source: "none", retrievedAt: ctx.today };
    prov.goals = { source: "none", retrievedAt: ctx.today };
    if (!o.caps) {
      flags.push({
        kind: "caps-unknown",
        detail: pageSeniorRow
          ? `${sourceOf(pageSeniorRow)} has a senior Tunisia row with no readable caps`
          : wdListsSenior
            ? "Wikidata lists him in the senior team, but no source gives his caps or goals"
            : "no source gives his Tunisia caps or goals",
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

  // P48: the private witness's fresh verdicts on the values chosen now.
  const witness = witnessEvidence(
    ctx.witness,
    p.qid,
    { clubQid: club.club?.qid ?? null, caps },
    ctx.today,
  );

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
    caps: [
      ...candidates.map((c) => ({
        source: c.source,
        value: c.caps,
        asOf: c.asOf,
      })),
      ...witness.capsVotes,
    ],
    goals: candidates.flatMap((c) => some(c.source, c.goals, c.asOf)),
    goalsFloor: ctx.goalsFloor?.get(p.qid) ?? null,
    // A7: both pages show a closed senior career; the later end year.
    capsClosedEnd:
      en?.seniorRow &&
      fr?.seniorRow &&
      !en.nationalOpen &&
      !fr.nationalOpen &&
      en.nationalEnd !== null &&
      fr.nationalEnd !== null
        ? Math.max(en.nationalEnd, fr.nationalEnd)
        : null,
    birthPlace: birth.place,
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
              resolveClub(
                ctx.index,
                b.lang,
                b.currentClub,
                b.currentClubForeign,
              )?.qid,
              b.clubsAsOf,
            ),
      ),
      ...(openClubs.length === 1
        ? some<string | null>("wikidata", openClubs[0].teamQid)
        : []),
      ...(squad?.clubVotes ?? []),
      ...witness.clubVotes,
    ],
    history: [
      ...boxes
        .filter((b) => b.spells.length > 0)
        .map((b) => ({
          source: sourceOf(b),
          value: ids(
            b.spells.map(
              (s) =>
                resolveClub(ctx.index, b.lang, s.clubTitle, s.clubTitleForeign)
                  ?.qid,
            ),
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
    // P35 order: the English page, the French page, Wikidata.
    position: [
      ...(en ? some("enwiki", lineOf(en)) : []),
      ...(fr ? some("frwiki", lineOf(fr)) : []),
      ...some("wikidata", wdLine),
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
    birthDate: birthDate.date,
    position: position.line,
    positionDetailLine: position.detail ? lineFromLabel(position.detail) : null,
    nameLatin,
  };
  const rated = rateFields(prov, chosen, evidence, ctx.today);
  flags.push(...rated.flags);
  if (silent) {
    // P34: medium on two or more witnesses, low on one, never high. A
    // martj42 goal by him still makes 0 goals low.
    const floor = evidence.goalsFloor ?? 0;
    for (const field of ["caps", "goals"] as const) {
      const entry = rated.provenance[field];
      if (!entry || entry.source !== silent.source) continue;
      const scored = field === "goals" && floor > 0;
      entry.confidence = witnesses.length >= 2 && !scored ? "medium" : "low";
      entry.agreeing = witnesses.map((w) => w.source);
      entry.confidenceNote = scored
        ? `no senior national row; martj42 lists ${floor} goals by him`
        : "no senior national row";
      // P34 rates these; the band rule (D-S2-6) does not apply.
      delete entry.bandAgreed;
    }
  }

  // S21 = b: a fresh "differs" is a flag, and the field is rated low until
  // Jalel settles it; an override is his decision and stays high.
  for (const d of witness.differs) {
    const ours =
      d.field === "caps"
        ? String(caps)
        : (club.club?.nameEn ?? club.club?.qid ?? "none");
    flags.push({
      kind: d.kind,
      detail: `${d.site} checked on ${d.checkedOn}: differs from ${ours}`,
    });
    const entry = rated.provenance[d.field];
    if (entry && entry.source !== "override") {
      entry.confidence = "low";
      entry.confidenceNote = `${d.site} checked on ${d.checkedOn}: differs (P48)`;
      // A "differs" waits for Jalel even at band level (S21 = b).
      delete entry.bandAgreed;
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
      birthDate: birthDate.date,
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
