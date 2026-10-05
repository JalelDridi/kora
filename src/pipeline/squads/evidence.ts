import type { Vote } from "../confidence.ts";
import type { CapsCandidate, ClubIndex, Found } from "../merge.ts";
import type { SourceId } from "../types.ts";
import type { SquadList } from "../wiki/squads.ts";
import type { Sighting } from "./match.ts";

// Decisions P42 and P47: what the squad lists say about one footballer. A
// list never chooses his club (S7 = a): it votes, and a difference is a flag
// for Jalel. The national table's caps are a candidate like an infobox's
// (S8 = a). The rating code is unchanged: the rules come from the votes.
// Pure.

/** Another footballer of the same name, and the club the merge gives him (S12). */
export type Namesake = { qid: string; clubQid: string | null };

/** MergeContext.squads: absent when no squad list was read. */
export type SquadContext = {
  /** Per footballer (Wikidata id), the rows that are his. */
  sightings: Map<string, Sighting[]>;
  lists: SquadList[];
  /** Per footballer, the other footballers of his name (S12). */
  namesakes?: Map<string, Namesake[]>;
};

export function squadSource(list: SquadList): SourceId {
  return list.kind === "national"
    ? "enwiki-national"
    : list.lang === "en"
      ? "enwiki-squad"
      : "frwiki-squad";
}

/** The club a club list belongs to: its article, as the club index knows it. */
export function listClub(list: SquadList, index: ClubIndex): string | null {
  return list.kind === "club"
    ? (index.resolve(list.lang, list.page)?.qid ?? null)
    : null;
}

export type SquadEvidence = {
  clubVotes: Vote<string | null>[];
  capsCandidates: CapsCandidate[];
  flags: Found[];
};

export function squadEvidence(input: {
  sightings: Sighting[];
  lists: SquadList[];
  /** The club the merge chose (an override included), as a Wikidata id. */
  chosenClub: string | null;
  index: ClubIndex;
  namesakes?: Namesake[];
}): SquadEvidence {
  const { index, chosenClub } = input;
  const flags: Found[] = [];
  const name = (qid: string | null) =>
    qid === null ? "none" : (index.byQid.get(qid)?.nameEn ?? qid);
  const where = (s: Sighting) =>
    `${squadSource(s.list)} ${s.list.page} (${s.asOf ?? "undated"})`;

  // A vote per current squad row: the club of a club list; the national
  // table's club column, when the index knows the club (S9).
  type Candidate = { sighting: Sighting; club: string };
  const votes: Candidate[] = [];
  for (const s of input.sightings) {
    if (s.list.status !== "current" || s.part !== "squad") continue;
    const club =
      s.list.kind === "club"
        ? listClub(s.list, index)
        : s.clubLink
          ? (index.resolve("en", s.clubLink)?.qid ?? null)
          : null;
    if (club !== null) votes.push({ sighting: s, club });
  }

  // S12: a link to him naming the club that a namesake already has.
  const kept = votes.filter(({ sighting, club }) => {
    if (sighting.by !== "link" || club === chosenClub) return true;
    const twin = input.namesakes?.find((n) => n.clubQid === club);
    if (!twin) return true;
    flags.push({
      kind: "squad-namesake",
      detail: `${where(sighting)} lists him at ${name(club)}, the club of his namesake ${twin.qid}; no vote`,
    });
    return false;
  });

  // S11: the current lists of two clubs name him: neither votes.
  const clubLists = kept.filter((v) => v.sighting.list.kind === "club");
  const listed = [...new Set(clubLists.map((v) => v.club))];
  let counted = kept;
  if (listed.length > 1) {
    flags.push({
      kind: "squad-lists-disagree",
      detail: `${clubLists.map((v) => `${where(v.sighting)}: ${name(v.club)}`).join("; ")}; no vote`,
    });
    counted = kept.filter((v) => v.sighting.list.kind !== "club");
  }

  const clubVotes: Vote<string | null>[] = [];
  for (const { sighting, club } of counted) {
    const source = squadSource(sighting.list);
    if (clubVotes.some((v) => v.source === source)) continue;
    clubVotes.push({ source, value: club, asOf: sighting.asOf });
  }

  // S7: a vote for another club, or for a club where none is chosen.
  const differ = counted.filter((v) => v.club !== chosenClub);
  if (differ.length > 0)
    flags.push({
      kind: "club-squad-list-differs",
      detail: `${differ.map((v) => `${where(v.sighting)} lists him at ${name(v.club)}`).join("; ")}; chosen: ${name(chosenClub)}`,
    });

  // S10: his chosen club has a current list, and no list of it names him.
  if (chosenClub !== null) {
    const ofClub = input.lists.filter(
      (l) =>
        l.kind === "club" &&
        l.status === "current" &&
        listClub(l, index) === chosenClub,
    );
    const seen = input.sightings.some(
      (s) => s.list.kind === "club" && listClub(s.list, index) === chosenClub,
    );
    if (ofClub.length > 0 && !seen)
      flags.push({
        kind: "club-not-on-squad-list",
        detail: `${ofClub.map((l) => `${squadSource(l)} ${l.page} (${l.date})`).join(" and ")} does not list him at ${name(chosenClub)}`,
      });
  }

  // S8: the national table's count is a caps candidate, dated by the table.
  const capsCandidates: CapsCandidate[] = input.sightings
    .filter(
      (s) =>
        s.list.kind === "national" &&
        s.part === "squad" &&
        s.caps !== undefined &&
        s.asOf !== null,
    )
    .slice(0, 1)
    .map((s) => ({
      source: "enwiki-national" as const,
      asOf: s.asOf,
      caps: s.caps!,
      goals: s.goals ?? null,
      ref: s.list.page,
    }));

  return { clubVotes, capsCandidates, flags };
}
