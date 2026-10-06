import type { Pool } from "./pipeline/types.ts";

// The photo credits on the Sources page (plan Task 14, P30): one row for
// every footballer whose Commons photo is copied into public/photos, built
// from the credit stored beside it in data/pool.json. Every photo that can
// appear on a card is credited here. The thumbnails are neither cropped nor
// retouched, so the changes column always says "none".

export type PhotoCredit = {
  id: string;
  nameLatin: string;
  nameArabic: string | null;
  nameFrench: string | null;
  author: string | null;
  licence: string;
  licenceUrl: string | null;
  /** The Commons file name, e.g. "File:Example.jpg". */
  file: string;
  /** The Commons file page. */
  sourceUrl: string;
  changes: "none";
};

export function photoCredits(pool: Pool): PhotoCredit[] {
  return pool.players
    .filter((p) => p.photo?.path)
    .map((p) => ({
      id: p.id,
      nameLatin: p.nameLatin,
      nameArabic: p.nameArabic,
      nameFrench: p.nameFrench,
      author: p.photo!.author,
      licence: p.photo!.licence,
      licenceUrl: p.photo!.licenceUrl,
      file: p.photo!.file,
      sourceUrl: p.photo!.sourceUrl,
      changes: "none" as const,
    }))
    .sort(
      (a, b) =>
        a.nameLatin.localeCompare(b.nameLatin, "en") ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}
