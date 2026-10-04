import Link from "next/link";
import { localeInfo, locales, type Locale } from "@/i18n/locales";

type Props = { current: Locale; label: string };

export function LanguageSwitcher({ current, label }: Props) {
  return (
    <nav aria-label={label}>
      <ul className="flex gap-1 rounded-full bg-pitch-800 p-1">
        {locales.map((locale) => (
          <li key={locale}>
            <Link
              href={localeInfo[locale].prefix}
              lang={locale}
              hrefLang={locale}
              aria-current={locale === current ? "true" : undefined}
              className="flex min-h-11 items-center rounded-full px-4 text-base font-semibold text-mint aria-[current=true]:bg-mint aria-[current=true]:text-pitch-950"
            >
              {localeInfo[locale].label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
