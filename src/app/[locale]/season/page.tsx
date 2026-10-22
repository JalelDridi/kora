import { notFound } from "next/navigation";
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { SeasonIsland, type SeasonStrings } from "@/components/season/island";
import { getGame } from "@/games";
import { isLocale, localeInfo } from "@/i18n/locales";
import { pageMetadata } from "@/i18n/page-metadata";
import { gameShareImagePath } from "@/share";
import { site } from "@/site";

// 30–0 (plan Task 10): a static shell per locale. It reads no data (D-S3-14):
// the island asks POST /api/season/draft for every spin once it runs.
// Reachable by its URL and noindex until the game goes live (Task 18).

const ROUTE = "/season";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/season">) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale });
  return pageMetadata({
    locale,
    path: ROUTE,
    title: t("season.meta.title"),
    description: t("season.meta.description"),
    image: {
      url: gameShareImagePath("season", localeInfo[locale].prefix),
      alt: `${site.name} · ${t("games.season.name")}`,
    },
    index: getGame("season").live,
  });
}

export default async function SeasonPage({
  params,
}: PageProps<"/[locale]/season">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();
  const messages = (await getMessages()) as unknown as {
    season: SeasonStrings;
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col px-4 py-5 sm:px-8">
      <PageHeader
        locale={locale}
        path={ROUTE}
        home={t("notFound.home")}
        language={t("hub.language")}
      />

      <main className="py-8 sm:py-12">
        <h1 className="text-5xl font-extrabold sm:text-7xl">
          <bdi>{t("games.season.name")}</bdi>
        </h1>
        <p className="mt-4 max-w-2xl text-xl text-chalk-dim">
          {t("season.rules")}
        </p>
        <noscript>
          <p className="mt-6 text-xl font-semibold">{t("season.noscript")}</p>
        </noscript>
        <SeasonIsland
          locale={locale}
          strings={messages.season}
          prefix={localeInfo[locale].prefix}
          shareOrigin={site.url}
        />
      </main>
    </div>
  );
}
