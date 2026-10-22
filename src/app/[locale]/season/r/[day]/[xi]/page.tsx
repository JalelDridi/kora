import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { cache } from "react";
import { PageHeader } from "@/components/page-header";
import type { SeasonStrings } from "@/components/season/island";
import { Pitch } from "@/components/season/pitch";
import { Result } from "@/components/season/result";
import { isLocale, localeInfo } from "@/i18n/locales";
import type { Locale } from "@/i18n/locales";
import { pageMetadata } from "@/i18n/page-metadata";
import { getSeasonData } from "@/season/data.server";
import { handleReplay } from "@/season/replay";
import type { SeasonView } from "@/season/replay";
import { site } from "@/site";

// A shared 30–0 season (plan Task 11): /{prefix}/season/r/{day}/{code},
// played again on the server from its day and its squad's code with
// today's ratings (src/season/replay.ts). A bad day, a day after today or
// a code that names no squad is the not-found page. The path holds no dot
// (codes use "_", T-S3-6), so the locale proxy rewrites it. Always noindex.
// The draft island is not loaded here (page-imports.test.ts).

type Params = { locale: string; day: string; xi: string };

/** A segment arrives percent-encoded when the link was ("~" → %7E). */
function decode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/** One replay per request, shared by the metadata and the page. */
const replay = cache(
  async (day: string, xi: string): Promise<SeasonView | null> => {
    const d = decode(day);
    const code = decode(xi);
    if (d === null || code === null) return null;
    const result = handleReplay(
      { now: new Date(), data: await getSeasonData() },
      { d, xi: code },
    );
    return result.status === 200 ? (result.body as SeasonView) : null;
  },
);

const path = ({ day, xi }: Params) => `/season/r/${day}/${xi}`;

/** The replay's squad card (src/app/api/season/card/route.tsx). */
function cardPath(view: SeasonView, locale: Locale): string {
  const query = new URLSearchParams({
    d: view.day,
    xi: view.code,
    l: localeInfo[locale].prefix.slice(1),
  });
  return `/api/season/card?${query.toString().replace(/%7E/gi, "~")}`;
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/season/r/[day]/[xi]">) {
  const p: Params = await params;
  if (!isLocale(p.locale)) return {};
  const view = await replay(p.day, p.xi).catch(() => null);
  if (!view) return {};
  const t = await getTranslations({ locale: p.locale });
  const { w, d, l } = view.season;
  return pageMetadata({
    locale: p.locale,
    path: path(p),
    title: `${t("season.result.record", { w, d, l })} · 30–0 · ${site.name}`,
    description: t("season.meta.description"),
    // The squad card (Task 17, T-S3-14), drawn from the same day and code;
    // a refused replay has no metadata, so the layout's image stays.
    image: {
      url: cardPath(view, p.locale),
      alt: `${site.name} · ${t("games.season.name")}`,
    },
    index: false,
  });
}

export default async function ReplayPage({
  params,
}: PageProps<"/[locale]/season/r/[day]/[xi]">) {
  const p: Params = await params;
  if (!isLocale(p.locale)) notFound();
  const locale = p.locale;
  setRequestLocale(locale);
  const view = await replay(p.day, p.xi);
  if (!view) notFound();
  const t = await getTranslations();
  const messages = (await getMessages()) as unknown as {
    season: SeasonStrings;
  };
  const s = messages.season;
  const { prefix } = localeInfo[locale];

  return (
    <div className="mx-auto flex max-w-5xl flex-col px-4 py-5 sm:px-8">
      <PageHeader
        locale={locale}
        path={path(p)}
        home={t("notFound.home")}
        language={t("hub.language")}
      />

      <main className="py-8 sm:py-12">
        <h1 className="text-5xl font-extrabold sm:text-7xl">
          <bdi>{t("games.season.name")}</bdi>
        </h1>
        <div className="mt-8 grid gap-6 lg:grid-cols-2 lg:items-start">
          <Result view={view} locale={locale} strings={s}>
            <p className="text-base text-chalk-dim">{s.replay.note}</p>
            <p className="text-base">
              <bdi dir="ltr">{view.day}</bdi>
            </p>
            <Link
              href={`${prefix}/season`}
              prefetch={false}
              className="flex min-h-12 items-center self-start rounded-full bg-mint px-6 text-lg font-bold text-pitch-950"
            >
              {s.replay.draft}
            </Link>
          </Result>
          <Pitch
            squad={view.squad}
            current={null}
            locale={locale}
            strings={{ ...s, squad: s.replay.squad }}
          />
        </div>
      </main>
    </div>
  );
}
