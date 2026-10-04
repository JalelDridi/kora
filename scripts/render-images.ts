// Renders the link-preview images into public/og/, one per locale, with a
// real Chromium so Arabic is shaped and ordered by the browser (not next/og:
// it reverses Arabic words and crashes on IBM Plex Sans Arabic). Run by hand
// after changing a tagline, the mark or this design: `pnpm images`, then bump
// shareImageVersion in src/share.ts if an existing image changed. Locally it
// uses the installed Chrome, like scripts/render-deck.mjs.
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "@playwright/test";
import { localeInfo, locales } from "../src/i18n/locales.ts";
import {
  shareImageMaxBytes,
  shareImagePath,
  shareImageSize,
} from "../src/share.ts";
import { site } from "../src/site.ts";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root));
const out = (path: string) => fileURLToPath(new URL(path, root));

// Fonts as data URLs: Chromium refuses font files from file:// pages.
const face = (family: string, weight: number, file: string) =>
  `@font-face { font-family: "${family}"; font-weight: ${weight}; src: url(data:font/woff2;base64,${read(
    `node_modules/${file}`,
  ).toString("base64")}) format("woff2"); }`;
const plex = (weight: number) =>
  face(
    "Plex Arabic",
    weight,
    `@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-${weight}-normal.woff2`,
  );
const inter = (weight: number) =>
  face(
    "Inter",
    weight,
    `@fontsource/inter/files/inter-latin-${weight}-normal.woff2`,
  );
const mark = read("src/app/icon.svg").toString("utf8");

// Same colours and font order as the site. Content sits in the middle
// because WhatsApp crops previews to a square.
const shareCss = `${inter(600)} ${inter(800)} ${plex(600)} ${plex(700)}
  * { margin: 0; box-sizing: border-box; }
  html, body { inline-size: ${shareImageSize.width}px; block-size: ${shareImageSize.height}px; }
  body { background: #0b1510; color: #eef3ef; font-family: "Inter", "Plex Arabic", sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 28px; text-align: center; }
  svg { inline-size: 132px; block-size: 132px; }
  h1 { font-size: 168px; font-weight: 800; line-height: 1; }
  p { font-size: 52px; font-weight: 600; color: #cfd8d2; max-inline-size: 1000px; }
  .bar { inline-size: 160px; block-size: 10px; border-radius: 5px; background: #9ad4b4; }`;

async function waitForFonts(page: Page) {
  const failed = await page.evaluate(async () => {
    await Promise.all([...document.fonts].map((f) => f.load()));
    return [...document.fonts]
      .filter((f) => f.status !== "loaded")
      .map((f) => `${f.family} ${f.weight}`);
  });
  if (failed.length) throw new Error(`fonts not loaded: ${failed.join(", ")}`);
}

async function renderShareImages(page: Page) {
  mkdirSync(out("public/og"), { recursive: true });
  await page.setViewportSize(shareImageSize);
  for (const locale of locales) {
    const { prefix, dir } = localeInfo[locale];
    const messages = JSON.parse(
      read(`messages/${locale}.json`).toString("utf8"),
    );
    await page.setContent(
      `<!doctype html><html lang="${locale}" dir="${dir}"><head><meta charset="utf-8"><style>${shareCss}</style></head>
       <body>${mark}<h1>${site.name}</h1><p>${messages.hub.tagline}</p><div class="bar"></div></body></html>`,
    );
    await waitForFonts(page);
    const path = out(`public${shareImagePath(prefix)}`);
    await page.screenshot({ path, type: "png" });
    const bytes = statSync(path).size;
    if (bytes > shareImageMaxBytes) throw new Error(`${path}: ${bytes} bytes`);
    console.log(`${path} (${bytes} bytes)`);
  }
}

const browser = await chromium.launch({
  channel: process.env.CI ? undefined : "chrome",
});
const page = await browser.newPage({ deviceScaleFactor: 1 });
try {
  await renderShareImages(page);
} finally {
  await browser.close();
}
