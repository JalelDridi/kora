import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { E2E_ENV } from "../playwright.config";
import type { Pool, PoolPlayer } from "../src/pipeline/types";
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
