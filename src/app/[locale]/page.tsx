import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isLocale } from "@/i18n/locales";
import { site } from "@/site";

export default async function HubPage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("hub");

  return (
    <main>
      <h1>{site.name}</h1>
      <p>{t("tagline")}</p>
    </main>
  );
}
