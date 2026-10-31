import { getMessages, getTranslations } from "next-intl/server";
import { frenchCountryName } from "@/chkoun/labels";
import { GameHeader } from "@/components/game-header";
import { LanguageSwitcher } from "@/components/language-switcher";
import { localeInfo, type Locale } from "@/i18n/locales";
import { site } from "@/site";
import type { GameStrings } from "./game";
import { GameIsland } from "./game-island";
import { ChkounHelp } from "./help";
import { ChkounHelpDialog } from "./help-dialog";
import { Legend } from "./legend";
import { GameShell } from "./shell";
import { StatsDialog } from "./stats-dialog";

// The Chkoun? page under a locale, today's or yesterday's (mobile polish
// M7): the header, the help and record dialogs, the island in its mode, the
// shell it replaces, the legend and the language switcher. Server-rendered,
// static: it never reads the database or the puzzle (page-imports.test.ts).

export const ROUTE = "/chkoun";
export const YESTERDAY_ROUTE = "/chkoun/yesterday";

/** The help's example club (data/pool.json's names) and its country, per locale. */
const EXAMPLE: Record<Locale, { club: string; country: string }> = {
  "ar-TN": { club: "الترجي الرياضي التونسي", country: "تونس" },
  "ar-Latn-TN": { club: "Espérance Sportive de Tunis", country: "Tounes" },
  fr: { club: "Espérance sportive de Tunis", country: frenchCountryName("TN") },
};

export async function ChkounPageBody({
  locale,
  mode,
}: {
  locale: Locale;
  mode: "today" | "yesterday";
}) {
  const past = mode === "yesterday";
  const route = past ? YESTERDAY_ROUTE : ROUTE;
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
        path={route}
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
        {past ? (
          // The header keeps the game's name on one line, as today's page
          // does; yesterday's title is the first line under it.
          <div className="flex flex-col items-start gap-1">
            <h2 className="text-xl font-extrabold">
              {t("chkoun.yesterday.title")}
            </h2>
            <p className="text-base text-chalk-dim">
              {t("chkoun.yesterday.note")}
            </p>
            <a
              href={`${prefix}${ROUTE}`}
              data-today-link=""
              className="inline-flex min-h-11 items-center text-base font-semibold text-mint underline underline-offset-4"
            >
              {t("chkoun.yesterday.back")}
            </a>
          </div>
        ) : null}
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
          mode={mode}
          yesterdayHref={`${prefix}${YESTERDAY_ROUTE}`}
        />
        <GameShell
          label={t("chkoun.search.label")}
          hint={t("chkoun.search.hint")}
          placeholder={t("chkoun.search.placeholder")}
          guessCount={t("chkoun.guessCount", { n: 1 })}
          mode={mode}
        />
        <div className="max-w-2xl">
          <Legend title={t("chkoun.legend.title")} words={legendWords} />
        </div>
      </main>

      <LanguageSwitcher
        current={locale}
        label={t("hub.language")}
        path={route}
        className="self-center"
      />
    </div>
  );
}
