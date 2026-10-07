import { capsBand } from "@/engine/chkoun/caps-band.ts";
import type { Line, TileFacts } from "@/engine/chkoun/types.ts";
import { isGuessable } from "@/pipeline/grace.ts";
import type { GovernorateRow, Pool } from "@/pipeline/types.ts";

// What the guess endpoint knows about every footballer: the six tiles'
// facts, who may be guessed (the active pool, D-S2-12, and footballers in
// grace, P54), and the answer's card shown once a game ends. Built from the
// public data/pool.json; pure, so it is tested without files. Only
// attributes.server.ts loads it.

/** The footballer card, sent only when a game has ended. */
export type Card = {
  id: string;
  nameLatin: string;
  nameArabic: string | null;
  nameFrench: string | null;
  clubId: string | null;
  /** `gov:<id>` when born in Tunisia and placed, `abroad:<XX>`, or null. */
  birth: string | null;
  caps: number;
  goals: number;
  line: Line;
  /** Only a copied, credited photo (P30); null otherwise. */
  photo: {
    path: string;
    author: string | null;
    licence: string;
    licenceUrl: string | null;
    sourceUrl: string;
  } | null;
  wiki: { en: string | null; fr: string | null };
};

export type Footballers = {
  /** Facts of every footballer in the pool (an answer may have left the active pool). */
  facts: Map<string, TileFacts>;
  /** Footballers a visitor may guess: the active pool and those in grace (P54). */
  guessable: Set<string>;
  card(id: string): Card | null;
};

export function buildFootballers(
  pool: Pool,
  governorates: GovernorateRow[],
): Footballers {
  const clubs = new Map(pool.clubs.map((c) => [c.id, c]));
  const regions = new Map(governorates.map((g) => [g.id, g.region]));
  const facts = new Map<string, TileFacts>();
  const cards = new Map<string, Card>();
  const guessable = new Set<string>();
  for (const p of pool.players) {
    const club = p.clubId ? clubs.get(p.clubId) : undefined;
    facts.set(p.id, {
      id: p.id,
      clubId: p.clubId,
      clubCountry: club?.country ?? null,
      confederation: club?.confederation ?? null,
      line: p.position,
      birthDate: p.birthDate,
      capsBand: capsBand(p.caps),
      governorate: p.governorate,
      region: p.governorate ? (regions.get(p.governorate) ?? null) : null,
      birthCountry: p.birthCountry,
      pastClubIds: [
        ...new Set(
          p.history
            .map((h) => h.clubId)
            .filter((id): id is string => id !== null),
        ),
      ],
    });
    // The pool carries no build day: a grace date present is in effect (the
    // nightly build removes it once it has passed).
    if (isGuessable(p.pools)) guessable.add(p.id);
    const birth = p.governorate
      ? `gov:${p.governorate}`
      : p.birthCountry && p.birthCountry !== "TN"
        ? `abroad:${p.birthCountry}`
        : null;
    cards.set(p.id, {
      id: p.id,
      nameLatin: p.nameLatin,
      nameArabic: p.nameArabic,
      nameFrench: p.nameFrench,
      clubId: p.clubId,
      birth,
      caps: p.caps,
      goals: p.goals,
      line: p.position,
      photo:
        p.photo && p.photo.path
          ? {
              path: p.photo.path,
              author: p.photo.author,
              licence: p.photo.licence,
              licenceUrl: p.photo.licenceUrl,
              sourceUrl: p.photo.sourceUrl,
            }
          : null,
      wiki: { en: p.wiki.en, fr: p.wiki.fr },
    });
  }
  return { facts, guessable, card: (id) => cards.get(id) ?? null };
}
