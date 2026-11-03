import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { E2E_ENV } from "../playwright.config";
import type { FakeRun } from "../src/admin/github/fake.ts";
import { activeRefusal } from "../src/pipeline/report.ts";
import type { Pool } from "../src/pipeline/types";
import { fakeCommits, resetFakes, updateFakes } from "./fixtures/admin-fakes";

// Rebuild now (/admin/rebuild) against the GitHub fake: the button
// dispatches the nightly with merge_when_green; the spec then plays
// GitHub's part, writing the run, its jobs, the build's log, the pull
// request and CI into the fake, and reloads the page as its own
// <meta refresh> would.

const SCREENS = ".superpowers/sdd/2026-11-03-admin-dashboard/screens/task-7";
const basic = `Basic ${Buffer.from(`jalel:${E2E_ENV.ADMIN_PASSWORD}`).toString("base64")}`;
test.use({ extraHTTPHeaders: { Authorization: basic } });
test.beforeEach(() => resetFakes());

// The active guard's real sentence, as data:build logs it (Task 7 review,
// m3): 230 active footballers falling to 216.
const actives = (n: number) =>
  ({
    players: Array.from({ length: n }, (_, i) => ({
      id: `p${i}`,
      clubId: "c",
      pools: { active: true, legend: false },
    })),
  }) as unknown as Pool;
const REFUSAL = `data:build refused: ${activeRefusal(actives(230), actives(216))}`;
const HEAD = "b".repeat(40);
const refresh = (page: Page) => page.locator('meta[http-equiv="refresh"]');
const stage = (page: Page) => page.getByTestId("stage");

async function shoot(page: Page, name: string, prefix = "rebuild") {
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.screenshot({
      path: `${SCREENS}/${prefix}-${width}-${name}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 360, height: 800 });
}

// While it follows a run the page reloads itself, which axe's meta-refresh
// rule flags (WCAG 2.2.1) whatever the page offers; the page meets the
// criterion with its "Stop reloading" switch, tested below, and is checked
// with the full rule set once stopped and in every final stage.
async function axeClean(page: Page, reloading = false) {
  const axe = new AxeBuilder({ page });
  if (reloading) axe.disableRules(["meta-refresh"]);
  expect((await axe.analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(360);
}

/** The dispatched run in the fake, changed by `change`. */
function setRun(change: (run: FakeRun) => void) {
  updateFakes((s) => change(s.runs[0]!));
}

test("Rebuild now dispatches the nightly, then shows the run, a refusal, the pull request and the merge", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/admin/rebuild");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rebuild");
  await expect(refresh(page)).toHaveCount(0);
  await axeClean(page);
  await shoot(page, "idle");

  await page.getByRole("button", { name: "Rebuild now" }).click();
  await expect(page).toHaveURL(/\/admin\/rebuild\?since=/);
  const fake = JSON.parse(readFileSync(E2E_ENV.KORA_ADMIN_FAKES, "utf8")) as {
    runs: FakeRun[];
  };
  expect(fake.runs).toHaveLength(1);
  expect(fake.runs[0]).toMatchObject({
    workflow: "nightly-data.yml",
    event: "workflow_dispatch",
    inputs: { allow_pool_drop: "false", merge_when_green: "true" },
  });
  await expect(stage(page)).toHaveText(/^Queued/);
  await expect(refresh(page)).toHaveAttribute("content", "15");
  await expect(
    page.getByRole("button", { name: "Rebuild now" }),
  ).toBeDisabled();
  await axeClean(page, true);
  await shoot(page, "queued");

  // The reader can stop the reloads (WCAG 2.2.1), and start them again.
  await page.getByRole("link", { name: "Stop reloading" }).click();
  await expect(page.getByText("Reloading is off.")).toBeVisible();
  await expect(refresh(page)).toHaveCount(0);
  await axeClean(page);
  await page.getByRole("link", { name: "Reload and keep reloading" }).click();
  await expect(refresh(page)).toHaveAttribute("content", "15");

  // The build job refuses: its log's tail carries the guard's words.
  setRun((run) => {
    run.status = "completed";
    run.conclusion = "failure";
  });
  updateFakes((s) => {
    const id = s.runs[0]!.id;
    s.jobs[String(id)] = [
      {
        id: 101,
        name: "build",
        status: "completed",
        conclusion: "failure",
        url: "https://github.com/JalelDridi/kora/actions/runs/1/job/101",
      },
      {
        id: 102,
        name: "propose",
        status: "completed",
        conclusion: "skipped",
        url: "https://github.com/JalelDridi/kora/actions/runs/1/job/102",
      },
    ];
    s.logs["101"] = [
      "2026-11-03T10:02:59.9Z data:build: 180 s",
      `2026-11-03T10:03:00.1Z ${REFUSAL}`,
      "2026-11-03T10:03:00.2Z ##[error]Process completed with exit code 1.",
      "",
    ].join("\n");
  });
  await page.reload();
  await expect(stage(page)).toHaveText(/^Refused/);
  const alert = page.getByRole("main").getByRole("alert");
  await expect(alert).toContainText(REFUSAL);
  await expect(alert).not.toContainText("2026-11-03T10:03");
  await expect(alert).toContainText(
    "A drop you expect: run the workflow by hand with allow_pool_drop (Actions tab)",
  );
  await expect(refresh(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Rebuild now" })).toBeEnabled();
  await axeClean(page);
  await shoot(page, "refused");

  // The same run green, the pull request opened with auto-merge, CI green.
  setRun((run) => {
    run.conclusion = "success";
  });
  updateFakes((s) => {
    const id = s.runs[0]!.id;
    s.jobs[String(id)] = s.jobs[String(id)]!.map((j) => ({
      ...j,
      conclusion: "success",
    }));
    s.pull = {
      number: 43,
      state: "open",
      merged: false,
      autoMerge: true,
      headSha: HEAD,
      url: "https://github.com/JalelDridi/kora/pull/43",
      title: "data: nightly pool 2026-11-03",
    };
    s.runs.unshift({
      id: 900,
      workflow: "ci.yml",
      inputs: {},
      status: "in_progress",
      conclusion: null,
      event: "workflow_dispatch",
      createdAt: new Date().toISOString(),
      url: "https://github.com/JalelDridi/kora/actions/runs/900",
      headSha: HEAD,
    });
  });
  await page.reload();
  await expect(stage(page)).toHaveText(/^Checking/);
  await expect(refresh(page)).toHaveAttribute("content", "15");
  await axeClean(page, true);
  await shoot(page, "checking");

  updateFakes((s) => {
    const ci = s.runs.find((r) => r.id === 900)!;
    ci.status = "completed";
    ci.conclusion = "success";
  });
  await page.reload();
  await expect(stage(page)).toHaveText(/^Merging/);
  await expect(page.getByTestId("pull")).toContainText("#43");
  await expect(page.getByTestId("pull")).toContainText("Auto-merge: on");
  await expect(page.getByTestId("pull")).toContainText("CI: passed");
  await expect(refresh(page)).toHaveAttribute("content", "15");
  await axeClean(page, true);
  await shoot(page, "merging");

  updateFakes((s) => {
    s.pull = { ...s.pull!, state: "closed", merged: true };
  });
  await page.reload();
  await expect(stage(page)).toHaveText(/^Merged/);
  await expect(page.getByRole("link", { name: /#43/ })).toHaveAttribute(
    "href",
    "https://github.com/JalelDridi/kora/pull/43",
  );
  await expect(refresh(page)).toHaveCount(0);
  await axeClean(page);
  // Every link and button on the page is a 44 px target at 360 px.
  for (const target of await page.getByRole("main").locator("a, button").all())
    expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await shoot(page, "merged");
  // Nothing was committed to main by the dashboard.
  expect(fakeCommits()).toEqual([]);
});

// Task 7 review, B1: main requires no check, so the propose job leaves
// auto-merge off and says so; the page names the missing ruleset.
test("a green rebuild that main requires no check for says it does not merge by itself", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/admin/rebuild");
  await page.getByRole("button", { name: "Rebuild now" }).click();
  await expect(page).toHaveURL(/\/admin\/rebuild\?since=/);
  setRun((run) => {
    run.status = "completed";
    run.conclusion = "success";
  });
  updateFakes((s) => {
    const id = s.runs[0]!.id;
    s.jobs[String(id)] = [
      {
        id: 101,
        name: "build",
        status: "completed",
        conclusion: "success",
        url: "https://github.com/JalelDridi/kora/actions/runs/1/job/101",
      },
      {
        id: 102,
        name: "propose",
        status: "completed",
        conclusion: "success",
        url: "https://github.com/JalelDridi/kora/actions/runs/1/job/102",
      },
    ];
    s.logs["102"] = [
      "2026-11-03T10:09:00.0Z ✓ Created workflow_dispatch event for ci.yml at data/nightly",
      "2026-11-03T10:09:00.1Z main has no required check: auto-merge left off",
      "2026-11-03T10:09:00.2Z pull request ready: data/nightly",
      "",
    ].join("\n");
    s.pull = {
      number: 43,
      state: "open",
      merged: false,
      autoMerge: false,
      headSha: HEAD,
      url: "https://github.com/JalelDridi/kora/pull/43",
      title: "data: nightly pool 2026-11-03",
    };
    s.runs.unshift({
      id: 900,
      workflow: "ci.yml",
      inputs: {},
      status: "completed",
      conclusion: "success",
      event: "workflow_dispatch",
      createdAt: new Date().toISOString(),
      url: "https://github.com/JalelDridi/kora/actions/runs/900",
      headSha: HEAD,
    });
  });
  await page.reload();
  await expect(stage(page)).toHaveText(
    "Not merged by itself: main has no required check. Add a ruleset on main requiring check (README: Auto-merge).",
  );
  await expect(page.getByTestId("pull")).toContainText("CI: passed");
  await expect(page.getByTestId("pull")).toContainText("Auto-merge: off");
  await expect(page.getByText(/Allow auto-merge/)).toHaveCount(0);
  await expect(refresh(page)).toHaveCount(0);
  await axeClean(page);
  await shoot(page, "no-required-check");
});

test("a second Rebuild now while a nightly runs is refused, and the button says why", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/admin/rebuild");
  // The page was loaded with nothing running; then the scheduled night starts.
  updateFakes((s) => {
    s.runs.unshift({
      id: 50,
      workflow: "nightly-data.yml",
      inputs: {},
      status: "in_progress",
      conclusion: null,
      event: "schedule",
      createdAt: new Date().toISOString(),
      url: "https://github.com/JalelDridi/kora/actions/runs/50",
      headSha: "a".repeat(40),
    });
  });
  await page.getByRole("button", { name: "Rebuild now" }).click();
  await expect(page).toHaveURL(/\/admin\/rebuild\?error=running/);
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Not started: a nightly run was already under way.",
  );
  const fake = JSON.parse(readFileSync(E2E_ENV.KORA_ADMIN_FAKES, "utf8")) as {
    runs: FakeRun[];
  };
  expect(fake.runs.map((r) => r.id)).toEqual([50]);
  await expect(
    page.getByRole("button", { name: "Rebuild now" }),
  ).toBeDisabled();
  await expect(page.getByTestId("busy")).toContainText(
    "A nightly run is under way",
  );
  await expect(
    page.getByRole("table", { name: "Last nightly runs" }),
  ).toContainText("scheduled");
  await axeClean(page);
  await shoot(page, "running");
});

// Task 7 review, I1: the server action checks the password itself.
test("the rebuild action refuses a request without the password", async ({
  request,
}) => {
  const response = await request.post("/admin/rebuild", {
    headers: { Authorization: "", "Next-Action": "0".repeat(42) },
    multipart: {},
  });
  expect(response.status()).toBe(401);
  const fake = JSON.parse(readFileSync(E2E_ENV.KORA_ADMIN_FAKES, "utf8")) as {
    runs: FakeRun[];
  };
  expect(fake.runs).toEqual([]);
});

// Task 3 review, M2: the saved view's way to the rebuild is a 44 px target.
test("the footballer editor's Rebuild now link is a full-size target to this page", async ({
  page,
}) => {
  const pool = JSON.parse(readFileSync("data/pool.json", "utf8")) as Pool;
  const someone = pool.players.find((p) => p.pools.active && p.clubId)!;
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/admin/footballers/${someone.wikidataId}`);
  await page.getByLabel("Caps", { exact: true }).fill(String(someone.caps + 1));
  await page.getByLabel("Note").fill("FTF page, 3 November");
  await page.getByRole("button", { name: "Preview" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  const link = page.getByRole("link", { name: "Rebuild now" });
  const box = (await link.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  await shoot(page, "saved", "editor");
  await link.click();
  await expect(page).toHaveURL(/\/admin\/rebuild$/);
});
