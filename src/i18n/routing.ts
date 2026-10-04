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
});
