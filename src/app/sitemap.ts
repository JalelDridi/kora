import type { MetadataRoute } from "next";
import { launchGames, liveRoute, type LaunchGame } from "@/games";
import { defaultLocale, localeInfo, locales } from "@/i18n/locales";
import { site } from "@/site";

const absolute = (path: string) => `${site.url}${path}`;

/** Pages every locale has besides the hub and the games. */
export const sitePages = ["/sources", "/privacy"] as const;

// Every public page in the three languages, each with its language
// alternates, matching the pages' hreflang links (decision P9): the hubs,
// each game once its go-live switch is on (src/games.ts), then Sources and
// privacy. The admin pages never are (decision H16).
export function sitemapEntries(
  games: readonly LaunchGame[],
): MetadataRoute.Sitemap {
  const paths = [
    "",
    ...games.flatMap((game) => liveRoute(game) ?? []),
    ...sitePages,
  ];
  return paths.flatMap((path) => {
    const languages = {
      ...Object.fromEntries(
        locales.map((l) => [l, absolute(`${localeInfo[l].prefix}${path}`)]),
      ),
      "x-default": absolute(`${localeInfo[defaultLocale].prefix}${path}`),
    };
    return locales.map((l) => ({
      url: absolute(`${localeInfo[l].prefix}${path}`),
      alternates: { languages },
    }));
  });
}

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries(launchGames);
}
