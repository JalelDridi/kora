import { expect, test } from "@playwright/test";
import { localeInfo, locales } from "../src/i18n/locales";
import {
  alternateOpenGraphLocales,
  openGraphLocale,
  shareImageMaxBytes,
  shareImagePath,
  shareImageSize,
} from "../src/share";
import { site } from "../src/site";

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
