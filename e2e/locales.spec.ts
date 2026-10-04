import { expect, test } from "@playwright/test";
import { defaultLocale, localeInfo, locales } from "../src/i18n/locales";
import { site } from "../src/site";

test("the root opens in Derja, Arabic script", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/ar$/);
});

test.describe("with a browser set to French", () => {
  test.use({ locale: "fr-FR" });

  test("the root still opens in Derja (decision P3)", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/ar$/);
  });
});

for (const locale of locales) {
  const { prefix, dir } = localeInfo[locale];

  test(`${prefix} is served as ${locale}, ${dir}`, async ({ page }) => {
    const response = await page.goto(prefix);
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    await expect(
      page.getByRole("heading", { level: 1, name: site.name }),
    ).toBeVisible();
  });

  test(`${prefix} has a title and a description`, async ({ page }) => {
    await page.goto(prefix);
    await expect(page).toHaveTitle(new RegExp(site.name));
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      /.{20,}/,
    );
  });

  test(`${prefix} announces its language alternates once, in the head`, async ({
    page,
  }) => {
    const response = await page.goto(prefix);
    expect(response?.headers()["link"] ?? "").not.toMatch(/hreflang/i);

    const canonical = page.locator('head link[rel="canonical"]');
    await expect(canonical).toHaveCount(1);
    const canonicalHref = await canonical.getAttribute("href");
    expect(new URL(canonicalHref ?? "", page.url()).pathname).toBe(prefix);

    const alternates = page.locator('head link[rel="alternate"][hreflang]');
    const expected: Record<string, string> = {
      ...Object.fromEntries(
        locales.map((other) => [other, localeInfo[other].prefix]),
      ),
      "x-default": localeInfo[defaultLocale].prefix,
    };
    await expect(alternates).toHaveCount(Object.keys(expected).length);
    for (const [hreflang, path] of Object.entries(expected)) {
      const link = page.locator(
        `head link[rel="alternate"][hreflang="${hreflang}"]`,
      );
      await expect(link).toHaveCount(1);
      const href = await link.getAttribute("href");
      expect(new URL(href ?? "", page.url()).pathname).toBe(path);
    }
  });
}

test("an unknown page is a 404", async ({ request }) => {
  const response = await request.get("/ar/nope");
  expect(response.status()).toBe(404);
});
