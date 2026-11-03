import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { E2E_ENV } from "../playwright.config";
import type { Pool } from "../src/pipeline/types";
import { fakeCommits, fakeFile, resetFakes } from "./fixtures/admin-fakes";

// The footballer editor (/admin/footballers/[qid]) against the GitHub fake:
// the server under test reads and commits the JSON state KORA_ADMIN_FAKES
// names, which this spec seeds from the working tree and reads back.

const pool = JSON.parse(readFileSync("data/pool.json", "utf8")) as Pool;
const basic = `Basic ${Buffer.from(`jalel:${E2E_ENV.ADMIN_PASSWORD}`).toString("base64")}`;
test.use({ extraHTTPHeaders: { Authorization: basic } });
test.beforeEach(() => resetFakes());
const someone = pool.players.find((p) => p.pools.active && p.clubId)!;

test("the editor shows today's values with their sources, previews a diff, saves one commit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/admin/footballers/${someone.wikidataId}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    someone.nameLatin,
  );
  await expect(page.getByLabel("Caps", { exact: true })).toHaveValue(
    String(someone.caps),
  );
  await expect(page.getByTestId("caps-source")).toContainText(
    someone.provenance.caps?.confidence ?? "",
  );
  await page.getByLabel("Caps", { exact: true }).fill(String(someone.caps + 1));
  await page.getByLabel("Note").fill("FTF page, 3 November");
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("table", { name: "Changes" })).toContainText(
    `${someone.caps} → ${someone.caps + 1}`,
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/^Saved as [0-9a-f]{7}/)).toBeVisible();
  const [commit] = fakeCommits();
  expect(commit.message).toMatch(
    new RegExp(`^data\\(overrides\\): ${someone.wikidataId} `),
  );
  expect(
    JSON.parse(fakeFile("data/overrides.json")).players[someone.wikidataId]
      .caps,
  ).toMatchObject({
    value: someone.caps + 1,
    by: "jalel",
    note: "FTF page, 3 November",
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(360);
});

test("a value the validators refuse is shown, and nothing is committed", async ({
  page,
}) => {
  await page.goto(
    `/admin/footballers/${someone.wikidataId}?preview=1&nameArabic=Msakni&note=x`,
  );
  // Inside main: Next's route announcer is an alert of its own.
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "nameArabic: invalid value",
  );
  await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
  expect(fakeCommits()).toEqual([]);
});

test("the save action refuses a request without the password", async ({
  request,
}) => {
  const response = await request.post(
    `/admin/footballers/${someone.wikidataId}`,
    {
      headers: { Authorization: "", "Next-Action": "0".repeat(42) },
      multipart: { qid: someone.wikidataId, caps: "1", note: "x" },
    },
  );
  expect(response.status()).toBe(401);
  expect(fakeCommits()).toEqual([]);
});

test("the form and the saved page are axe clean, and an untouched field writes nothing", async ({
  page,
}) => {
  const before = JSON.parse(fakeFile("data/overrides.json")).players[
    someone.wikidataId
  ];
  await page.goto(`/admin/footballers/${someone.wikidataId}`);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page
    .getByLabel("Goals", { exact: true })
    .fill(String(someone.goals + 2));
  await page.getByLabel("Note").fill("FTF page");
  await page.getByRole("button", { name: "Preview" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/^Saved as [0-9a-f]{7}/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Rebuild now" })).toHaveAttribute(
    "href",
    "/admin/rebuild",
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  // Only goals is new: every other field kept its override, or got none.
  const after = JSON.parse(fakeFile("data/overrides.json")).players[
    someone.wikidataId
  ];
  const { goals, ...rest } = after;
  expect(goals).toMatchObject({ value: someone.goals + 2, by: "jalel" });
  expect(rest).toEqual(before ?? {});
  expect(fakeCommits()).toHaveLength(1);
});

test("the pool's footballer page links to his editor", async ({ page }) => {
  await page.goto(`/admin/pool/${someone.id}`);
  await page.getByRole("link", { name: "Edit overrides" }).click();
  await expect(page).toHaveURL(`/admin/footballers/${someone.wikidataId}`);
});
