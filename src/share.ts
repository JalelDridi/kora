import type { Locale } from "./i18n/locales";

// Link-preview images (hub-audit 3.1-3.2, launch-readiness D2): static PNGs
// rendered by scripts/render-images.ts, because next/og reverses Arabic words
// and crashes on IBM Plex Sans Arabic. Facebook caches by URL: bump the
// version whenever an image changes. Type-only imports: the script runs this
// file with Node's type stripping.
export const shareImageVersion = 1;

export const shareImageSize = { width: 1200, height: 630 } as const;

// WhatsApp may drop preview images above about 300 KB.
export const shareImageMaxBytes = 250_000;

export function shareImagePath(prefix: string): string {
  return `/og${prefix}-v${shareImageVersion}.png`;
}

/**
 * A game page's own preview (plan Task 15): the K mark, "Kora" and the
 * game's name; never a footballer or a crest (P33). /og/chkoun-ar-v1.png.
 */
export function gameShareImagePath(game: string, prefix: string): string {
  return `/og/${game}-${prefix.slice(1)}-v${shareImageVersion}.png`;
}

// Facebook has no Tunisian or Arabizi locale (decision H7).
export const openGraphLocale: Record<Locale, string> = {
  "ar-TN": "ar_AR",
  "ar-Latn-TN": "ar_AR",
  fr: "fr_FR",
};

export function alternateOpenGraphLocales(locale: Locale): string[] {
  const own = openGraphLocale[locale];
  return [...new Set(Object.values(openGraphLocale))].filter((l) => l !== own);
}
