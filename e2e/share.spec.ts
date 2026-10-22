import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { expect, test } from "@playwright/test";
import arLatnTN from "../messages/ar-Latn-TN.json";
import arTN from "../messages/ar-TN.json";
import fr from "../messages/fr.json";
import { localeInfo, locales } from "../src/i18n/locales";
import {
  alternateOpenGraphLocales,
  gameShareImagePath,
  openGraphLocale,
  shareImageMaxBytes,
  shareImagePath,
  shareImageSize,
} from "../src/share";
import { site } from "../src/site";
import { shot } from "./chkoun-helpers";

for (const locale of locales) {
  const { prefix } = localeInfo[locale];

  test(`${prefix} carries Open Graph and Twitter tags for link previews`, async ({
    page,
    request,
  }) => {
    await page.goto(prefix);
    const og = (p: string) => page.locator(`head meta[property="${p}"]`);
    const tw = (n: string) => page.locator(`head meta[name="${n}"]`);
    const title = await page.title();

    await expect(og("og:type")).toHaveAttribute("content", "website");
    await expect(og("og:site_name")).toHaveAttribute("content", site.name);
    await expect(og("og:title")).toHaveAttribute("content", title);
    await expect(og("og:description")).toHaveAttribute("content", /.{20,}/);
    await expect(og("og:locale")).toHaveAttribute(
      "content",
      openGraphLocale[locale],
    );
    expect(
      await og("og:locale:alternate").evaluateAll((els) =>
        els.map((e) => e.getAttribute("content")),
      ),
    ).toEqual(alternateOpenGraphLocales(locale));
    expect(
      new URL((await og("og:url").getAttribute("content")) ?? "").pathname,
    ).toBe(prefix);
    await expect(tw("twitter:card")).toHaveAttribute(
      "content",
      "summary_large_image",
    );
    await expect(tw("twitter:title")).toHaveAttribute("content", title);

    // Absolute URL (Facebook requires it). In tests it names site.url's
    // localhost:3000, so the file is fetched by path from the test server.
    const imageUrl = await og("og:image").getAttribute("content");
    expect(imageUrl).toMatch(/^https?:\/\//);
    expect(await tw("twitter:image").getAttribute("content")).toBe(imageUrl);
    const { pathname } = new URL(imageUrl ?? "");
    expect(pathname).toBe(shareImagePath(prefix));
    await expect(og("og:image:width")).toHaveAttribute(
      "content",
      String(shareImageSize.width),
    );
    await expect(og("og:image:height")).toHaveAttribute(
      "content",
      String(shareImageSize.height),
    );
    await expect(og("og:image:alt")).toHaveAttribute(
      "content",
      new RegExp(`^${site.name} · `),
    );

    const image = await request.get(pathname);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/png");
    const body = await image.body();
    expect(body.length).toBeLessThanOrEqual(shareImageMaxBytes);
    expect({
      width: body.readUInt32BE(16),
      height: body.readUInt32BE(20),
    }).toEqual(shareImageSize);
  });
}

for (const locale of locales) {
  const { prefix } = localeInfo[locale];
  test(`${prefix}/chkoun has its own og:image, under 250,000 bytes, 1200×630`, async ({
    page,
    request,
  }) => {
    await page.goto(`${prefix}/chkoun`);
    const og = (p: string) => page.locator(`head meta[property="${p}"]`);
    const imageUrl = await og("og:image").getAttribute("content");
    const { pathname } = new URL(imageUrl ?? "");
    expect(pathname).toBe(gameShareImagePath("chkoun", prefix));
    expect(
      new URL((await og("og:url").getAttribute("content")) ?? "").pathname,
    ).toBe(`${prefix}/chkoun`);
    const image = await request.get(pathname);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/png");
    const body = await image.body();
    expect(body.length).toBeLessThanOrEqual(shareImageMaxBytes);
    expect({
      width: body.readUInt32BE(16),
      height: body.readUInt32BE(20),
    }).toEqual(shareImageSize);
  });
}

// A shared season's preview is its squad card (Task 17, T-S3-14): drafted
// here (first candidate each time) and played, then the replay page's
// og:image is fetched from the test server. The PNG is kept for review.
const seasonMessages = { "ar-TN": arTN, "ar-Latn-TN": arLatnTN, fr };
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

for (const locale of locales) {
  const { prefix } = localeInfo[locale];
  test(`${prefix}: a replay page's og:image is a PNG of 1200×630 under 250,000 bytes`, async ({
    page,
    request,
  }) => {
    const t = seasonMessages[locale].season;
    await page.goto(`${prefix}/season`);
    const pick = page.getByRole("button", {
      name: new RegExp(escapeRe(t.pick)),
    });
    for (let slot = 0; slot < 11; slot++) {
      await expect(
        page.getByText(t.slot.replace("{n}", String(slot + 1))),
      ).toBeVisible();
      await pick.first().click();
    }
    const answer = page.waitForResponse("**/api/season/play");
    await page.getByRole("button", { name: t.play }).click();
    const played = (await (await answer).json()) as {
      day: string;
      code: string;
    };

    await page.goto(`${prefix}/season/r/${played.day}/${played.code}`);
    const og = (p: string) => page.locator(`head meta[property="${p}"]`);
    const imageUrl = (await og("og:image").getAttribute("content")) ?? "";
    expect(
      await page
        .locator('head meta[name="twitter:image"]')
        .getAttribute("content"),
    ).toBe(imageUrl);
    const url = new URL(imageUrl);
    expect(url.pathname).toBe("/api/season/card");
    expect(url.searchParams.get("d")).toBe(played.day);
    expect(url.searchParams.get("xi")).toBe(played.code);
    await expect(og("og:image:width")).toHaveAttribute(
      "content",
      String(shareImageSize.width),
    );
    await expect(og("og:image:height")).toHaveAttribute(
      "content",
      String(shareImageSize.height),
    );

    const image = await request.get(url.pathname + url.search);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/png");
    expect(image.headers()["cache-control"]).toBe(
      "public, s-maxage=86400, stale-while-revalidate=3600",
    );
    const body = await image.body();
    expect(body.length).toBeLessThanOrEqual(shareImageMaxBytes);
    expect({
      width: body.readUInt32BE(16),
      height: body.readUInt32BE(20),
    }).toEqual(shareImageSize);
    mkdirSync(dirname(shot(17, prefix.slice(1), 1200, "card")), {
      recursive: true,
    });
    writeFileSync(shot(17, prefix.slice(1), 1200, "card"), body);

    // A refused squad has no card: 404, private, and no image.
    const refused = await request.get(
      `/api/season/card?d=${played.day}&xi=nobody_0&l=${prefix.slice(1)}`,
    );
    expect(refused.status()).toBe(404);
    expect(refused.headers()["content-type"]).not.toBe("image/png");
    expect(refused.headers()["cache-control"]).toBe("private, no-store");
  });
}
