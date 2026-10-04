import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { E2E_ENV } from "../playwright.config";
import type { Pool, PoolPlayer } from "../src/pipeline/types";

// The review pages read the committed data/pool.json; so does this test, so
// it holds whatever the nightly build puts there. The case where
// ADMIN_PASSWORD is unset (a 404) needs another server environment: it is
// covered by src/admin/access.test.ts and src/proxy.test.ts.

const pool = JSON.parse(readFileSync("data/pool.json", "utf8")) as Pool;
const CHECKED = [
  "caps",
  "goals",
  "clubId",
  "birthDate",
  "position",
  "positionDetail",
  "history",
  "nameLatin",
] as const;
const levelOf = (p: PoolPlayer, field: (typeof CHECKED)[number]) =>
  p.provenance[field]?.confidence;
// One footballer whose caps are low, and one with no checked field low.
const lowCaps = pool.players.find((p) => levelOf(p, "caps") === "low")!;
const sure = pool.players.find((p) =>
  CHECKED.every((f) => levelOf(p, f) !== "low"),
)!;
// A footballer in the pool with a skipped infobox row or an undated French
// spell; the test fails, rather than skips, when the pool has none.
const ROW_KINDS = [
  "caps-row-skipped",
  "career-row-skipped",
  "fr-undated-spell",
];
const skipped = pool.flags.find(
  (f) =>
    ROW_KINDS.includes(f.kind) &&
    pool.players.some((p) => p.wikidataId === f.subject),
);
const skippedPlayer = pool.players.find(
  (p) => p.wikidataId === skipped?.subject,
);

const basic = (password: string) =>
  `Basic ${Buffer.from(`jalel:${password}`).toString("base64")}`;
const RIGHT = { Authorization: basic(E2E_ENV.ADMIN_PASSWORD) };

test("the review asks for a password and is never indexed", async ({
  request,
}) => {
  for (const path of ["/admin/pool", "/admin", `/admin/pool/${sure.id}`]) {
    const response = await request.get(path);
    expect(response.status()).toBe(401);
    expect(response.headers()["www-authenticate"]).toMatch(/^Basic /);
    expect(response.headers()["x-robots-tag"]).toContain("noindex");
  }
});

test("a wrong password is refused", async ({ request }) => {
  const wrong = { Authorization: basic("not-the-admin-password") };
  for (const path of ["/admin/pool", "/admin/pool.rsc"]) {
    const response = await request.get(path, { headers: wrong });
    expect(response.status()).toBe(401);
    expect(response.headers()["www-authenticate"]).toMatch(/^Basic /);
  }
});

test("the right password opens the review, with the pool's real counts", async ({
  page,
}) => {
  await page.setExtraHTTPHeaders(RIGHT);
  const response = await page.goto("/admin/pool");

  expect(response?.status()).toBe(200);
  expect(response?.headers()["cache-control"]).toContain("no-store");
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(
    page.getByRole("heading", { level: 1, name: "Pool review" }),
  ).toBeVisible();

  const summary = page.getByRole("definition");
  const fact = (label: string) =>
    page.locator(".facts div", { has: page.getByText(label, { exact: true }) });
  await expect(fact("Footballers").getByRole("definition")).toHaveText(
    String(pool.players.length),
  );
  await expect(fact("Active").getByRole("definition")).toHaveText(
    String(pool.players.filter((p) => p.pools.active).length),
  );
  await expect(fact("Clubs").getByRole("definition")).toHaveText(
    String(pool.clubs.length),
  );
  await expect(fact("Left out: no-pool").getByRole("definition")).toHaveText(
    String(pool.dropped.filter((d) => d.reason === "no-pool").length),
  );
  await expect(summary.first()).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Confidence by field" }),
  ).toBeVisible();
  await expect(page.getByRole("table", { name: "Footballers" })).toBeVisible();
  await expect(
    page.getByText(`Showing ${pool.players.length} of ${pool.players.length}`),
  ).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("the confidence filter narrows the table", async ({ page }) => {
  await page.setExtraHTTPHeaders(RIGHT);
  const table = page.getByRole("table", { name: "Footballers" });
  const search = async (q: string) => {
    await page.goto("/admin/pool");
    await page.getByLabel("Name, Latin or Arabic").fill(q);
    await page.getByRole("button", { name: "Search" }).click();
  };

  await search(sure.nameLatin);
  await expect(table.getByRole("link", { name: sure.nameLatin })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Filters" })
    .getByRole("link", { name: "low", exact: true })
    .click();
  await expect(page).toHaveURL(/confidence=low/);
  await expect(page.getByText("No footballer matches")).toBeVisible();

  await page.goto(
    `/admin/pool?confidence=low&field=caps&q=${encodeURIComponent(lowCaps.nameLatin)}`,
  );
  await expect(
    table.getByRole("link", { name: lowCaps.nameLatin }),
  ).toBeVisible();
  await expect(table.getByText("caps L").first()).toBeVisible();

  // Searching in Arabic letters finds the same footballer.
  if (lowCaps.nameArabic) {
    await page.goto(`/admin/pool?q=${encodeURIComponent(lowCaps.nameArabic)}`);
    await expect(
      table.getByRole("link", { name: lowCaps.nameLatin }),
    ).toBeVisible();
  }

  const lowCount = pool.players.filter((p) =>
    CHECKED.some((f) => levelOf(p, f) === "low"),
  ).length;
  await page.goto("/admin/pool?confidence=low");
  await expect(
    page.getByText(`Showing ${lowCount} of ${pool.players.length}`),
  ).toBeVisible();
  await page.goto("/admin/pool?confidence=nonsense");
  await expect(
    page.getByText(`Showing ${pool.players.length} of ${pool.players.length}`),
  ).toBeVisible();
});

test("a footballer's page shows where each field came from", async ({
  page,
}) => {
  await page.setExtraHTTPHeaders(RIGHT);
  await page.goto(`/admin/pool?q=${encodeURIComponent(lowCaps.nameLatin)}`);
  await page.getByRole("link", { name: lowCaps.nameLatin }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/pool/${lowCaps.id}$`));

  const provenance = page.getByRole("table", { name: "Provenance" });
  const caps = provenance.getByRole("row", { name: /^Caps / });
  await expect(caps).toContainText("low");
  await expect(caps).toContainText(lowCaps.provenance.caps!.confidenceNote!);
  await expect(page.getByRole("link", { name: "Wikidata" })).toHaveAttribute(
    "href",
    `https://www.wikidata.org/wiki/${lowCaps.wikidataId}`,
  );
  await expect(page.getByRole("link", { name: "Wikidata" })).toHaveAttribute(
    "rel",
    "noreferrer",
  );

  expect(skipped, "a footballer in the pool with a skipped row").toBeDefined();
  await page.goto(`/admin/pool/${skippedPlayer!.id}`);
  await expect(page.getByRole("list", { name: "Skipped rows" })).toContainText(
    skipped!.detail,
  );
});

test("an admin path that does not exist is a 404 behind the password", async ({
  request,
}) => {
  for (const path of [
    "/admin/no-such-page",
    "/admin/pool/no-such-footballer",
  ]) {
    const response = await request.get(path, { headers: RIGHT });
    expect(response.status()).toBe(404);
  }
});
