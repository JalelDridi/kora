import Link from "next/link";
import type { Locale } from "@/i18n/locales";
import { localeInfo } from "@/i18n/locales";
import { HeaderActions } from "./header-actions";
import { LanguageMenu } from "./language-menu";

type Props = {
  locale: Locale;
  /** The game under each locale: "/chkoun", "/season". */
  path: string;
  /** The game's name, the page's h1. */
  name: string;
  strings: Record<"home" | "language" | "help" | "stats", string>;
  /** Whether the "?" and record buttons show. */
  actions: boolean;
};

// The top of a game page on one line (mobile polish M1): back to the games,
// the game's name, "?" and the record, and a small language menu, so the
// game starts on a phone's first screen. Only the arrow mirrors in RTL, by
// the page's dir: Tailwind's rtl: variant also matches :lang(ar), which
// includes /tn's ar-Latn-TN, a left-to-right page.
export function GameHeader({ locale, path, name, strings, actions }: Props) {
  return (
    <header className="flex items-center gap-1">
      <Link
        href={localeInfo[locale].prefix}
        prefetch={false}
        className="-ms-2 flex size-[44px] shrink-0 items-center justify-center rounded-full text-mint hover:bg-pitch-800"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-6 [[dir=rtl]_&]:-scale-x-100"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
        <span className="sr-only">{strings.home}</span>
      </Link>
      <h1 className="min-w-0 truncate text-lg font-extrabold min-[360px]:text-xl sm:text-2xl">
        <bdi>{name}</bdi>
      </h1>
      <div className="-me-1 ms-auto flex shrink-0 items-center">
        {actions ? (
          <HeaderActions help={strings.help} stats={strings.stats} />
        ) : null}
        <LanguageMenu current={locale} path={path} label={strings.language} />
      </div>
    </header>
  );
}
