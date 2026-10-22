import type { Line } from "@/engine/chkoun/types.ts";
import type { Spin } from "@/engine/season/spin.ts";
import type {
  Candidate,
  Decade,
  Names,
  RatingInputs,
  SeasonData,
} from "@/engine/season/types.ts";

// What the 30–0 API shows of a spin and a squad: names, ratings and the
// inputs behind them, with a doubt flag for the "?" on the card.

export type CandidateView = {
  id: string;
  names: Names;
  rating: number;
  inputs: RatingInputs;
  doubt: boolean;
};

export type SpinView = {
  slot: number;
  line: Line;
  club: Names & { id: string };
  decade: Decade;
  /** The spun club and decade offered nobody: the spin widened (D-S3-2). */
  widened: boolean;
  candidates: CandidateView[];
};

const NO_NAMES: Names = { nameLatin: "", nameArabic: null, nameFrench: null };

export function candidateView(data: SeasonData, c: Candidate): CandidateView {
  const p = data.people.get(c.footballerId);
  return {
    id: c.footballerId,
    names: p
      ? {
          nameLatin: p.nameLatin,
          nameArabic: p.nameArabic,
          nameFrench: p.nameFrench,
        }
      : NO_NAMES,
    rating: c.rating,
    inputs: c.inputs,
    doubt:
      c.inputs.capsFromBand || c.inputs.goalsDoubt || c.inputs.historyDoubt,
  };
}

export function spinView(data: SeasonData, s: Spin, slot: number): SpinView {
  return {
    slot,
    line: s.line,
    club: { id: s.clubId, ...(data.clubs.get(s.clubId) ?? NO_NAMES) },
    decade: s.decade,
    widened: s.level > 1,
    candidates: s.candidates.map((c) => candidateView(data, c)),
  };
}
