import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { defaultLocale, isLocale, localeInfo } from "@/i18n/locales";

export default async function NotFound() {
  const locale = await getLocale();
  const t = await getTranslations("notFound");
  const hub = localeInfo[isLocale(locale) ? locale : defaultLocale].prefix;

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col justify-center gap-6 px-5 py-12 sm:px-8">
      <p aria-hidden="true" className="text-7xl font-extrabold text-mint">
        404
      </p>
      <h1 className="text-4xl font-extrabold">{t("title")}</h1>
      <p className="max-w-2xl text-xl text-chalk-dim">{t("body")}</p>
      <Link
        href={hub}
        prefetch={false}
        className="flex min-h-11 items-center self-start rounded-full bg-mint px-5 text-base font-semibold text-pitch-950"
      >
        {t("home")}
      </Link>
    </main>
  );
}
