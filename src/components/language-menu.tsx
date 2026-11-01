import Link from "next/link";
import { localeInfo, locales, type Locale } from "@/i18n/locales";

type Props = {
  current: Locale;
  /** The same page in each language: "/chkoun". */
  path: string;
  /** "Language", for screen readers: "Language: Tounsi". */
  label: string;
};

// The game header's language choice (mobile polish T-MP-1): a <details>
// that shows the current language and opens on the three links of the
// full switcher, so it needs no client code. The full switcher stays at
// the foot of the page. Links are not prefetched, as in the switcher.
export function LanguageMenu({ current, path, label }: Props) {
  return (
    <details className="group relative">
      <summary
        aria-label={`${label}: ${localeInfo[current].label}`}
        className="flex min-h-[44px] cursor-pointer list-none items-center rounded-full border-2 border-pitch-700 px-2 text-sm font-semibold text-mint hover:bg-pitch-800 group-open:bg-pitch-800 [&::-webkit-details-marker]:hidden"
      >
        <span lang={current}>{localeInfo[current].label}</span>
      </summary>
      <ul className="absolute inset-e-0 inset-bs-full z-20 mt-1 flex flex-col gap-1 rounded-2xl border-2 border-pitch-700 bg-pitch-900 p-1">
        {locales.map((locale) => (
          <li key={locale}>
            <Link
              href={`${localeInfo[locale].prefix}${path}`}
              prefetch={false}
              lang={locale}
              hrefLang={locale}
              aria-current={locale === current ? "page" : undefined}
              className="flex min-h-11 items-center rounded-full px-4 text-base font-semibold whitespace-nowrap text-mint aria-[current=page]:bg-mint aria-[current=page]:text-pitch-950"
            >
              {localeInfo[locale].label}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
