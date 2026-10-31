import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { GameCard } from "@/components/game-card";
import { HubState } from "@/components/hub-state";
import { LanguageMenu } from "@/components/language-menu";
import { LanguageSwitcher } from "@/components/language-switcher";
import { launchGames, liveRoute } from "@/games";
import { isLocale, localeInfo } from "@/i18n/locales";
import { site } from "@/site";

export default async function HubPage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();
  const stateStrings = t.raw("hub.state") as Parameters<
    typeof HubState
  >[0]["strings"];

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-5 py-5 sm:px-8">
      {/* The brand first, the small language menu after it (mobile polish
          M6); the full switcher sits at the foot, as on the game pages. */}
      <header className="flex items-center gap-3">
        <h1 className="text-4xl font-extrabold sm:text-6xl">{site.name}</h1>
        <div className="-me-1 ms-auto">
          <LanguageMenu current={locale} path="" label={t("hub.language")} />
        </div>
      </header>

      <main className="flex-1 py-6">
        <p className="max-w-2xl text-xl text-chalk-dim sm:text-2xl">
          {t("hub.tagline")}
        </p>

        <section aria-labelledby="games" className="mt-6 sm:mt-10">
          <h2 id="games" className="text-xl font-semibold text-mint">
            {t("hub.games")}
          </h2>
          <ul className="mt-5 grid gap-4 md:grid-cols-3">
            {launchGames.map((game) => {
              const route = liveRoute(game);
              return (
                <li key={game.id}>
                  <GameCard
                    name={t(`games.${game.id}.name`)}
                    pitch={t(`games.${game.id}.pitch`)}
                    badge={t(`badges.${game.badge}`)}
                    soon={t("hub.soon")}
                    href={route ? `${localeInfo[locale].prefix}${route}` : null}
                    play={t("hub.play")}
                    state={
                      route &&
                      (game.id === "chkoun" || game.id === "season") ? (
                        <HubState game={game.id} strings={stateStrings} />
                      ) : undefined
                    }
                  />
                </li>
              );
            })}
          </ul>
        </section>
      </main>

      <LanguageSwitcher
        current={locale}
        label={t("hub.language")}
        className="self-center"
      />
    </div>
  );
}
