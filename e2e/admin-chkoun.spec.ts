import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { E2E_ENV } from "../playwright.config";
import { type ChkounFixture, seedChkoun } from "./fixtures/chkoun";

// /admin/chkoun on the test database: the calendar is seeded with known
// answers (e2e/fixtures/chkoun.ts). English page, behind the password.

const basic = (password: string) =>
  `Basic ${Buffer.from(`jalel:${password}`).toString("base64")}`;
const RIGHT = { Authorization: basic(E2E_ENV.ADMIN_PASSWORD) };

let fixture: ChkounFixture;
test.beforeAll(async () => {
  fixture = await seedChkoun();
});

const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000)
    .toISOString()
    .slice(0, 10);

test("without the password /admin/chkoun is 401", async ({ request }) => {
  const response = await request.get("/admin/chkoun");
  expect(response.status()).toBe(401);
  expect(response.headers()["www-authenticate"]).toMatch(/^Basic /);
});

test("a POST of the action without the password is refused", async ({
  request,
}) => {
  const response = await request.post("/admin/chkoun", {
    headers: { "Next-Action": "0".repeat(42) },
    multipart: { day: addDays(fixture.today, 3), player: fixture.others[0] },
  });
  expect(response.status()).toBe(401);
});

test("with the password the page lists 37 rows and the current window", async ({
  page,
}) => {
  await page.setExtraHTTPHeaders(RIGHT);
  const response = await page.goto("/admin/chkoun");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["cache-control"]).toContain("no-store");
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(page.locator("tbody tr")).toHaveCount(37);
  await expect(page.getByText("Repeat window")).toBeVisible();
  await expect(page.locator(".facts")).toContainText("days");
});

test("the frozen rows have no form", async ({ page }) => {
  await page.setExtraHTTPHeaders(RIGHT);
  await page.goto("/admin/chkoun");
  await expect(page.locator("tbody tr.frozen")).toHaveCount(10);
  await expect(page.locator("tbody tr.frozen form")).toHaveCount(0);
  await expect(page.locator("tbody tr:not(.frozen) form")).toHaveCount(27);
});

test("Jalel can change day today + 3 and cannot change today + 2", async ({
  page,
}) => {
  await page.setExtraHTTPHeaders(RIGHT);
  await page.goto("/admin/chkoun");
  const plus2 = page.locator(`#d-${addDays(fixture.today, 2)}`);
  await expect(plus2.locator("form")).toHaveCount(0);
  const plus3 = page.locator(`#d-${addDays(fixture.today, 3)}`);
  const player = fixture.answers[29];
  await plus3.getByLabel(/Footballer for/).fill(player);
  await plus3.getByRole("button", { name: "Pin" }).click();
  await expect(page.getByRole("status")).toContainText(
    `Saved: ${addDays(fixture.today, 3)}`,
  );
  const row = page.locator(`#d-${addDays(fixture.today, 3)}`);
  await expect(row).toContainText("pin");
  await expect(row).toContainText("pinned by Jalel");
  // A footballer who is not answer-ready is refused, by message.
  await page
    .locator(`#d-${addDays(fixture.today, 4)}`)
    .getByLabel(/Footballer for/)
    .fill("not-a-footballer");
  await page
    .locator(`#d-${addDays(fixture.today, 4)}`)
    .getByRole("button", { name: "Swap" })
    .click();
  await expect(page.locator("p[role=alert]")).toContainText("not answer-ready");
});

test("axe finds nothing on the calendar", async ({ page }) => {
  await page.setExtraHTTPHeaders(RIGHT);
  await page.goto("/admin/chkoun");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
