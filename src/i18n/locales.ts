// The three interface languages (design §5). The ids are language tags that
// browsers, screen readers and search engines understand; the prefix is what
// people see in the address and share.
export const locales = ["ar-TN", "ar-Latn-TN", "fr"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "ar-TN";

type LocaleInfo = {
  prefix: "/ar" | "/tn" | "/fr";
  dir: "rtl" | "ltr";
  /** The language's own name, shown in the switcher. */
  label: string;
  /** Tag for Intl formatting. Western digits everywhere. */
  intl: string;
};

export const localeInfo: Record<Locale, LocaleInfo> = {
  "ar-TN": {
    prefix: "/ar",
    dir: "rtl",
    label: "تونسي",
    intl: "ar-TN-u-nu-latn",
  },
  "ar-Latn-TN": { prefix: "/tn", dir: "ltr", label: "Tounsi", intl: "fr-TN" },
  fr: { prefix: "/fr", dir: "ltr", label: "Français", intl: "fr-TN" },
};

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}
