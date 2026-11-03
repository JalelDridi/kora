import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { E2E_ENV } from "../playwright.config";
import type { Pool, PoolPlayer } from "../src/pipeline/types";
import { resetFakes } from "./fixtures/admin-fakes";

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

  // Branch review, T9 M1: at 360 px both tables scroll inside a region a
  // keyboard can reach, and the page is axe clean.
  await page.setViewportSize({ width: 360, height: 800 });
  for (const name of ["Provenance", "Career"])
    await expect(page.getByRole("region", { name })).toHaveAttribute(
      "tabindex",
      "0",
    );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

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

// The dashboard home and the nav (Task 9). The server runs with the GitHub
// fakes (no nightly run in them); "not connected" is a unit test of the
// card's words (src/admin/home.test.ts).

const NAV_PAGES = [
  ["/admin", "Home"],
  ["/admin/pool", "Pool"],
  ["/admin/games/chkoun", "Games"],
  ["/admin/add", "Add"],
  ["/admin/settings", "Settings"],
  ["/admin/rebuild", "Rebuild"],
  ["/admin/changes", "Changes"],
  ["/admin/chkoun", "Calendar"],
] as const;

test("/admin is the dashboard home: six cards, the nav, axe clean, no sideways scroll at 360 px", async ({
  page,
}) => {
  resetFakes();
  await page.setExtraHTTPHeaders(RIGHT);
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    const response = await page.goto("/admin");
    expect(response?.status()).toBe(200);
    expect(response?.headers()["cache-control"]).toContain("no-store");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Kora admin",
    );

    const cards = page.getByRole("main").locator(".cards > section");
    await expect(cards).toHaveCount(6);
    await expect(cards.getByRole("heading", { level: 2 })).toHaveText([
      "Today",
      "The pool",
      "To review",
      "Last rebuild",
      "GitHub",
      "Quick links",
    ]);
    const card = (name: string) =>
      page.getByRole("region", { name, exact: true });
    await expect(
      card("Today").getByRole("link", { name: "The Chkoun? calendar" }),
    ).toHaveAttribute("href", "/admin/chkoun");
    await expect(card("Today")).toContainText("Today's answer");
    const fact = (label: string) =>
      card("The pool").locator(".facts div", {
        has: page.getByText(label, { exact: true }),
      });
    await expect(fact("Active").getByRole("definition")).toHaveText(
      String(pool.players.filter((p) => p.pools.active).length),
    );
    await expect(fact("Legends").getByRole("definition")).toHaveText(
      String(pool.players.filter((p) => p.pools.legend).length),
    );
    await expect(fact("Left out").getByRole("definition")).toHaveText(
      String(pool.dropped.length),
    );
    const review = card("To review").getByRole("link");
    expect(await review.count()).toBeGreaterThan(0);
    expect(await review.count()).toBeLessThanOrEqual(5);
    await expect(review.first()).toHaveAttribute("href", /^\/admin\/pool\?/);
    await expect(card("Last rebuild")).toContainText("No nightly run yet.");
    await expect(
      card("Last rebuild").getByRole("link", { name: "Rebuild" }),
    ).toHaveAttribute("href", "/admin/rebuild");
    await expect(page.getByTestId("github-card")).toHaveText(
      "Connected. GitHub sent no expiry date for the token.",
    );
    for (const [name, href] of [
      ["Add a footballer", "/admin/add"],
      ["Settings", "/admin/settings"],
      ["Changes", "/admin/changes"],
    ])
      await expect(
        card("Quick links").getByRole("link", { name, exact: true }),
      ).toHaveAttribute("href", href);

    const nav = page.getByRole("navigation", { name: "Admin pages" });
    await expect(nav.getByRole("link")).toHaveText(
      NAV_PAGES.map(([, label]) => label),
    );
    await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }

  // At 360 px the nav scrolls inside itself; every link stays 44 px high.
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/admin");
  const links = page
    .getByRole("navigation", { name: "Admin pages" })
    .getByRole("link");
  for (const link of await links.all())
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await links.last().scrollIntoViewIfNeeded();
  await expect(links.last()).toBeInViewport();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(360);

  // The search goes to the pool review with the name.
  await page.getByLabel("Find a footballer").fill(sure.nameLatin);
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/admin\/pool\?q=/);
});

test("every admin page has the nav with the current page marked", async ({
  page,
}) => {
  resetFakes();
  await page.setExtraHTTPHeaders(RIGHT);
  await page.setViewportSize({ width: 360, height: 800 });
  for (const [path, label] of NAV_PAGES) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    const nav = page.getByRole("navigation", { name: "Admin pages" });
    await expect(nav.getByRole("link")).toHaveCount(NAV_PAGES.length);
    await expect(nav.locator("[aria-current]")).toHaveCount(1);
    await expect(nav.locator('[aria-current="page"]')).toHaveText(label);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      path,
    ).toBeLessThanOrEqual(360);
  }
  // A page under a section marks its section; a click moves the mark.
  await page.goto(`/admin/pool/${sure.id}`);
  const nav = page.getByRole("navigation", { name: "Admin pages" });
  await expect(nav.locator('[aria-current="page"]')).toHaveText("Pool");
  await nav.getByRole("link", { name: "Changes" }).click();
  await expect(page).toHaveURL(/\/admin\/changes$/);
  await expect(nav.locator('[aria-current="page"]')).toHaveText("Changes");
  await page.goto(`/admin/footballers/${sure.wikidataId}`);
  await expect(nav.locator("[aria-current]")).toHaveCount(0);
});

test("the page links of a long list are 44 px targets at 360 px", async ({
  page,
}) => {
  await page.setExtraHTTPHeaders(RIGHT);
  await page.setViewportSize({ width: 360, height: 800 });
  for (const path of ["/admin/pool?page=2", "/admin/games/chkoun?page=2"]) {
    await page.goto(path);
    const links = page
      .getByRole("navigation", { name: "Pages", exact: true })
      .getByRole("link");
    await expect(links, path).toHaveCount(2);
    for (const link of await links.all())
      expect(
        (await link.boundingBox())!.height,
        `${path} ${await link.textContent()}`,
      ).toBeGreaterThanOrEqual(44);
  }
});
