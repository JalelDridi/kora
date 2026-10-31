import { notFound } from "next/navigation";
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import type { GameStrings } from "@/components/chkoun/game";
import { GameIsland } from "@/components/chkoun/game-island";
import { ChkounHelp } from "@/components/chkoun/help";
import { ChkounHelpDialog } from "@/components/chkoun/help-dialog";
import { Legend } from "@/components/chkoun/legend";
import { GameShell } from "@/components/chkoun/shell";
import { StatsDialog } from "@/components/chkoun/stats-dialog";
import { GameHeader } from "@/components/game-header";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getGame } from "@/games";
import { frenchCountryName } from "@/chkoun/labels";
import { isLocale, localeInfo, type Locale } from "@/i18n/locales";
import { pageMetadata } from "@/i18n/page-metadata";
import { gameShareImagePath } from "@/share";
import { site } from "@/site";

// Chkoun? (plan Task 12): a static shell per locale. It never reads the
// database or the puzzle. The names a visitor may guess and the label
// tables are a static JSON file per locale (src/app/chkoun-data), fetched
// after the first paint; the game asks /api/chkoun/today once it runs.

const ROUTE = "/chkoun";

/** The help's example club (data/pool.json's names) and its country, per locale. */
const EXAMPLE: Record<Locale, { club: string; country: string }> = {
  "ar-TN": { club: "الترجي الرياضي التونسي", country: "تونس" },
  "ar-Latn-TN": { club: "Espérance Sportive de Tunis", country: "Tounes" },
  fr: { club: "Espérance sportive de Tunis", country: frenchCountryName("TN") },
};

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
  const c = messages.chkoun;
  const legendWords = {
    same: t("chkoun.legend.same"),
    close: t("chkoun.legend.close"),
    different: t("chkoun.legend.different"),
    unknown: t("chkoun.legend.unknown"),
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col px-4 py-5 sm:px-8">
      <GameHeader
        locale={locale}
        path={ROUTE}
        name={t("games.chkoun.name")}
        strings={{
          home: t("notFound.home"),
          language: t("hub.language"),
          help: t("header.help"),
          stats: t("header.stats"),
        }}
        actions
      />

      <ChkounHelpDialog title={t("header.help")} close={t("header.close")}>
        <ChkounHelp
          strings={{
            goal: t("chkoun.help.goal"),
            tiles: t("chkoun.help.tiles"),
            example: t("chkoun.help.example"),
            daily: t("chkoun.help.daily"),
            legend: { title: t("chkoun.legend.title"), words: legendWords },
          }}
          example={{
            ...EXAMPLE[locale],
            strings: {
              positions: messages.positions,
              positionsShort: messages.positions.short,
              caps: c.caps,
              abroad: c.tiles.abroad,
              noClub: c.tiles.noClub,
              headers: {
                club: c.tiles.club,
                country: c.tiles.country,
                position: c.tiles.position,
                age: c.tiles.age,
                caps: c.tiles.caps,
                governorate: c.tiles.governorate,
              },
              heads: {
                club: c.tiles.clubShort,
                country: c.tiles.countryShort,
                position: c.tiles.positionShort,
                age: c.tiles.ageShort,
                caps: c.tiles.capsShort,
                governorate: c.tiles.governorateShort,
              },
              words: legendWords,
              arrows: {
                older: c.tiles.older,
                younger: c.tiles.younger,
                moreCaps: c.tiles.moreCaps,
                fewerCaps: c.tiles.fewerCaps,
              },
            },
          }}
        />
      </ChkounHelpDialog>

      <StatsDialog
        strings={{
          ...c.stats,
          dialog: t("header.stats"),
          close: t("header.close"),
        }}
      />

      <main className="pt-2 pb-8 sm:pb-12">
        {/* Without JavaScript there is no help dialog: the rules stay here. */}
        <noscript>
          <p className="max-w-2xl text-xl text-chalk-dim">
            {t("chkoun.rules")}
          </p>
          <p className="mt-6 text-xl font-semibold">{t("chkoun.noscript")}</p>
        </noscript>
        {/* The live game renders first and hides the shell after it. */}
        <GameIsland
          locale={locale}
          dataUrl={`/chkoun-data/${locale}.json`}
          strings={strings}
          shareUrl={`${site.url}${prefix}${ROUTE}`}
          sourcesHref={`${prefix}/sources`}
        />
        <GameShell
          label={t("chkoun.search.label")}
          hint={t("chkoun.search.hint")}
          placeholder={t("chkoun.search.placeholder")}
          guessCount={t("chkoun.guessCount", { n: 1 })}
        />
        <div className="max-w-2xl">
          <Legend title={t("chkoun.legend.title")} words={legendWords} />
        </div>
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
