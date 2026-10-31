import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChkounPageBody, ROUTE } from "@/components/chkoun/chkoun-page";
import { getGame } from "@/games";
import { isLocale, localeInfo } from "@/i18n/locales";
import { pageMetadata } from "@/i18n/page-metadata";
import { gameShareImagePath } from "@/share";
import { site } from "@/site";

// Chkoun? (plan Task 12): a static shell per locale. It never reads the
// database or the puzzle. The names a visitor may guess and the label
// tables are a static JSON file per locale (src/app/chkoun-data), fetched
// after the first paint; the game asks /api/chkoun/today once it runs.

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/chkoun">) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale });
  return pageMetadata({
    locale,
    path: ROUTE,
    title: t("chkoun.meta.title"),
    description: t("chkoun.meta.description"),
    image: {
      url: gameShareImagePath("chkoun", localeInfo[locale].prefix),
      alt: `${site.name} · ${t("games.chkoun.name")}`,
    },
    index: getGame("chkoun").live,
  });
}

export default async function ChkounPage({
  params,
}: PageProps<"/[locale]/chkoun">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return <ChkounPageBody locale={locale} mode="today" />;
}
