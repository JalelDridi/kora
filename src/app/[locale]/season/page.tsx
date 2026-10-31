import { notFound } from "next/navigation";
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { GameHeader } from "@/components/game-header";
import { SeasonHelp } from "@/components/season/help";
import { SeasonHelpDialog } from "@/components/season/help-dialog";
import { LanguageSwitcher } from "@/components/language-switcher";
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
      <GameHeader
        locale={locale}
        path={ROUTE}
        name={t("games.season.name")}
        strings={{
          home: t("notFound.home"),
          language: t("hub.language"),
          help: t("header.help"),
          stats: t("header.stats"),
        }}
        actions
      />

      <SeasonHelpDialog title={t("header.help")} close={t("header.close")}>
        <SeasonHelp
          strings={{
            draft: t("season.help.draft"),
            respin: t("season.help.respin"),
            play: t("season.help.play"),
          }}
        />
      </SeasonHelpDialog>

      <main className="pt-2 pb-8 sm:pb-12">
        {/* Without JavaScript there is no help dialog: the rules stay here. */}
        <noscript>
          <p className="max-w-2xl text-xl text-chalk-dim">
            {t("season.rules")}
          </p>
          <p className="mt-6 text-xl font-semibold">{t("season.noscript")}</p>
        </noscript>
        <SeasonIsland
          locale={locale}
          strings={messages.season}
          prefix={localeInfo[locale].prefix}
          shareOrigin={site.url}
        />
      </main>

      <LanguageSwitcher
        current={locale}
        label={t("hub.language")}
        path={ROUTE}
        className="self-center"
      />
    </div>
  );
}
