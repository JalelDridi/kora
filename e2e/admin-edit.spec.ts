import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { E2E_ENV } from "../playwright.config";
import type { Pool } from "../src/pipeline/types";
import {
  fakeCommits,
  fakeFile,
  IN_POOL,
  OUTSIDE,
  resetFakes,
  setOverride,
} from "./fixtures/admin-fakes";

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

const overridesOf = (qid: string) =>
  JSON.parse(fakeFile("data/overrides.json")).players[qid];
/** The card of one Wikidata match on the add page. */
const card = (page: import("@playwright/test").Page, label: string) =>
  page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: label, exact: true }) });

test("search, add with a note, land on his editor with the include in the diff", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/admin/add");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByLabel("Name on Wikidata").fill("Msakni");
  await page.getByRole("button", { name: "Search" }).click();
  const outside = card(page, OUTSIDE.label);
  await expect(outside.getByTestId("footballer")).toHaveText("yes");
  await expect(outside.getByTestId("tunisian")).toHaveText("no");
  await expect(outside).toContainText("2003-04-05");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(360);
  await outside.getByLabel("Note").fill("Called up by Tunisia, FTF list");
  await outside.getByRole("button", { name: /^Add to the pool/ }).click();
  await expect(page).toHaveURL(
    new RegExp(`/admin/footballers/${OUTSIDE.qid}\\?saved=[0-9a-f]{40}$`),
  );
  await expect(page.getByText(/^Saved as [0-9a-f]{7}/)).toBeVisible();
  await expect(page.getByRole("table", { name: "Changes" })).toContainText(
    `players.${OUTSIDE.qid}.include`,
  );
  await expect(
    page.getByText(
      "He joins the pool at the next rebuild if his data qualifies him",
    ),
  ).toBeVisible();
  await expect(page.getByTestId("included")).toContainText(
    "Called up by Tunisia, FTF list",
  );
  const commits = fakeCommits();
  expect(commits).toHaveLength(1);
  expect(commits[0].message.split("\n")[0]).toBe(
    `data(overrides): ${OUTSIDE.qid} ${OUTSIDE.label}: include`,
  );
  expect(overridesOf(OUTSIDE.qid)).toEqual({
    include: {
      value: true,
      by: "jalel",
      at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      note: "Called up by Tunisia, FTF list",
    },
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  // Back on the add page, he is waiting for the rebuild, not offered again.
  await page.goto("/admin/add?q=Msakni");
  await expect(card(page, OUTSIDE.label)).toContainText(
    "joins the pool at the next rebuild",
  );
  await expect(
    card(page, OUTSIDE.label).getByRole("button", { name: /^Add/ }),
  ).toHaveCount(0);
});

test("a footballer already in the pool links to his editor instead of Add", async ({
  page,
}) => {
  await page.goto("/admin/add?q=Msakni");
  const known = card(page, IN_POOL.label);
  await expect(known).toContainText("Already in the pool.");
  await expect(known.getByTestId("tunisian")).toHaveText("yes");
  await expect(known.getByRole("button")).toHaveCount(0);
  await known.getByRole("link", { name: /^Edit his overrides/ }).click();
  await expect(page).toHaveURL(`/admin/footballers/${IN_POOL.qid}`);
  await page.goto("/admin/add?q=Zzz");
  await expect(
    page.getByRole("heading", { name: "No item on Wikidata matches “Zzz”" }),
  ).toBeVisible();
  expect(fakeCommits()).toEqual([]);
});

test("exclude previews every override that goes, saves, and Include again removes it", async ({
  page,
}) => {
  // Firas Chaouat: a club, caps and caps-date override in force.
  const qid = "Q58815643";
  const before = overridesOf(qid);
  const fields = Object.keys(before);
  expect(fields).toEqual(expect.arrayContaining(["caps", "club"]));
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/admin/footballers/${qid}`);
  await page.getByLabel("Why exclude him").fill("Not Tunisian (test)");
  await page.getByRole("button", { name: "Exclude from every game" }).click();
  const table = page.getByRole("table", { name: "Changes" });
  for (const field of fields)
    await expect(
      table.getByRole("row", {
        name: new RegExp(`^players\\.${qid}\\.${field} `),
      }),
    ).toContainText("none (excluded)");
  await expect(table).toContainText(`players.${qid}.exclude`);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/^Saved as [0-9a-f]{7}/)).toBeVisible();
  expect(fakeCommits()[0].message.split("\n")[0]).toBe(
    `data(overrides): ${qid} Firas Chaouat: exclude`,
  );
  expect(overridesOf(qid)).toEqual({
    exclude: {
      value: true,
      by: "jalel",
      at: expect.any(String),
      note: "Not Tunisian (test)",
    },
  });
  await expect(page.getByTestId("excluded")).toHaveText(
    /^Excluded since \d{4}-\d{2}-\d{2} \(Not Tunisian \(test\)\)$/,
  );
  // He is not added by search: nothing says the include goes.
  await expect(page.getByTestId("include-goes")).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByLabel("Why include him again").fill("Excluded by mistake");
  await page.getByRole("button", { name: "Include again" }).click();
  // The page after this save, not the one before it.
  await expect(
    page.getByRole("button", { name: "Exclude from every game" }),
  ).toBeVisible();
  await expect(page.getByText(/^Saved as [0-9a-f]{7}/)).toBeVisible();
  const commits = fakeCommits();
  expect(commits).toHaveLength(2);
  expect(commits[0].message).toContain(`- players.${qid}.exclude: yes → none`);
  // Nothing else comes back: his other overrides went with the
  // exclusion, and including him again restores none of them.
  expect(overridesOf(qid)).toBeUndefined();
});

test("a saved link GitHub does not know names the commit and claims no save", async ({
  page,
}) => {
  const sha = "a".repeat(40);
  await page.goto(`/admin/footballers/${someone.wikidataId}?saved=${sha}`);
  await expect(page.getByRole("status")).toHaveText("Commit aaaaaaa");
  await expect(page.getByText(/Saved as/)).toHaveCount(0);
  await expect(page.getByRole("table", { name: "Changes" })).toHaveCount(0);
});

test("an add never built is withdrawn, not excluded: one commit removes the include", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/admin/add?q=Msakni");
  const outside = card(page, OUTSIDE.label);
  await outside.getByLabel("Note").fill("Called up by Tunisia, FTF list");
  await outside.getByRole("button", { name: /^Add to the pool/ }).click();
  await expect(page.getByText(/^Saved as [0-9a-f]{7}/)).toBeVisible();
  // In neither the pool nor its left-out list: withdraw, not exclude.
  await expect(
    page.getByRole("heading", { name: "Withdraw the add" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Exclude from every game" }),
  ).toHaveCount(0);
  await expect(page.getByTestId("included")).toContainText(
    "Called up by Tunisia, FTF list",
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(360);
  await page.getByLabel("Why withdraw the add").fill("Wrong Msakni");
  await page.getByRole("button", { name: "Withdraw the add" }).click();
  // The page after this save: the add is gone, the exclusion is back.
  await expect(
    page.getByRole("button", { name: "Exclude from every game" }),
  ).toBeVisible();
  await expect(page.getByText(/^Saved as [0-9a-f]{7}/)).toBeVisible();
  await expect(page.getByTestId("included")).toHaveCount(0);
  const commits = fakeCommits();
  expect(commits).toHaveLength(2);
  expect(commits[0].message.split("\n")[0]).toBe(
    `data(overrides): ${OUTSIDE.qid} ${OUTSIDE.label}: withdraw include`,
  );
  expect(commits[0].message).toContain(
    `- players.${OUTSIDE.qid}.include: yes → none`,
  );
  expect(overridesOf(OUTSIDE.qid)).toBeUndefined();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("excluding a footballer built from an include says the include goes with him", async ({
  page,
}) => {
  const stamp = { by: "jalel", at: "2026-11-01" };
  setOverride(IN_POOL.qid, {
    include: { value: true, ...stamp, note: "Added by search (test)" },
  });
  const goes =
    "He was added by search: once excluded he is no longer fetched. Include again will not bring him back; search for him again to re-add him.";
  await page.goto(`/admin/footballers/${IN_POOL.qid}`);
  await page.getByLabel("Why exclude him").fill("Not him (test)");
  await page.getByRole("button", { name: "Exclude from every game" }).click();
  await expect(page.getByRole("table", { name: "Changes" })).toContainText(
    `players.${IN_POOL.qid}.include`,
  );
  await expect(page.getByTestId("include-goes")).toHaveText(goes);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/^Saved as [0-9a-f]{7}/)).toBeVisible();
  await expect(page.getByTestId("excluded")).toBeVisible();
  await expect(page.getByTestId("include-goes")).toHaveText(goes);
});
