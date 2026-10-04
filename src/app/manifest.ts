import type { MetadataRoute } from "next";
import arTN from "../../messages/ar-TN.json";
import { defaultLocale, localeInfo } from "@/i18n/locales";
import { site } from "@/site";

// One manifest, in Derja (decision H15). Icons are rendered by
// scripts/render-images.ts from src/app/icon.svg.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.name,
    short_name: site.name,
    description: arTN.meta.description,
    lang: defaultLocale,
    dir: localeInfo[defaultLocale].dir,
    start_url: localeInfo[defaultLocale].prefix,
    scope: "/",
    display: "standalone",
    background_color: site.themeColor,
    theme_color: site.themeColor,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
