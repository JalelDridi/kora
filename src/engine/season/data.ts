// The 30–0 candidates (D-S3-5, D-S3-6): every footballer who played a
// non-loan spell at a Ligue 1 club, once per club, decade and line, with the
// rating his card shows. Pure: the pool, the two curated files and the year
// are passed in.

import { capsBand } from "../chkoun/caps-band.ts";
import { rate, RATING } from "./rating.ts";
import { DECADES, tripleKey } from "./types.ts";
import type {
  Candidate,
  Decade,
  Names,
  Person,
  SeasonData,
  SeasonSource,
  SourceHonour,
  SourceProvenance,
  SourceSpell,
  Titles,
} from "./types.ts";

export type SeasonFiles = {
  strength: { clubs: Record<string, number> };
  afcon: { footballers: string[] };
};

const TITLE_KIND: Record<string, keyof Titles> = {
  tn_ligue1: "league",
  tn_cup: "cup",
  caf_cl: "caf",
  caf_cc: "caf",
};

const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** A field rated low, or with no confidence at all: "?" on the card. */
const doubtful = (p: SourceProvenance | undefined) =>
  p?.confidence === undefined || p.confidence === "low";

const covers = (s: SourceSpell, year: number, currentYear: number) =>
  (s.from ?? Infinity) <= year && year <= (s.to ?? currentYear);

function titlesOver(
  honours: readonly SourceHonour[],
  spells: readonly SourceSpell[],
  currentYear: number,
): Titles {
  const titles: Titles = { league: 0, cup: 0, caf: 0 };
  for (const h of honours) {
    const kind = TITLE_KIND[h.competition];
    if (kind && spells.some((s) => covers(s, h.seasonEnd, currentYear)))
      titles[kind] += 1;
  }
  return titles;
}

export function buildSeasonData(
  src: SeasonSource,
  files: SeasonFiles,
  currentYear: number,
): SeasonData {
  const ligue1 = src.clubs.filter((c) => c.ligue1);
  const clubIds = ligue1.map((c) => c.id).sort(byString);
  const inLigue1 = new Set(clubIds);
  const clubs = new Map<string, Names>(
    ligue1.map((c) => [
      c.id,
      {
        nameLatin: c.nameLatin,
        nameArabic: c.nameArabic,
        nameFrench: c.nameFrench,
      },
    ]),
  );
  const honoursOf = new Map<string, SourceHonour[]>();
  for (const h of src.honours) {
    const list = honoursOf.get(h.clubId) ?? [];
    list.push(h);
    honoursOf.set(h.clubId, list);
  }
  const afcon = new Set(files.afcon.footballers);

  const people = new Map<string, Person>();
  const index = new Map<string, Candidate[]>();
  const combos = new Map<string, string[]>();

  for (const p of src.players) {
    const groups = new Map<
      string,
      { clubId: string; decade: Decade; spells: SourceSpell[] }
    >();
    for (const s of p.history) {
      if (
        s.loan ||
        s.clubId === null ||
        !inLigue1.has(s.clubId) ||
        s.from === null
      )
        continue;
      for (const decade of DECADES) {
        if (s.from > decade + 9 || (s.to ?? currentYear) < decade) continue;
        const key = tripleKey(s.clubId, decade, p.position);
        const group = groups.get(key) ?? {
          clubId: s.clubId,
          decade,
          spells: [],
        };
        group.spells.push(s);
        groups.set(key, group);
      }
    }
    if (groups.size === 0) continue;

    // D-S3-6: a doubtful count is rated from its band's midpoint, unless the
    // sources agree on the band. Goals per cap use the stored count.
    const capsProv = p.provenance.caps;
    const capsSure =
      capsProv?.confidence === "high" ||
      capsProv?.confidence === "medium" ||
      capsProv?.bandAgreed === true;
    const caps = capsSure ? p.caps : RATING.bandCaps[capsBand(p.caps)];
    const goalsPerCap = p.caps >= 5 ? p.goals / p.caps : 0;

    for (const [key, g] of groups) {
      const known = g.spells.filter((s) => s.apps !== null);
      const inputs = {
        line: p.position,
        decade: g.decade,
        caps,
        capsFromBand: !capsSure,
        goalsPerCap,
        goalsDoubt: doubtful(p.provenance.goals),
        apps:
          known.length === 0
            ? null
            : known.reduce((sum, s) => sum + (s.apps ?? 0), 0),
        historyDoubt: doubtful(p.provenance.history),
        titles: titlesOver(
          honoursOf.get(g.clubId) ?? [],
          g.spells,
          currentYear,
        ),
        afcon2004: afcon.has(p.wikidataId),
      };
      const list = index.get(key) ?? [];
      list.push({
        footballerId: p.id,
        clubId: g.clubId,
        decade: g.decade,
        line: p.position,
        rating: rate(inputs),
        inputs,
      });
      index.set(key, list);
    }
    people.set(p.id, {
      id: p.id,
      nameLatin: p.nameLatin,
      nameArabic: p.nameArabic,
      nameFrench: p.nameFrench,
      line: p.position,
    });
    combos.set(p.id, [...groups.keys()].sort(byString));
  }
  for (const list of index.values())
    list.sort((a, b) => byString(a.footballerId, b.footballerId));

  const table = Object.entries(files.strength.clubs)
    .map(([clubId, strength]) => ({ clubId, strength }))
    .sort((a, b) => byString(a.clubId, b.clubId));

  return { people, index, combos, clubIds, clubs, table };
}

/**
 * A candidate's share code, `{footballerId}_{k}`: k is the place of his
 * club, decade and line among his own sorted triples. T-S3-6: `_`, never
 * `.`, because src/proxy.ts skips any path with a dot.
 */
export function slotCode(data: SeasonData, c: Candidate): string {
  const k =
    data.combos
      .get(c.footballerId)
      ?.indexOf(tripleKey(c.clubId, c.decade, c.line)) ?? -1;
  if (k < 0)
    throw new Error(
      `slotCode: ${c.footballerId} is not a candidate for ${c.clubId}, ${c.decade}`,
    );
  return `${c.footballerId}_${k}`;
}

/** The candidate a share code names; null for anything else (a dot, an unknown id, k out of range). */
export function readCode(data: SeasonData, code: string): Candidate | null {
  const m = /^([^_~]+)_(\d+)$/.exec(code);
  if (!m) return null;
  const [, id, k] = m;
  if (String(Number(k)) !== k) return null; // one code per candidate: no leading zeros
  const key = data.combos.get(id)?.[Number(k)];
  if (key === undefined) return null;
  return data.index.get(key)?.find((c) => c.footballerId === id) ?? null;
}
