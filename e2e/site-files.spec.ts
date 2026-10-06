import { expect, test } from "@playwright/test";
import { launchGames, liveRoute } from "../src/games";
import { localeInfo, locales } from "../src/i18n/locales";
import { site } from "../src/site";

const pngSize = (png: Buffer) => [png.readUInt32BE(16), png.readUInt32BE(20)];

test("robots.txt is served and points to the sitemap", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/plain");
  expect(await response.text()).toMatch(/^Sitemap: \S+\/sitemap\.xml$/m);
});

test("sitemap.xml lists the hubs, the live games, Sources and privacy with language alternates", async ({
  request,
}) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("xml");
  const xml = await response.text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (m) => new URL(m[1]).pathname,
  );
  const paths = [
    "",
    ...launchGames.flatMap((g) => liveRoute(g) ?? []),
    "/sources",
    "/privacy",
  ];
  expect(locs).toEqual(
    paths.flatMap((path) =>
      locales.map((l) => `${localeInfo[l].prefix}${path}`),
    ),
  );
  expect(xml.match(/hreflang="x-default"/g)).toHaveLength(
    paths.length * locales.length,
  );
  expect(xml).not.toContain("/admin");
});

test("the manifest and every icon it names are served", async ({
  page,
  request,
}) => {
  await page.goto("/ar");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const response = await request.get(href ?? "");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("manifest+json");
  const manifest = await response.json();
  expect(manifest.start_url).toBe("/ar");
  for (const icon of manifest.icons) {
    const file = await request.get(icon.src);
    expect(file.status(), icon.src).toBe(200);
    expect(file.headers()["content-type"]).toBe("image/png");
    expect(pngSize(await file.body())).toEqual(
      (icon.sizes as string).split("x").map(Number),
    );
  }
});

test("pages name a home-screen icon and a theme colour", async ({
  page,
  request,
}) => {
  await page.goto("/fr");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    site.themeColor,
  );
  const apple = await page
    .locator('link[rel="apple-touch-icon"]')
    .getAttribute("href");
  const file = await request.get(apple ?? "");
  expect(file.status()).toBe(200);
  expect(pngSize(await file.body())).toEqual([180, 180]);
});

test("/favicon.ico exists for clients that ask for it blindly", async ({
  request,
}) => {
  const response = await request.get("/favicon.ico");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/icon/);
});
