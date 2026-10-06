import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import arTN from "../messages/ar-TN.json";
import manifest from "./app/manifest";
import robots from "./app/robots";
import sitemap, { sitemapEntries } from "./app/sitemap";
import { getGame, launchGames } from "./games";
import { site } from "./site";

const file = (path: string) => readFileSync(new URL(path, import.meta.url));
const pngSize = (png: Buffer) => [png.readUInt32BE(16), png.readUInt32BE(20)];
const icons = [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
  {
    src: "/icons/maskable-512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "maskable",
  },
];

describe("site files", () => {
  it("robots.txt allows everything but the API and names the sitemap", () => {
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: "/api/" },
      sitemap: `${site.url}/sitemap.xml`,
    });
  });

  const entries = (path: string) => {
    const languages = {
      "ar-TN": `${site.url}/ar${path}`,
      "ar-Latn-TN": `${site.url}/tn${path}`,
      fr: `${site.url}/fr${path}`,
      "x-default": `${site.url}/ar${path}`,
    };
    return ["/ar", "/tn", "/fr"].map((p) => ({
      url: `${site.url}${p}${path}`,
      alternates: { languages },
    }));
  };

  it("the sitemap lists the hub, the live games, Sources and privacy in three languages, with alternates and x-default", () => {
    const live = getGame("chkoun").live ? entries("/chkoun") : [];
    expect(sitemap()).toEqual([
      ...entries(""),
      ...live,
      ...entries("/sources"),
      ...entries("/privacy"),
    ]);
  });

  it("a game enters the sitemap only when its switch is on", () => {
    const off = launchGames.map((g) => ({ ...g, live: false }));
    const on = launchGames.map((g) => ({ ...g, live: g.id === "chkoun" }));
    const urls = (list: { url: string }[]) => list.map((e) => e.url);
    expect(urls(sitemapEntries(off)).join(" ")).not.toContain("/chkoun");
    expect(urls(sitemapEntries(on))).toEqual(
      urls([
        ...entries(""),
        ...entries("/chkoun"),
        ...entries("/sources"),
        ...entries("/privacy"),
      ]),
    );
  });

  it("the sitemap leaves out the admin pages", () => {
    expect(JSON.stringify(sitemap())).not.toContain("/admin");
  });

  it("the manifest opens the Derja hub full screen in the site's colours", () => {
    expect(manifest()).toEqual({
      name: site.name,
      short_name: site.name,
      description: arTN.meta.description,
      lang: "ar-TN",
      dir: "rtl",
      start_url: "/ar",
      scope: "/",
      display: "standalone",
      background_color: site.themeColor,
      theme_color: site.themeColor,
      icons,
    });
  });

  it("the theme colour is the page background", () => {
    expect(file("./app/globals.css").toString("utf8")).toContain(
      `--color-pitch-950: ${site.themeColor};`,
    );
  });

  it.each([
    ["../public/icons/icon-192.png", 192],
    ["../public/icons/icon-512.png", 512],
    ["../public/icons/maskable-512.png", 512],
    ["./app/apple-icon.png", 180],
  ])("%s is a %i px square PNG", (path, size) => {
    expect(pngSize(file(path))).toEqual([size, size]);
  });

  it("favicon.ico holds 16, 32 and 48 px images", () => {
    const ico = file("./app/favicon.ico");
    expect([
      ico.readUInt16LE(0),
      ico.readUInt16LE(2),
      ico.readUInt16LE(4),
    ]).toEqual([0, 1, 3]);
    expect([0, 1, 2].map((i) => ico.readUInt8(6 + 16 * i))).toEqual([
      16, 32, 48,
    ]);
  });
});
