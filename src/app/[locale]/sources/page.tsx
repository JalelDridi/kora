import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { readGameFiles } from "@/chkoun/page-data.server";
import { localName } from "@/chkoun/labels";
import { PageHeader } from "@/components/page-header";
import { isLocale, localeInfo } from "@/i18n/locales";
import { pageMetadata } from "@/i18n/page-metadata";
import { shareImagePath } from "@/share";
import { site } from "@/site";
import { photoCredits } from "@/sources";

// Where Kora's data and photos come from (P22, launch-readiness A6), built
// at build time from data/pool.json: one credit row per copied photo.

const ROUTE = "/sources";
const CC0 = "https://creativecommons.org/publicdomain/zero/1.0/";
const BY_SA = "https://creativecommons.org/licenses/by-sa/4.0/";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/sources">) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale });
  return pageMetadata({
    locale,
    path: ROUTE,
    title: `${t("sources.title")} · ${site.name}`,
    description: t("sources.meta.description"),
    image: {
      url: shareImagePath(localeInfo[locale].prefix),
      alt: `${site.name} · ${t("hub.tagline")}`,
    },
  });
}

export default async function SourcesPage({
  params,
}: PageProps<"/[locale]/sources">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();
  const { pool } = await readGameFiles();
  const credits = photoCredits(pool);
  const link = "text-mint underline underline-offset-2";
  // The credits table is drawn with the system font. Authors and file names
  // come in every script (Cyrillic, Arabic, extended Latin): with the site's
  // fonts they pulled Inter's other subsets and the Arabic 600 face, 140 KB
  // the Lighthouse font budget has no room for; and 147 rows of names set in
  // a web font that arrives after first paint shifted the page (CLS 0.127 on
  // CI's Linux Chromium). A reference table reads as well in the system font.
  const credit = "font-[system-ui,sans-serif]";

  const data: { text: string; links: [string, string][] }[] = [
    {
      text: t("sources.data.wikidata"),
      links: [
        ["Wikidata", "https://www.wikidata.org/"],
        ["CC0 1.0", CC0],
      ],
    },
    {
      text: t("sources.data.wikipedia"),
      links: [
        ["Wikipedia (en)", "https://en.wikipedia.org/"],
        ["Wikipédia (fr)", "https://fr.wikipedia.org/"],
        ["CC BY-SA 4.0", BY_SA],
      ],
    },
    {
      text: t("sources.data.results"),
      links: [
        [
          "martj42/international_results",
          "https://github.com/martj42/international_results",
        ],
      ],
    },
    { text: t("sources.data.checks"), links: [] },
  ];

  return (
    <div className="mx-auto flex max-w-5xl flex-col px-4 py-5 sm:px-8">
      <PageHeader
        locale={locale}
        path={ROUTE}
        home={t("notFound.home")}
        language={t("hub.language")}
      />
      <main className="flex max-w-3xl flex-col gap-10 py-8 sm:py-12">
        <div>
          <h1 className="text-5xl font-extrabold">{t("sources.title")}</h1>
          <p dir="auto" className="mt-4 text-xl text-chalk-dim">
            {t("sources.unofficial")}
          </p>
        </div>

        <section aria-labelledby="sources-data">
          <h2 id="sources-data" className="text-2xl font-bold text-mint">
            {t("sources.data.title")}
          </h2>
          <ul className="mt-4 flex flex-col gap-4 text-lg">
            {data.map((item) => (
              <li key={item.text} dir="auto">
                {item.text}
                {item.links.map(([name, href]) => (
                  <span key={href}>
                    {" "}
                    <a href={href} className={link}>
                      <bdi>{name}</bdi>
                    </a>
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="sources-photos">
          <h2 id="sources-photos" className="text-2xl font-bold text-mint">
            {t("sources.photos.title")}
          </h2>
          <p dir="auto" className="mt-4 text-lg">
            {t("sources.photos.intro")}
          </p>
          {credits.length === 0 ? (
            <p dir="auto" className="mt-4 text-lg text-chalk-dim">
              {t("sources.photos.empty")}
            </p>
          ) : (
            <div className="mt-4 max-w-full overflow-x-auto">
              <table className={`w-full text-start text-base ${credit}`}>
                <thead className="text-chalk-dim">
                  <tr>
                    <th scope="col" className="p-2 text-start">
                      {t("sources.photos.footballer")}
                    </th>
                    <th scope="col" className="p-2 text-start">
                      {t("sources.photos.author")}
                    </th>
                    <th scope="col" className="p-2 text-start">
                      {t("sources.photos.licence")}
                    </th>
                    <th scope="col" className="p-2 text-start">
                      {t("sources.photos.file")}
                    </th>
                    <th scope="col" className="p-2 text-start">
                      {t("sources.photos.changes")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {credits.map((c) => (
                    <tr
                      key={c.id}
                      data-footballer={c.id}
                      className="border-t border-pitch-700"
                    >
                      <th scope="row" className="p-2 text-start font-bold">
                        <bdi>{localName(c, locale)}</bdi>
                      </th>
                      <td className="p-2">
                        <bdi>{c.author ?? "—"}</bdi>
                      </td>
                      <td className="p-2">
                        {c.licenceUrl ? (
                          <a href={c.licenceUrl} className={link}>
                            <bdi>{c.licence}</bdi>
                          </a>
                        ) : (
                          <bdi>{c.licence}</bdi>
                        )}
                      </td>
                      <td className="p-2">
                        <a href={c.sourceUrl} className={link}>
                          <bdi>{c.file}</bdi>
                        </a>
                      </td>
                      <td className="p-2">{t("sources.photos.none")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="sources-licence">
          <h2 id="sources-licence" className="text-2xl font-bold text-mint">
            {t("sources.licence.title")}
          </h2>
          <ul className="mt-4 flex flex-col gap-3 text-lg">
            <li dir="auto">
              {t("sources.licence.code")}{" "}
              <a href={`${site.repo}/blob/main/LICENSE`} className={link}>
                LICENSE
              </a>
            </li>
            <li dir="auto">
              {t("sources.licence.data")}{" "}
              <a href={`${site.repo}/blob/main/data/LICENSE`} className={link}>
                data/LICENSE
              </a>
            </li>
          </ul>
        </section>

        <p dir="auto" className="text-lg">
          {t("sources.contact")}{" "}
          <a href={`${site.repo}/issues`} className={link}>
            GitHub
          </a>
        </p>
      </main>
    </div>
  );
}
