import type { Metadata } from "next";
import {
  alternateOpenGraphLocales,
  openGraphLocale,
  shareImageSize,
} from "@/share";
import { site } from "@/site";
import { defaultLocale, localeInfo, locales, type Locale } from "./locales";

// Metadata for a page under a locale (P9): its own title, description,
// canonical URL and language alternates, and a link preview. The hub's
// layout says the same for the hub; pages below it replace every field
// they set (Next merges metadata shallowly), so each page sets them all.

/** The hreflang links for `path` ("" for the hub, "/chkoun"), x-default included. */
export function pageLanguages(path: string): Record<string, string> {
  return {
    ...Object.fromEntries(
      locales.map((other) => [other, `${localeInfo[other].prefix}${path}`]),
    ),
    "x-default": `${localeInfo[defaultLocale].prefix}${path}`,
  };
}

export type PageMetadataInput = {
  locale: Locale;
  /** "" for the hub, "/chkoun", "/sources" … */
  path: string;
  title: string;
  description: string;
  image: { url: string; alt: string };
  /** False keeps the page out of search engines (the go-live gate). */
  index?: boolean;
};

export function pageMetadata({
  locale,
  path,
  title,
  description,
  image,
  index = true,
}: PageMetadataInput): Metadata {
  const url = `${localeInfo[locale].prefix}${path}`;
  const preview = {
    url: image.url,
    ...shareImageSize,
    type: "image/png",
    alt: image.alt,
  };
  return {
    metadataBase: new URL(site.url),
    title,
    description,
    openGraph: {
      type: "website",
      siteName: site.name,
      url,
      title,
      description,
      locale: openGraphLocale[locale],
      alternateLocale: alternateOpenGraphLocales(locale),
      images: [preview],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [preview],
    },
    alternates: { canonical: url, languages: pageLanguages(path) },
    ...(index ? {} : { robots: { index: false, follow: true } }),
  };
}
