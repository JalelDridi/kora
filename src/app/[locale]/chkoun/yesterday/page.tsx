import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  ChkounPageBody,
  YESTERDAY_ROUTE,
} from "@/components/chkoun/chkoun-page";
import { isLocale, localeInfo } from "@/i18n/locales";
import { pageMetadata } from "@/i18n/page-metadata";
import { gameShareImagePath } from "@/share";
import { site } from "@/site";

// Yesterday's footballer (mobile polish M7): the same static shell as
// today's page, with the island in mode "yesterday". It plays yesterday's
// number through the same guess endpoint and never touches the record.
// Never indexed, not in the sitemap (it is not a game route): its canonical
// is itself.

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/chkoun/yesterday">) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale });
  return pageMetadata({
    locale,
    path: YESTERDAY_ROUTE,
    title: t("chkoun.yesterday.meta.title"),
    description: t("chkoun.meta.description"),
    image: {
      url: gameShareImagePath("chkoun", localeInfo[locale].prefix),
      alt: `${site.name} · ${t("games.chkoun.name")}`,
    },
    index: false,
  });
}

export default async function ChkounYesterdayPage({
  params,
}: PageProps<"/[locale]/chkoun/yesterday">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return <ChkounPageBody locale={locale} mode="yesterday" />;
}
