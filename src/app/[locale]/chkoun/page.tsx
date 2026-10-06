import { notFound } from "next/navigation";
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { Game, type GameStrings } from "@/components/chkoun/game";
import { PageHeader } from "@/components/page-header";
import { getGame } from "@/games";
import { isLocale, localeInfo } from "@/i18n/locales";
import { pageMetadata } from "@/i18n/page-metadata";
import { gameShareImagePath } from "@/share";
import { site } from "@/site";

// Chkoun? (plan Task 12): a static shell per locale. It never reads the
// database or the puzzle. The names a visitor may guess and the label
// tables are a static JSON file per locale (src/app/chkoun-data), fetched
// after the first paint; the game asks /api/chkoun/today once it runs.

const ROUTE = "/chkoun";

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
  const t = await getTranslations();
  const messages = (await getMessages()) as unknown as GameStrings;
  const strings: GameStrings = {
    chkoun: messages.chkoun,
    positions: messages.positions,
    credit: messages.credit,
  };
  const { prefix } = localeInfo[locale];

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
          <bdi>{t("games.chkoun.name")}</bdi>
        </h1>
        <p className="mt-4 max-w-2xl text-xl text-chalk-dim">
          {t("chkoun.rules")}
        </p>
        <noscript>
          <p className="mt-6 text-xl font-semibold">{t("chkoun.noscript")}</p>
        </noscript>
        <Game
          locale={locale}
          dataUrl={`/chkoun-data/${locale}.json`}
          strings={strings}
          shareUrl={`${site.url}${prefix}${ROUTE}`}
          sourcesHref={`${prefix}/sources`}
        />
      </main>
    </div>
  );
}
