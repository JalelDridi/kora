import type { MetadataRoute } from "next";
import { defaultLocale, localeInfo, locales } from "@/i18n/locales";
import { site } from "@/site";

const absolute = (prefix: string) => `${site.url}${prefix}`;

// The three hubs with their language alternates, matching each page's
// hreflang links (decision P9). Games are added here as they ship; the
// admin pages never are (decision H16).
export default function sitemap(): MetadataRoute.Sitemap {
  const languages = {
    ...Object.fromEntries(
      locales.map((l) => [l, absolute(localeInfo[l].prefix)]),
    ),
    "x-default": absolute(localeInfo[defaultLocale].prefix),
  };
  return locales.map((l) => ({
    url: absolute(localeInfo[l].prefix),
    alternates: { languages },
  }));
}
