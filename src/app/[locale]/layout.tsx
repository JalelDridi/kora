import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic, Inter } from "next/font/google";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { defaultLocale, isLocale, localeInfo, locales } from "@/i18n/locales";
import { webAnalyticsEnabled } from "@/analytics/web-analytics";
import {
  alternateOpenGraphLocales,
  openGraphLocale,
  shareImagePath,
  shareImageSize,
} from "@/share";
import { site } from "@/site";
import "../globals.css";

const latin = Inter({ subsets: ["latin"], variable: "--font-latin" });

const arabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "600", "700"],
  variable: "--font-arabic",
});

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

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

  return (
    <html
      lang={locale}
      dir={localeInfo[locale].dir}
      className={`${latin.variable} ${arabic.variable}`}
    >
      <body className="font-sans antialiased">
        {children}
        {webAnalyticsEnabled(process.env.VERCEL) ? <Analytics /> : null}
      </body>
    </html>
  );
}
