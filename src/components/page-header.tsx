import Link from "next/link";
import type { Locale } from "@/i18n/locales";
import { localeInfo } from "@/i18n/locales";
import { LanguageSwitcher } from "./language-switcher";

type Props = {
  locale: Locale;
  /** The page under each locale: "/chkoun", "/sources" … */
  path: string;
  home: string;
  language: string;
};

// The top of every page below the hub: back to the games, and the same page
// in the other languages.
export function PageHeader({ locale, path, home, language }: Props) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <Link
        href={localeInfo[locale].prefix}
        prefetch={false}
        className="flex min-h-11 items-center text-base font-semibold text-mint underline-offset-4 hover:underline"
      >
        {home}
      </Link>
      <LanguageSwitcher current={locale} label={language} path={path} />
    </header>
  );
}
