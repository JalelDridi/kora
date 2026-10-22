import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { notFound } from "next/navigation";
import { preload } from "react-dom";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { defaultLocale, isLocale, localeInfo, locales } from "@/i18n/locales";
import { webAnalyticsEnabled } from "@/analytics/web-analytics";
import { SiteFooter } from "@/components/site-footer";
import {
  alternateOpenGraphLocales,
  openGraphLocale,
  shareImagePath,
  shareImageSize,
} from "@/share";
import { site } from "@/site";
import "../globals.css";

const latin = Inter({ subsets: ["latin"], variable: "--font-latin" });

// The Arabic faces are self-hosted (globals.css) so /ar can preload the three
// it draws above the fold; next/font preloads per declaration, not per
// locale. The 600 face (the page header's link and the switcher) joined the
// list when CI's Linux Chromium measured CLS 0.128 on /ar/sources and
// /ar/privacy from its late arrival moving <main>.
const ARABIC_PRELOADS = [
  "/fonts/plex-arabic-400-v1.woff2",
  "/fonts/plex-arabic-600-v1.woff2",
  "/fonts/plex-arabic-700-v1.woff2",
];

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = { themeColor: site.themeColor };

export async function generateMetadata({
  params,
}: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale });
  const { prefix } = localeInfo[locale];
  const title = t("meta.title");
  const description = t("meta.description");
  // Relative URLs become absolute through metadataBase.
  const image = {
    url: shareImagePath(prefix),
    ...shareImageSize,
    type: "image/png",
    alt: `${site.name} · ${t("hub.tagline")}`,
  };

  return {
    metadataBase: new URL(site.url),
    title,
    description,
    openGraph: {
      type: "website",
      siteName: site.name,
      url: prefix,
      title,
      description,
      locale: openGraphLocale[locale],
      alternateLocale: alternateOpenGraphLocales(locale),
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
    alternates: {
      canonical: prefix,
      languages: {
        ...Object.fromEntries(
          locales.map((other) => [other, localeInfo[other].prefix]),
        ),
        "x-default": localeInfo[defaultLocale].prefix,
      },
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  if (locale === "ar-TN")
    for (const href of ARABIC_PRELOADS)
      preload(href, { as: "font", type: "font/woff2", crossOrigin: "" });
  const t = await getTranslations({ locale, namespace: "footer" });

  return (
    <html lang={locale} dir={localeInfo[locale].dir} className={latin.variable}>
      <body className="font-sans antialiased">
        {children}
        <SiteFooter
          prefix={localeInfo[locale].prefix}
          strings={{
            unofficial: t("unofficial"),
            sources: t("sources"),
            privacy: t("privacy"),
          }}
        />
        {webAnalyticsEnabled(process.env.VERCEL) ? <Analytics /> : null}
      </body>
    </html>
  );
}
