import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { isLocale, localeInfo } from "@/i18n/locales";
import { pageMetadata } from "@/i18n/page-metadata";
import { shareImagePath } from "@/share";
import { site } from "@/site";

// The privacy page, a draft (D-S2-3, launch-readiness C5). It describes
// what the code does today: the device's storage (src/chkoun/device.ts),
// the one cookie (N1, src/chkoun/visitor.ts), what the server keeps and for
// how long (N3, src/chkoun/store.ts and copy.ts), the hashed rate limit
// (N4), cookieless analytics (src/analytics) and server-only errors
// (src/monitoring). Change it when any of them changes.

const ROUTE = "/privacy";
const SECTIONS = [
  "device",
  "cookie",
  "server",
  "serverOff",
  "analytics",
  "errors",
  "processors",
  "children",
  "clear",
  "contact",
] as const;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/privacy">) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale });
  return pageMetadata({
    locale,
    path: ROUTE,
    title: `${t("privacy.title")} · ${site.name}`,
    description: t("privacy.meta.description"),
    image: {
      url: shareImagePath(localeInfo[locale].prefix),
      alt: `${site.name} · ${t("hub.tagline")}`,
    },
  });
}

export default async function PrivacyPage({
  params,
}: PageProps<"/[locale]/privacy">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();
  const link = "text-mint underline underline-offset-2";

  return (
    <div className="mx-auto flex max-w-5xl flex-col px-4 py-5 sm:px-8">
      <PageHeader
        locale={locale}
        path={ROUTE}
        home={t("notFound.home")}
        language={t("hub.language")}
      />
      <main className="flex max-w-3xl flex-col gap-8 py-8 sm:py-12">
        <p
          role="note"
          dir="auto"
          className="rounded-xl border-2 border-shirt bg-pitch-900 p-4 text-lg font-semibold"
        >
          {t("privacy.draft")}
        </p>
        <div>
          <h1 className="text-5xl font-extrabold">{t("privacy.title")}</h1>
          <p dir="auto" className="mt-3 text-base text-chalk-dim">
            {t("privacy.date")}
          </p>
        </div>
        {SECTIONS.map((section) => (
          <section key={section} aria-labelledby={`privacy-${section}`}>
            <h2
              id={`privacy-${section}`}
              dir="auto"
              className="text-2xl font-bold text-mint"
            >
              {t(`privacy.${section}.title`)}
            </h2>
            <p dir="auto" className="mt-3 text-lg leading-relaxed">
              {t(`privacy.${section}.body`)}
              {section === "contact" || section === "clear" ? (
                <>
                  {" "}
                  <a href={`${site.repo}/issues`} className={link}>
                    GitHub
                  </a>
                </>
              ) : null}
            </p>
          </section>
        ))}
      </main>
    </div>
  );
}
