import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import arLatnTN from "../messages/ar-Latn-TN.json";
import arTN from "../messages/ar-TN.json";
import fr from "../messages/fr.json";
import { localeInfo, locales } from "../src/i18n/locales";

const messages = { "ar-TN": arTN, "ar-Latn-TN": arLatnTN, fr };

for (const locale of locales) {
  const { prefix, dir } = localeInfo[locale];
  const strings = messages[locale].notFound;

  test(`${prefix}/… unknown page is a styled 404 in its language with a way back`, async ({
    page,
  }) => {
    const response = await page.goto(`${prefix}/nope-xyz`);
    expect(response?.status()).toBe(404);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    await expect(page.locator("html")).toHaveCSS(
      "background-color",
      "rgb(11, 21, 16)",
    );
    await expect(
      page.getByRole("heading", { level: 1, name: strings.title }),
    ).toBeVisible();
    await expect(page.getByText(strings.body)).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    const home = page.getByRole("link", { name: strings.home });
    await expect(home).toHaveAttribute("href", prefix);
    await home.click();
    await expect(page).toHaveURL(new RegExp(`${prefix}$`));
  });
}

test("a deep unknown path is a 404 too", async ({ request }) => {
  expect((await request.get("/fr/a/b/c")).status()).toBe(404);
});

test("an unknown path outside a language lands on the Derja 404", async ({
  page,
}) => {
  const response = await page.goto("/nope-xyz");
  expect(response?.status()).toBe(404);
  await expect(page).toHaveURL(/\/ar\/nope-xyz$/);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});
