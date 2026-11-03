import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { E2E_ENV } from "../playwright.config";
import {
  clubsWithAutoShort,
  fsSource,
  inspectSource,
} from "../src/pipeline/check";
import type { Pool, PoolPlayer } from "../src/pipeline/types";
import {
  fakeCommit,
  fakeCommits,
  fakeFile,
  IN_POOL,
  OUTSIDE,
  resetFakes,
  setOverride,
  updateFakes,
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
  // Task 4 review, I2: the page leads with the exclusion; his values wait,
  // read only, in a closed disclosure.
  const values = page.locator("details", {
    has: page.getByText("His values (editing is off while he is excluded)"),
  });
  await expect(values).toHaveCount(1);
  await expect(values).not.toHaveAttribute("open");
  await expect(page.getByLabel("Caps", { exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Preview" })).toHaveCount(0);
  expect(
    await page
      .getByTestId("excluded")
      .evaluate(
        (notice) =>
          (notice.compareDocumentPosition(document.querySelector("details")!) &
            Node.DOCUMENT_POSITION_FOLLOWING) !==
          0,
      ),
  ).toBe(true);
  // Right under the heading: nothing but his id between them.
  expect(
    await page.evaluate(
      () =>
        document
          .querySelector("h1")!
          .nextElementSibling!.nextElementSibling!.querySelector(
            "[data-testid=excluded]",
          ) !== null,
    ),
  ).toBe(true);
  await values.locator("summary").click();
  await expect(page.getByLabel("Caps", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Caps", { exact: true })).toBeDisabled();
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

// Neither the page nor any scroll box in it scrolls sideways at 360 px.
const fits360 = async (page: import("@playwright/test").Page) => {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(360);
  expect(
    await page.evaluate(
      () =>
        [...document.querySelectorAll(".scroll")].filter(
          (box) => box.scrollWidth > box.clientWidth,
        ).length,
    ),
  ).toBe(0);
};

// The Chkoun? rules, written out here rather than imported, so the page is
// checked against an independent reading of data/pool.json:
// - the answer-ready fields are the club, position, birth date, caps and the
//   governorate (born abroad: the birthplace); a field counts when its
//   confidence is high or medium, or, for caps only, when its sources agree
//   on a band;
// - answer-ready: active, and every one of those fields counts;
// - one field away: active, not answer-ready, exactly one field short;
// - answer-ready, fame short: answer-ready, but of tier D or not measured
//   (the calendar draws tiers A to C);
// - in grace: out of the active pool with a grace date (the game keeps any
//   date; the nightly build removes it once passed).
const shortOf = (p: PoolPlayer) =>
  [
    "clubId",
    "position",
    "birthDate",
    "caps",
    p.governorate === null ? "birthPlace" : "governorate",
  ].filter((field) => {
    const entry = p.provenance[field as keyof PoolPlayer["provenance"]];
    const sure = entry?.confidence === "high" || entry?.confidence === "medium";
    return !sure && !(field === "caps" && entry?.bandAgreed === true);
  });

test("the Chkoun? view counts the pool and links each footballer to his editor", async ({
  page,
}) => {
  const active = pool.players.filter((p) => p.pools.active);
  const ready = active.filter((p) => shortOf(p).length === 0);
  const away = active.filter((p) => shortOf(p).length === 1);
  const fameShort = ready.filter(
    (p) => !["A", "B", "C"].includes(p.fame?.tier ?? ""),
  );
  const grace = pool.players.filter(
    (p) => !p.pools.active && p.pools.graceUntil !== undefined,
  );
  const tier = (t: string | null) =>
    active.filter((p) => (p.fame?.tier ?? null) === t).length;
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/admin/games/chkoun");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Chkoun? view",
  );
  const count = (label: string) =>
    page.getByRole("link", { name: `${label}: `, exact: false }).first();
  await expect(count("Active")).toHaveAccessibleName(
    `Active: ${active.length}, list them`,
  );
  await expect(count("Answer-ready")).toHaveText(String(ready.length));
  await expect(count("In grace")).toHaveText(String(grace.length));
  await expect(count("One field away")).toHaveText(String(away.length));
  await expect(count("Answer-ready, fame short")).toHaveText(
    String(fameShort.length),
  );
  for (const t of ["A", "B", "C", "D"] as const)
    await expect(count(`Active, tier ${t}`)).toHaveText(String(tier(t)));
  await expect(count("Active, not measured")).toHaveText(String(tier(null)));
  await expect(
    page.getByRole("heading", { name: "Today and tomorrow" }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await fits360(page);

  // The first row, by name, opens his editor.
  const first = [...active, ...pool.players.filter((p) => p.pools.graceUntil)]
    .map((p) => p.nameLatin)
    .sort((a, b) => a.localeCompare(b, "en"))[0];
  const who = pool.players.find((p) => p.nameLatin === first)!;
  const table = page.getByRole("table", { name: "Footballers" });
  await expect(table.getByRole("link", { name: first })).toHaveAttribute(
    "href",
    `/admin/footballers/${who.wikidataId}`,
  );
  // On a phone his row is two lines: the name, then the other columns.
  const firstRow = table.getByRole("row").nth(1);
  await expect(firstRow.locator(".sub")).toBeVisible();
  await expect(firstRow.locator(".sub")).toContainText(" · fame ");
  await expect(table.getByRole("columnheader", { name: /^Club/ })).toBeHidden();
  // From 40rem the columns are back and the second line is gone.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(firstRow.locator(".sub")).toBeHidden();
  await expect(
    table.getByRole("columnheader", { name: /^Club/ }),
  ).toBeVisible();
  await page.setViewportSize({ width: 360, height: 800 });

  // A 30–0 sort is not one of this page's: it reads, and prints, as name.
  await page.goto("/admin/games/chkoun?sort=open");
  await expect(page.getByRole("status")).toContainText("sorted by name.");
  // On a phone the sorts sit with the filters, the column headers hidden.
  await expect(
    page
      .getByRole("navigation", { name: "Filters" })
      .getByRole("link", { name: "club", exact: true }),
  ).toHaveAttribute("href", "/admin/games/chkoun?sort=club");
  await expect(
    page
      .getByRole("navigation", { name: "Filters" })
      .getByRole("link", { name: "name", exact: true }),
  ).toHaveAttribute("aria-current", "true");

  // One field away is the pipeline's list: no local-star form there.
  await page.goto("/admin/games/chkoun?show=away");
  await expect(page.getByRole("checkbox")).toHaveCount(0);

  // Answer-ready with tier D: fame short, and the local-star form previews
  // in his editor; nothing is committed.
  await page.goto("/admin/games/chkoun?show=fame-short");
  const star = fameShort.find(
    (p) => p.fame?.tier === "D" && !p.fame.localStar,
  )!;
  const named = page
    .getByRole("row")
    .filter({ has: page.getByRole("link", { name: star.nameLatin }) });
  await expect(named).toContainText("Fame");
  // The form sits in the row under his.
  const row = page.getByRole("row").filter({
    has: page.getByRole("checkbox", { name: `Local star (${star.nameLatin})` }),
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await fits360(page);
  await row.getByRole("checkbox", { name: /Local star/ }).check();
  await row.getByRole("textbox").fill("Known at home");
  await row.getByRole("button", { name: /Preview/ }).click();
  await expect(page).toHaveURL(
    new RegExp(`/admin/footballers/${star.wikidataId}\\?`),
  );
  await expect(page.getByRole("table", { name: "Changes" })).toContainText(
    "localStar",
  );
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  expect(fakeCommits()).toEqual([]);
});

test("the 30–0 view lists every Ligue 1 club with its candidates and ratings", async ({
  page,
}) => {
  const ligue1 = pool.clubs.filter((c) => c.ligue1);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/admin/games/season");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("30–0 view");
  const clubs = page.locator("details.club");
  await expect(clubs).toHaveCount(ligue1.length);
  for (const club of ligue1)
    await expect(
      page.locator(`details[id="${club.id}"] > summary`),
    ).toContainText(club.nameLatin);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await fits360(page);

  const esperance = page.locator('details[id="esperance-sportive-de-tunis"]');
  await esperance.locator("> summary").click();
  // Per decade, the counts per line, the names closed: an open club stays
  // short on a phone.
  const lines = esperance.locator("details.line > summary");
  await expect(lines.first()).toHaveText(/^(GK|DEF|MID|FWD) \d+/);
  await expect(esperance.locator("ol.candidates").first()).toBeHidden();
  expect((await esperance.boundingBox())!.height).toBeLessThan(900);
  await expect(
    esperance.getByRole("link", { name: /^Strength \d+/ }),
  ).toHaveAttribute(
    "href",
    "/admin/settings/ligue1-strength#esperance-sportive-de-tunis",
  );
  await lines.first().click();
  const candidate = esperance.locator("ol.candidates li").first();
  await expect(candidate).toBeVisible();
  await expect(candidate.locator(".rating")).toHaveText(/^\d+$/);
  const name = (await candidate.getByRole("link").textContent())!;
  const footballer = pool.players.find((p) => p.nameLatin === name)!;
  await expect(candidate.getByRole("link")).toHaveAttribute(
    "href",
    `/admin/footballers/${footballer.wikidataId}`,
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await fits360(page);
  await candidate.getByRole("link").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
});

// The six curated files (Task 6): /admin/settings/<file>, one row per
// commit, refused by the file's own validator before anything is committed.

const SETTINGS = [
  "ligue1-strength",
  "club-short",
  "honours",
  "afcon-2004",
  "ligue1-clubs",
  "governorates",
] as const;

/** The row of a settings table, by its key (the row's id). */
const rowOf = (page: import("@playwright/test").Page, key: string) =>
  page.locator(`tr[id="${key}"]`);

/** data:check over the working tree with the fake's data files in place. */
async function checkFake() {
  const base = fsSource(process.cwd());
  return inspectSource(
    {
      read: async (name) => {
        try {
          return fakeFile(`data/${name}`);
        } catch {
          return base.read(name);
        }
      },
      publicFileExists: (p) => base.publicFileExists(p),
    },
    { photos: false },
  );
}

test("club-short: edit a row, preview the diff, save one commit that passes data:check", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/admin/settings/club-short");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Short club labels",
  );
  // The clubs on an automatic label come first, closed under their count,
  // each with its Add link.
  const file = JSON.parse(fakeFile("data/curated/club-short.json")) as {
    clubs: Record<string, unknown>;
  };
  const auto = clubsWithAutoShort(pool, file.clubs);
  const summary = page.locator("section[aria-labelledby=auto] summary");
  await expect(summary).toHaveText(`${auto.length} clubs`);
  await expect(
    page.locator("section[aria-labelledby=auto] details"),
  ).not.toHaveAttribute("open");
  await summary.click();
  const autoList = page.getByRole("list", {
    name: "Clubs on an automatic label",
  });
  await expect(autoList.getByRole("listitem")).toHaveCount(auto.length);
  const firstAuto = auto[0].split(" ")[0];
  await expect(
    autoList.getByRole("link", { name: new RegExp(`^Add .*${firstAuto}`) }),
  ).toHaveAttribute("href", `/admin/settings/club-short?add=1&id=${firstAuto}`);
  expect(
    await autoList.evaluate(
      (list) =>
        (list.compareDocumentPosition(
          document.querySelector("table[aria-label=Rows]")!,
        ) &
          Node.DOCUMENT_POSITION_FOLLOWING) !==
        0,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await fits360(page);

  await rowOf(page, "es-zarzis").getByRole("link", { name: /^Edit/ }).click();
  await expect(page.getByLabel("Arabic")).toHaveValue("جرجيس");
  await expect(page.getByLabel("Arabic")).toHaveAttribute("dir", "rtl");
  await expect(page.getByTestId("arabic-count")).toHaveText(
    "1 word, 5 letters (at most 2 words of 8)",
  );
  await expect(page.getByTestId("latin-count")).toHaveText(
    "1 word, 3 letters (at most 2 words of 7)",
  );
  await page.getByLabel("Arabic").fill("زرزيس");
  await page.getByLabel("Why").fill("Fans write it so (test)");
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("table", { name: "Changes" })).toContainText(
    "ESZ / جرجيس → ESZ / زرزيس",
  );
  await expect(page.getByTestId("checked")).toHaveText(
    "data:check finds no error in this change.",
  );
  // The automatic-label warning the deployment already gives is not repeated.
  await expect(page.getByText(/automatic short label/)).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await fits360(page);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/^Saved as [0-9a-f]{7}/)).toBeVisible();
  const commits = fakeCommits();
  expect(commits).toHaveLength(1);
  expect(commits[0].message.split("\n")[0]).toBe(
    "data(club-short): es-zarzis ESZ / زرزيس",
  );
  const saved = JSON.parse(fakeFile("data/curated/club-short.json"));
  expect(saved.clubs["es-zarzis"]).toEqual({ latin: "ESZ", arabic: "زرزيس" });
  // His first edit takes the file over; the word DRAFT is his to remove.
  expect(saved.by).toBe("jalel");
  expect(saved.note).toContain("DRAFT");
  expect((await checkFake()).errors).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

const pageHeight = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.scrollHeight);

test("club-short stays short at 360 px: a filter, a panel alone, warnings closed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/admin/settings/club-short");
  const total = await page.locator("table[aria-label=Rows] tbody tr").count();
  // Everything above the rows (the header, the closed automatic list and
  // the filter) fits in about two screens.
  expect(
    await page.evaluate(
      () => document.querySelector("#rows")!.getBoundingClientRect().top,
    ),
  ).toBeLessThan(1500);

  // The filter matches the name, the id or a label, ignoring case.
  await page.getByLabel("Filter the rows").fill("zarzis");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page).toHaveURL(/\?q=zarzis$/);
  await expect(
    page.getByRole("heading", { name: `1 of ${total} rows` }),
  ).toBeVisible();
  await expect(rowOf(page, "es-zarzis")).toBeVisible();
  expect(await pageHeight(page)).toBeLessThan(2500);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await fits360(page);
  await page.goto(
    "/admin/settings/club-short?q=%D8%AC%D8%B1%D8%AC%D9%8A%D8%B3",
  );
  await expect(page.locator("table[aria-label=Rows] tbody tr")).toHaveCount(1);
  await page.goto("/admin/settings/club-short?q=ES-ZARZIS");
  await expect(page.locator("table[aria-label=Rows] tbody tr")).toHaveCount(1);
  await page.goto("/admin/settings/club-short?q=zarzis");

  // The filter rides along: Edit and Remove keep it, the panel comes alone
  // with a link back to the filtered rows.
  const edit = rowOf(page, "es-zarzis").getByRole("link", { name: /^Edit/ });
  await expect(edit).toHaveAttribute(
    "href",
    "/admin/settings/club-short?edit=es-zarzis&q=zarzis",
  );
  await expect(
    rowOf(page, "es-zarzis").getByRole("link", { name: /^Remove/ }),
  ).toHaveAttribute(
    "href",
    "/admin/settings/club-short?remove=es-zarzis&q=zarzis",
  );
  await edit.click();
  await expect(page.getByLabel("Arabic")).toBeVisible();
  await expect(page.locator("table[aria-label=Rows]")).toHaveCount(0);
  await expect(page.locator("section[aria-labelledby=auto]")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "All rows" })).toHaveAttribute(
    "href",
    "/admin/settings/club-short?q=zarzis",
  );
  // About two screens: 1,600 px since the 16 px base font and the 44 px
  // controls of every admin page (Task 9).
  expect(await pageHeight(page)).toBeLessThan(1600);

  // The preview: no rows either, and the warnings it has closed under their count.
  await page.getByLabel("Latin").fill("ZRZ");
  await page.getByLabel("Why").fill("Height test");
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("table", { name: "Changes" })).toBeVisible();
  await expect(page.locator("table[aria-label=Rows]")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Change the values" }),
  ).toHaveAttribute("href", /&q=zarzis$/);
  // Giving an automatic-label club its own label changes the warning: shown, closed.
  const club = clubsWithAutoShort(
    pool,
    (
      JSON.parse(fakeFile("data/curated/club-short.json")) as {
        clubs: Record<string, unknown>;
      }
    ).clubs,
  )[0].split(" ")[0];
  await page.goto(
    `/admin/settings/club-short?preview=1&op=add&id=${club}&latin=AB&arabic=%D8%A8&note=x`,
  );
  const warnings = page.locator("details:has(ul.warnings)");
  await expect(warnings.locator("summary")).toHaveText("1 warning");
  await expect(warnings).not.toHaveAttribute("open");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(fakeCommits()).toEqual([]);
});

test("club options show name and slug; an unknown id chooses nothing; ?error=constructor says nothing", async ({
  page,
}) => {
  await page.goto("/admin/settings/club-short?add=1&id=es-zarzis");
  const club = page.getByLabel("Club");
  await expect(club).toHaveValue("es-zarzis");
  await expect(club.locator("option:checked")).toHaveText(
    "ES Zarzis (es-zarzis)",
  );
  await expect(
    club.locator("option", { hasText: "choose a club" }),
  ).toHaveCount(0);
  await page.goto("/admin/settings/club-short?add=1&id=nowhere");
  await expect(club).toHaveValue("");
  await expect(club.locator("option:checked")).toHaveText("choose a club");
  for (const url of [
    "/admin/settings/club-short?error=constructor",
    `/admin/footballers/${someone.wikidataId}?error=constructor`,
    "/admin/add?error=constructor",
  ]) {
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  }
  await page.goto("/admin/settings/club-short?error=conflict");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "main changed twice",
  );
});

test("ligue1-strength: 91 is refused with the validator's message and no commit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/admin/settings/ligue1-strength");
  // The 30–0 view links each club to its row.
  for (const club of pool.clubs.filter((c) => c.ligue1))
    await expect(rowOf(page, club.id)).toContainText(club.nameLatin);
  await expect(
    page.getByRole("main").getByRole("link", { name: /^Remove/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("main").getByRole("link", { name: /^Add/ }),
  ).toHaveCount(0);
  await rowOf(page, "club-africain")
    .getByRole("link", { name: /^Edit/ })
    .click();
  await expect(page.getByLabel("Strength")).toHaveValue("77");
  await page.getByLabel("Strength").fill("91");
  await page.getByLabel("Why").fill("Too strong (test)");
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "data/curated/ligue1-strength.json: club-africain: strength must be a whole number from 55 to 90, not 91",
  );
  await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await fits360(page);
  expect(fakeCommits()).toEqual([]);
});

test("honours: add an edition, then remove it", async ({ page }) => {
  const club = pool.clubs.find((c) => c.id === "esperance-sportive-de-tunis")!;
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/admin/settings/honours");
  await page.getByRole("link", { name: "Add a row" }).click();
  await page.getByLabel("Competition").selectOption("tn_cup");
  await page.getByLabel("Season start").fill("2024");
  await page.getByLabel("Season end").fill("2025");
  await page.getByLabel("Club").selectOption(club.wikidataId);
  await page.getByLabel("Why").fill("FTF records (test)");
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("table", { name: "Changes" })).toContainText(
    `none → ${club.wikidataId}`,
  );
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/^Saved as [0-9a-f]{7}/)).toBeVisible();
  expect(JSON.parse(fakeFile("data/curated/honours.json"))).toEqual([
    {
      competition: "tn_cup",
      seasonStart: 2024,
      seasonEnd: 2025,
      clubWikidataId: club.wikidataId,
      by: "jalel",
      at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    },
  ]);
  expect(fakeCommits()[0].message.split("\n")[0]).toBe(
    `data(honours): add tn_cup 2024–2025 ${club.wikidataId}`,
  );
  const row = rowOf(page, "tn_cup|2024|2025");
  await expect(row).toContainText(club.nameLatin);
  // The title streams in after the save's redirect.
  await expect(page).toHaveTitle(/^Honours/);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await fits360(page);
  await row.getByRole("link", { name: /^Remove/ }).click();
  await page.getByLabel("Why").fill("Wrong year (test)");
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("table", { name: "Changes" })).toContainText(
    `${club.wikidataId} → none`,
  );
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/^Saved as [0-9a-f]{7}/)).toBeVisible();
  expect(JSON.parse(fakeFile("data/curated/honours.json"))).toEqual([]);
  expect(fakeCommits()).toHaveLength(2);
  await expect(row).toHaveCount(0);
});

test("governorates: no Remove button; editing a name commits", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/admin/settings/governorates");
  await expect(page.locator("table[aria-label=Rows] tbody tr")).toHaveCount(24);
  await expect(
    page.getByRole("main").getByRole("link", { name: /^Remove/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("main").getByRole("link", { name: /^Add/ }),
  ).toHaveCount(0);
  await rowOf(page, "manouba").getByRole("link", { name: /^Edit/ }).click();
  await expect(page.getByLabel("Region")).toHaveValue("grand_tunis");
  await page.getByLabel("French name").fill("Manouba");
  await page.getByLabel("Why").fill("Shorter form (test)");
  await page.getByRole("button", { name: "Preview" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/^Saved as [0-9a-f]{7}/)).toBeVisible();
  const rows = JSON.parse(fakeFile("data/curated/governorates.json")) as {
    id: string;
    nameFrench: string;
  }[];
  expect(rows).toHaveLength(24);
  expect(rows.find((r) => r.id === "manouba")!.nameFrench).toBe("Manouba");
  expect(fakeCommits()).toHaveLength(1);
});

test("an unknown settings page is 404, and the list names the six", async ({
  page,
}) => {
  expect((await page.goto("/admin/settings/pool"))!.status()).toBe(404);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/admin/settings");
  for (const id of SETTINGS)
    await expect(
      page.getByRole("link", { name: new RegExp(`${id}\\.json`) }),
    ).toHaveAttribute("href", `/admin/settings/${id}`);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await fits360(page);
});

test("every page refuses an invalid file before any commit", async ({
  page,
}) => {
  const refused: [string, string, string][] = [
    [
      "ligue1-strength",
      "op=set&key=club-africain&id=blois-football-41&strength=70",
      "blois-football-41 is not a Ligue 1 club",
    ],
    ["afcon-2004", "op=add&id=X12", "X12 is not a Wikidata id"],
    [
      "club-short",
      "op=set&key=es-zarzis&id=es-zarzis&latin=ZARZISSS&arabic=ESZ",
      "es-zarzis latin is longer than 7",
    ],
    [
      "governorates",
      "op=set&key=tunis&id=tunis&nameLatin=Tunis&nameArabic=&nameFrench=Tunis&region=grand_tunis",
      "governorate tunis: a name is missing",
    ],
    ["governorates", "op=remove&key=tunis", "rows are edited, never removed"],
  ];
  for (const [id, query, message] of refused) {
    await page.goto(`/admin/settings/${id}?preview=1&${query}&note=x`);
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      message,
    );
    await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
  }
  expect(fakeCommits()).toEqual([]);
});

test("the settings save action refuses a request without the password", async ({
  request,
}) => {
  const response = await request.post("/admin/settings/ligue1-strength", {
    headers: { Authorization: "", "Next-Action": "0".repeat(42) },
    multipart: {
      file: "ligue1-strength",
      op: "set",
      key: "club-africain",
      id: "club-africain",
      strength: "60",
      note: "x",
    },
  });
  expect(response.status()).toBe(401);
  expect(fakeCommits()).toEqual([]);
});

test("each settings page and its forms are axe clean at 360 px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  for (const id of SETTINGS) {
    await page.goto(`/admin/settings/${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await fits360(page);
    const edit = page.getByRole("link", { name: /^Edit/ }).first();
    if ((await edit.count()) > 0) {
      await edit.click();
      await expect(page.getByRole("button", { name: "Preview" })).toBeVisible();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await fits360(page);
    }
    await page.goto(`/admin/settings/${id}?add=1`);
    const add = page.getByRole("button", { name: "Preview" });
    if ((await add.count()) > 0) {
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await fits360(page);
    }
  }
});

// The changes log and undo (Task 8).

const CHANGES_SCREENS =
  ".superpowers/sdd/2026-11-03-admin-dashboard/screens/task-8";
async function shootChanges(
  page: import("@playwright/test").Page,
  state: string,
) {
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.screenshot({
      path: `${CHANGES_SCREENS}/changes-${width}${state ? `-${state}` : ""}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 360, height: 800 });
}
/** The log's entry for a commit subject. */
const logEntry = (page: import("@playwright/test").Page, subject: string) =>
  page
    .getByRole("list", { name: "Changes, newest first" })
    .getByRole("listitem")
    .filter({ hasText: subject });
/** someone's overrides with caps set to `caps` (by jalel, today). */
function withCaps(caps: number): string {
  const json = JSON.parse(fakeFile("data/overrides.json")) as {
    players: Record<string, Record<string, unknown>>;
  };
  json.players[someone.wikidataId] = {
    ...json.players[someone.wikidataId],
    caps: { value: caps, by: "jalel", at: "2026-11-03", note: "test" },
  };
  return `${JSON.stringify(json, null, 2)}\n`;
}

test("the log lists a dashboard edit; Undo previews and commits a revert that restores the file", async ({
  page,
}) => {
  const seed = fakeFile("data/overrides.json");
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/admin/footballers/${someone.wikidataId}`);
  await page.getByLabel("Caps", { exact: true }).fill(String(someone.caps + 1));
  await page.getByLabel("Note").fill("FTF page, 3 November");
  await page.getByRole("button", { name: "Preview" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/^Saved as [0-9a-f]{7}/)).toBeVisible();
  const [edit] = fakeCommits();
  const subject = edit.message.split("\n")[0];

  await page.goto("/admin/changes");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Changes");
  const entry = logEntry(page, subject);
  await expect(entry).toHaveCount(1);
  await expect(entry).toContainText("edited here");
  await expect(entry).toContainText("overrides");
  await expect(
    entry.getByRole("link", { name: `${edit.sha.slice(0, 7)} on GitHub` }),
  ).toHaveAttribute("href", edit.url);
  // The date in Tunis: the fake stamps the commit now.
  await expect(entry.locator("time")).toHaveText(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Tunis",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(edit.date)),
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await fits360(page);
  await shootChanges(page, "");

  await entry.getByRole("link", { name: /^Undo/ }).click();
  await expect(page).toHaveURL(`/admin/changes?undo=${edit.sha}`);
  const diff = page.getByRole("table", { name: "What goes back" });
  await expect(diff).toContainText(
    `players.${someone.wikidataId}.caps${someone.caps + 1} → `,
  );
  await expect(page.getByTestId("checked")).toBeVisible();
  await expect(page.locator("pre.message")).toContainText(
    `revert(data): ${subject}`.slice(0, 60),
  );
  await expect(page.locator("pre.message")).toContainText(
    `Reverts: ${edit.sha}`,
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await fits360(page);
  await shootChanges(page, "undo-preview");

  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByText(/^Undone as [0-9a-f]{7} on main\./),
  ).toBeVisible();
  expect(fakeFile("data/overrides.json")).toBe(seed);
  const commits = fakeCommits();
  expect(commits).toHaveLength(2);
  expect(commits[0].message).toMatch(/^revert\(data\): /);
  expect(commits[0].message).toContain(`Reverts: ${edit.sha}`);
  expect(commits[0].message).toContain("Admin-Edit: overrides");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await fits360(page);
  await shootChanges(page, "undone");
});

test("an entry changed twice cannot undo the first change", async ({
  page,
}) => {
  const first = await fakeCommit(
    "data/overrides.json",
    withCaps(someone.caps + 1),
    `data(overrides): ${someone.wikidataId} caps ${someone.caps + 1}\n\nAdmin-Edit: overrides`,
  );
  const second = await fakeCommit(
    "data/overrides.json",
    withCaps(someone.caps + 2),
    `data(overrides): ${someone.wikidataId} caps ${someone.caps + 2}\n\nAdmin-Edit: overrides`,
  );
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/admin/changes");
  const older = logEntry(page, first.message.split("\n")[0]);
  await older.getByRole("link", { name: /^Undo/ }).click();
  const alert = page.getByRole("main").getByRole("alert");
  await expect(alert).toContainText(
    `players.${someone.wikidataId}.caps changed since; edit it instead`,
  );
  await expect(alert.getByRole("link", { name: "Edit" })).toHaveAttribute(
    "href",
    `/admin/footballers/${someone.wikidataId}`,
  );
  await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await fits360(page);
  await shootChanges(page, "conflict");
  // The newer change is still the one to undo.
  await page.goto(`/admin/changes?undo=${second.sha}`);
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  expect(fakeCommits()).toHaveLength(2);
});

test("a commit that touched several files is a hand commit: no Undo", async ({
  page,
}) => {
  const hand = await fakeCommit(
    "data/overrides.json",
    withCaps(someone.caps + 1),
    "chore(data): a fix by hand",
  );
  updateFakes((state) => {
    state.commits[0].files.push("data/curated/honours.json");
    state.commits[0].before["data/curated/honours.json"] =
      state.files["data/curated/honours.json"];
  });
  await page.goto("/admin/changes");
  const entry = logEntry(page, "chore(data): a fix by hand");
  await expect(entry).toContainText(
    "No undo: made by hand; revert it on GitHub",
  );
  await expect(entry).not.toContainText("edited here");
  await expect(entry.getByRole("link", { name: /^Undo/ })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await shootChanges(page, "hand-commit");
  // A crafted preview says the same, with no Save.
  await page.goto(`/admin/changes?undo=${hand.sha}`);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "made by hand; revert it on GitHub",
  );
  await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
});

// Save plans the undo again on main's copy and on the commit as GitHub has
// it then, never on what the preview saw.
test("a preview gone stale is refused at Save: the entry changed since", async ({
  page,
}) => {
  const edit = await fakeCommit(
    "data/overrides.json",
    withCaps(someone.caps + 1),
    `data(overrides): ${someone.wikidataId} caps ${someone.caps + 1}\n\nAdmin-Edit: overrides`,
  );
  await page.goto(`/admin/changes?undo=${edit.sha}`);
  await expect(page.getByTestId("checked")).toBeVisible();
  // Main moves on after the preview: caps changed again, by a commit (the
  // fake reads a commit's own text from the commits after it).
  const changed = withCaps(someone.caps + 2);
  await fakeCommit(
    "data/overrides.json",
    changed,
    `data(overrides): ${someone.wikidataId} caps ${someone.caps + 2}\n\nAdmin-Edit: overrides`,
  );
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(`/admin/changes?undo=${edit.sha}&error=refused`);
  await expect(
    page
      .getByRole("main")
      .getByRole("alert")
      .filter({ hasText: "Not undone:" }),
  ).toContainText(
    `players.${someone.wikidataId}.caps changed since; edit it instead`,
  );
  await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
  expect(fakeCommits()).toHaveLength(2);
  expect(fakeFile("data/overrides.json")).toBe(changed);
});

test("a preview gone stale is refused at Save: the commit now touches several files", async ({
  page,
}) => {
  const edit = await fakeCommit(
    "data/overrides.json",
    withCaps(someone.caps + 1),
    `data(overrides): ${someone.wikidataId} caps ${someone.caps + 1}\n\nAdmin-Edit: overrides`,
  );
  await page.goto(`/admin/changes?undo=${edit.sha}`);
  await expect(page.getByTestId("checked")).toBeVisible();
  const text = fakeFile("data/overrides.json");
  updateFakes((state) => {
    state.commits[0].files.push("data/curated/honours.json");
    state.commits[0].before["data/curated/honours.json"] =
      state.files["data/curated/honours.json"];
  });
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(`/admin/changes?undo=${edit.sha}&error=refused`);
  await expect(
    page
      .getByRole("main")
      .getByRole("alert")
      .filter({ hasText: "Not undone:" }),
  ).toContainText("made by hand; revert it on GitHub");
  await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
  expect(fakeCommits()).toHaveLength(1);
  expect(fakeFile("data/overrides.json")).toBe(text);
});

test("with no change yet the log says so", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/admin/changes");
  await expect(page.getByText("No change yet.")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await fits360(page);
  await shootChanges(page, "empty");
});

test("the undo action refuses a request without the password", async ({
  request,
}) => {
  const edit = await fakeCommit(
    "data/overrides.json",
    withCaps(someone.caps + 1),
    "data(overrides): x\n\nAdmin-Edit: overrides",
  );
  const response = await request.post("/admin/changes", {
    headers: { Authorization: "", "Next-Action": "0".repeat(42) },
    multipart: { sha: edit.sha },
  });
  expect(response.status()).toBe(401);
  expect(fakeCommits()).toHaveLength(1);
});

// The whole round in one story (Task 10), at 360 px from /admin: add a
// footballer found on Wikidata, change a known footballer's club, mark
// another a local star from the Chkoun? view, change a club's strength,
// Rebuild now (the spec plays GitHub until the pull request is merged),
// read the four commits in the changes log, undo the club edit. After each
// commit the fake's data files pass data:check with no error.

const nav = (page: import("@playwright/test").Page, name: string) =>
  page
    .getByRole("navigation", { name: "Admin pages" })
    .getByRole("link", { name, exact: true })
    .click();

test("the story: add, edit a club, a local star, a strength, rebuild, the log, undo", async ({
  page,
}) => {
  test.slow();
  const seed = JSON.parse(fakeFile("data/overrides.json")) as {
    players: Record<string, unknown>;
  };
  const clubAfricain = pool.clubs.find((c) => c.id === "club-africain")!;
  const mover = pool.players.find(
    (p) =>
      p.pools.active &&
      p.clubId &&
      p.clubId !== clubAfricain.id &&
      seed.players[p.wikidataId] === undefined,
  )!;
  const noErrors = async () => expect((await checkFake()).errors).toEqual([]);

  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // 1. Search Wikidata and add a footballer outside the selection.
  await nav(page, "Add");
  await expect(page).toHaveURL("/admin/add");
  await page.getByLabel("Name on Wikidata").fill("Msakni");
  await page.getByRole("button", { name: "Search" }).click();
  const outside = card(page, OUTSIDE.label);
  await outside.getByLabel("Note").fill("Called up by Tunisia (story)");
  await outside.getByRole("button", { name: /^Add to the pool/ }).click();
  await expect(page.getByText(/^Saved as [0-9a-f]{7}/)).toBeVisible();
  expect(overridesOf(OUTSIDE.qid).include.value).toBe(true);
  expect(fakeCommits()).toHaveLength(1);
  await noErrors();

  // 2. A known footballer's club, from his pool page to his editor.
  await nav(page, "Pool");
  await page.goto(`/admin/pool/${mover.id}`);
  await page.getByRole("link", { name: "Edit overrides" }).click();
  await expect(page).toHaveURL(`/admin/footballers/${mover.wikidataId}`);
  await page
    .getByLabel("Club", { exact: true })
    .selectOption(clubAfricain.wikidataId);
  await page.getByLabel("Note").fill("Signed in the winter window (story)");
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("table", { name: "Changes" })).toContainText(
    `players.${mover.wikidataId}.club`,
  );
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/^Saved as [0-9a-f]{7}/)).toBeVisible();
  expect(overridesOf(mover.wikidataId).club).toMatchObject({
    value: clubAfricain.wikidataId,
    by: "jalel",
  });
  const clubEdit = fakeCommits()[0];
  expect(fakeCommits()).toHaveLength(2);
  await noErrors();

  // 3. A local star from the Chkoun? view: answer-ready, fame short.
  await nav(page, "Games");
  await expect(page).toHaveURL("/admin/games/chkoun");
  await page.goto("/admin/games/chkoun?show=fame-short");
  const star = pool.players.find(
    (p) =>
      p.pools.active &&
      shortOf(p).length === 0 &&
      p.fame?.tier === "D" &&
      !p.fame.localStar &&
      p.wikidataId !== mover.wikidataId,
  )!;
  const row = page.getByRole("row").filter({
    has: page.getByRole("checkbox", { name: `Local star (${star.nameLatin})` }),
  });
  await row.getByRole("checkbox", { name: /Local star/ }).check();
  await row.getByRole("textbox").fill("Known at home (story)");
  await row.getByRole("button", { name: /Preview/ }).click();
  await expect(page.getByRole("table", { name: "Changes" })).toContainText(
    "localStar",
  );
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/^Saved as [0-9a-f]{7}/)).toBeVisible();
  expect(overridesOf(star.wikidataId).localStar).toMatchObject({
    value: true,
    by: "jalel",
  });
  expect(fakeCommits()).toHaveLength(3);
  await noErrors();

  // 4. A club's strength, one row of a curated file.
  await nav(page, "Settings");
  await page
    .getByRole("main")
    .locator('a[href="/admin/settings/ligue1-strength"]')
    .first()
    .click();
  await rowOf(page, "club-africain")
    .getByRole("link", { name: /^Edit/ })
    .click();
  await page.getByLabel("Strength").fill("78");
  await page.getByLabel("Why").fill("A strong autumn (story)");
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByTestId("checked")).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/^Saved as [0-9a-f]{7}/)).toBeVisible();
  expect(fakeCommits()).toHaveLength(4);
  expect(fakeCommits()[0].message.split("\n")[0]).toMatch(
    /^data\(ligue1-strength\): club-africain/,
  );
  await noErrors();

  // 5. Rebuild now; GitHub (the spec) runs it green, CI passes, it merges.
  await nav(page, "Rebuild");
  await page.getByRole("button", { name: "Rebuild now" }).click();
  await expect(page).toHaveURL(/\/admin\/rebuild\?since=/);
  await expect(page.getByTestId("stage")).toHaveText(/^Queued/);
  const head = "c".repeat(40);
  updateFakes((s) => {
    const run = s.runs[0]!;
    run.status = "completed";
    run.conclusion = "success";
    s.jobs[String(run.id)] = ["build", "propose"].map((name, i) => ({
      id: 201 + i,
      name,
      status: "completed",
      conclusion: "success",
      url: `https://github.com/JalelDridi/kora/actions/runs/${run.id}/job/${201 + i}`,
    }));
    s.pull = {
      number: 44,
      state: "closed",
      merged: true,
      autoMerge: true,
      headSha: head,
      url: "https://github.com/JalelDridi/kora/pull/44",
      title: "data: nightly pool 2026-11-03",
    };
    s.runs.unshift({
      id: 901,
      workflow: "ci.yml",
      inputs: {},
      status: "completed",
      conclusion: "success",
      event: "workflow_dispatch",
      createdAt: new Date().toISOString(),
      url: "https://github.com/JalelDridi/kora/actions/runs/901",
      headSha: head,
    });
  });
  await page.reload();
  await expect(page.getByTestId("stage")).toHaveText(/^Merged/);
  // A rebuild commits nothing to main itself.
  expect(fakeCommits()).toHaveLength(4);

  // 6. The changes log lists the four dashboard commits.
  await nav(page, "Changes");
  const log = page
    .getByRole("list", { name: "Changes, newest first" })
    .getByRole("listitem");
  await expect(log).toHaveCount(4);
  await expect(log.filter({ hasText: "edited here" })).toHaveCount(4);

  // 7. Undo the club edit: his entry goes back, the others stay.
  const entry = logEntry(page, clubEdit.message.split("\n")[0]);
  await entry.getByRole("link", { name: /^Undo/ }).click();
  await expect(
    page.getByRole("table", { name: "What goes back" }),
  ).toContainText(`players.${mover.wikidataId}.club`);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByText(/^Undone as [0-9a-f]{7} on main\./),
  ).toBeVisible();
  const commits = fakeCommits();
  expect(commits).toHaveLength(5);
  expect(commits[0].message).toContain(`Reverts: ${clubEdit.sha}`);
  expect(overridesOf(mover.wikidataId)).toBeUndefined();
  expect(overridesOf(star.wikidataId).localStar.value).toBe(true);
  expect(overridesOf(OUTSIDE.qid).include.value).toBe(true);
  await noErrors();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(360);
});
