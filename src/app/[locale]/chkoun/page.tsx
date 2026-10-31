import { notFound } from "next/navigation";
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import type { GameStrings } from "@/components/chkoun/game";
import { GameIsland } from "@/components/chkoun/game-island";
import { Legend } from "@/components/chkoun/legend";
import { GameShell } from "@/components/chkoun/shell";
import { GameHeader } from "@/components/game-header";
import { LanguageSwitcher } from "@/components/language-switcher";
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

      <main className="pt-2 pb-8 sm:pb-12">
        <p className="max-w-2xl text-xl text-chalk-dim">{t("chkoun.rules")}</p>
        <noscript>
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
          <Legend
            title={t("chkoun.legend.title")}
            words={{
              same: t("chkoun.legend.same"),
              close: t("chkoun.legend.close"),
              different: t("chkoun.legend.different"),
              unknown: t("chkoun.legend.unknown"),
            }}
          />
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
