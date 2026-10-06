import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { GameCard } from "@/components/game-card";
import { LanguageSwitcher } from "@/components/language-switcher";
import { launchGames, liveRoute } from "@/games";
import { isLocale, localeInfo } from "@/i18n/locales";
import { site } from "@/site";

export default async function HubPage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-5 py-5 sm:px-8">
      <header className="flex justify-end">
        <LanguageSwitcher current={locale} label={t("hub.language")} />
      </header>

      <main className="flex-1 py-12 sm:py-20">
        <h1 className="text-7xl font-extrabold sm:text-9xl">{site.name}</h1>
        <p className="mt-4 max-w-2xl text-2xl text-chalk-dim sm:text-3xl">
          {t("hub.tagline")}
        </p>

        <section aria-labelledby="games" className="mt-14">
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
                  />
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </div>
  );
}
