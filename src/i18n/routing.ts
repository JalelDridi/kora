import { defineRouting } from "next-intl/routing";
import { defaultLocale, localeInfo, locales } from "./locales";

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: {
    mode: "always",
    prefixes: {
      "ar-TN": localeInfo["ar-TN"].prefix,
      "ar-Latn-TN": localeInfo["ar-Latn-TN"].prefix,
      fr: localeInfo.fr.prefix,
    },
  },
  // The root always opens in Derja (decision P3): most Tunisian phones are
  // set to French and would otherwise never see it.
  localeDetection: false,
  // With detection off the cookie is never read; dropping it keeps the site
  // free of cookies (launch-readiness C5) and lets shared caches reuse pages.
  localeCookie: false,
  // The page's <head> is the single source of language links; see src/app/[locale]/layout.tsx.
  alternateLinks: false,
});
