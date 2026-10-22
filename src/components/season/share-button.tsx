"use client";

import { ShareButton } from "@/components/chkoun/share-button";
import type { ShareChannel } from "@/components/chkoun/share-button";
import { seasonShareText, shareUrl } from "@/engine/season/share";
import type { Season } from "@/engine/season/simulate";
import type { SeasonStrings } from "./island";

type Props = {
  season: Pick<Season, "w" | "d" | "l" | "points" | "rating">;
  day: string;
  code: string;
  /** The site's address (site.url), as Chkoun? shares it. */
  origin: string;
  /** "/ar", "/tn" or "/fr": the replay link opens in the sharer's language. */
  prefix: string;
  strings: SeasonStrings;
  /** The channel the visitor shared through (season_shared, Task 14). */
  onShared?: (channel: ShareChannel) => void;
};

// The 30–0 share (plan Task 11): the text from src/engine/season/share.ts
// with the replay link on this site, and Chkoun?'s fallbacks (system sheet,
// clipboard, WhatsApp, a box to long-press).
export function SeasonShareButton({
  season,
  day,
  code,
  origin,
  prefix,
  strings: t,
  onShared,
}: Props) {
  const text = seasonShareText({
    header: t.share.header,
    w: season.w,
    d: season.d,
    l: season.l,
    points: season.points,
    pointsLabel: t.share.points,
    rating: season.rating,
    ratingLabel: t.rating,
    url: shareUrl(origin, prefix, day, code),
  });
  return <ShareButton text={text} strings={t.share} onShared={onShared} />;
}
