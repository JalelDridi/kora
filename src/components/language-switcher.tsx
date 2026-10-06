import Link from "next/link";
import { localeInfo, locales, type Locale } from "@/i18n/locales";

type Props = {
  current: Locale;
  label: string;
  /** The same page in each language: "" for the hub, "/chkoun". */
  path?: string;
};

// On a narrow screen or with large text the row wraps instead of scrolling
// sideways (WCAG 1.4.10). No prefetch: few visitors switch, and a full load
// is the surest way to swap <html lang dir>.
export function LanguageSwitcher({ current, label, path = "" }: Props) {
  return (
    <nav aria-label={label} className="max-w-full">
      <ul className="flex flex-wrap justify-end gap-1 rounded-3xl bg-pitch-800 p-1">
        {locales.map((locale) => (
          <li key={locale}>
            <Link
              href={`${localeInfo[locale].prefix}${path}`}
              prefetch={false}
              lang={locale}
              hrefLang={locale}
              aria-current={locale === current ? "page" : undefined}
              className="flex min-h-11 items-center rounded-full px-3 text-base font-semibold text-mint sm:px-4 aria-[current=page]:bg-mint aria-[current=page]:text-pitch-950"
            >
              {localeInfo[locale].label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
