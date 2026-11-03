import { describe, expect, it, vi } from "vitest";
import { footballer } from "@/pipeline/__fixtures__/calendar-pool.ts";
import type { Pool, PoolPlayer, Provenance } from "@/pipeline/types.ts";
import { FakeGitHub, type FakeRun } from "./github/fake.ts";
import {
  githubCard,
  homeSummary,
  lastRebuild,
  poolCounts,
  reviewItems,
} from "./home";

// The dashboard home's cards (Task 9) that need no database: the pool's
// counts, what to review, the last rebuild and the GitHub card's words.

const pool = (players: PoolPlayer[], extra: Partial<Pool> = {}): Pool => ({
  version: 1,
  players,
  clubs: [],
  honours: [],
  flags: [],
  dropped: [],
  ...extra,
});
const low: Provenance = {
  source: "enwiki",
  retrievedAt: "2026-10-04",
  confidence: "low",
  agreeing: ["enwiki"],
};
const withLow = (p: PoolPlayer, ...fields: string[]): PoolPlayer => ({
  ...p,
  provenance: {
    ...p.provenance,
    ...Object.fromEntries(fields.map((f) => [f, low])),
  },
});
const flag = (subject: string, kind: string) => ({
  subject,
  kind,
  detail: "d",
});

describe("the GitHub card", () => {
  it("the GitHub card says not connected when the fakes are off", () => {
    expect(githubCard(null)).toEqual({
      text: "Not connected: no KORA_GITHUB_TOKEN on this deployment. Every page reads; saves, undo and Rebuild now are off.",
      warn: false,
    });
  });

  it("gives the token's days left, red under 30", () => {
    expect(githubCard({ daysLeft: 200 })).toEqual({
      text: "Connected. The token expires in 200 days.",
      warn: false,
    });
    expect(githubCard({ daysLeft: 30 }).warn).toBe(false);
    expect(githubCard({ daysLeft: 29 })).toEqual({
      text: "Connected. The token expires in 29 days: make a new one and replace KORA_GITHUB_TOKEN in Vercel.",
      warn: true,
    });
    expect(githubCard({ daysLeft: 1 }).text).toContain("in 1 day:");
    expect(githubCard({ daysLeft: 0 })).toMatchObject({ warn: true });
    expect(githubCard({ daysLeft: -2 })).toEqual({
      text: "Connected, but the token expired 2 days ago: make a new one and replace KORA_GITHUB_TOKEN in Vercel.",
      warn: true,
    });
  });

  it("says when GitHub sent no expiry, and when it did not answer", () => {
    expect(githubCard({ daysLeft: null }).text).toBe(
      "Connected. GitHub sent no expiry date for the token.",
    );
    expect(githubCard({ daysLeft: null, status: 401 })).toEqual({
      text: "Connected, but GitHub refused the token (401): it may have expired.",
      warn: true,
    });
    expect(githubCard({ daysLeft: null, status: 0 })).toEqual({
      text: "Connected, but GitHub did not answer (0).",
      warn: true,
    });
  });
});

describe("the pool card", () => {
  it("counts active, legends, answer-ready, grace and the footballers left out", () => {
    const players = [
      footballer("a", "A"),
      footballer("b", "D"),
      footballer("c", "B", false),
      {
        ...footballer("g", "B"),
        pools: { active: false, legend: false, graceUntil: "2099-01-01" },
      },
      { ...footballer("l", "A"), pools: { active: false, legend: true } },
    ];
    const counts = poolCounts(
      pool(players, {
        dropped: [
          { wikidataId: "Q1", name: "x", reason: "no-pool" },
          { wikidataId: "Q2", name: "y", reason: "no-pool" },
        ] as Pool["dropped"],
      }),
    );
    expect(counts).toEqual({
      active: 3,
      legend: 1,
      answerReady: 2,
      grace: 1,
      leftOut: 2,
    });
  });
});

describe("the review card", () => {
  it("lists flag kinds and low-confidence fields, most first, the top five, each a pool filter", () => {
    const players = [
      withLow(footballer("p1", "A"), "caps", "goals"),
      withLow(footballer("p2", "A"), "caps"),
      withLow(footballer("p3", "A"), "caps"),
      footballer("p4", "A"),
    ];
    const qid = (i: number) => players[i]!.wikidataId;
    const items = reviewItems(
      pool(players, {
        flags: [
          flag(qid(0), "caps-row-skipped"),
          flag(qid(1), "caps-row-skipped"),
          flag(qid(2), "fr-undated-spell"),
          flag(qid(3), "a-kind"),
          flag(qid(3), "b-kind"),
          flag("Q-not-in-pool", "caps-row-skipped"),
        ] as Pool["flags"],
      }),
    );
    expect(items).toEqual([
      {
        label: "Caps: low confidence",
        count: 3,
        href: "/admin/pool?confidence=low&field=caps",
      },
      {
        label: "Flag caps-row-skipped",
        count: 2,
        href: "/admin/pool?flag=caps-row-skipped",
      },
      { label: "Flag a-kind", count: 1, href: "/admin/pool?flag=a-kind" },
      { label: "Flag b-kind", count: 1, href: "/admin/pool?flag=b-kind" },
      {
        label: "Flag fr-undated-spell",
        count: 1,
        href: "/admin/pool?flag=fr-undated-spell",
      },
    ]);
  });

  it("is empty for a pool with nothing to review", () => {
    expect(reviewItems(pool([footballer("p", "A")]))).toEqual([]);
  });
});

describe("the last rebuild card", () => {
  const nightly = (o: Partial<FakeRun>): FakeRun => ({
    id: 7,
    workflow: "nightly-data.yml",
    inputs: {},
    status: "completed",
    conclusion: "success",
    event: "schedule",
    createdAt: "2026-11-03T02:00:05Z",
    url: "https://github.com/run/7",
    headSha: "a",
    ...o,
  });
  const jobs = [
    {
      id: 1,
      name: "build",
      status: "completed",
      conclusion: "success",
      url: "j",
    },
    {
      id: 2,
      name: "propose",
      status: "completed",
      conclusion: "success",
      url: "j",
    },
  ];

  it("no nightly run yet", async () => {
    const fake = new FakeGitHub({ files: {} });
    expect(await lastRebuild(fake)).toEqual({ kind: "none" });
  });

  it("the newest run, scheduled or not: its stage, date and pull request", async () => {
    const fake = new FakeGitHub({ files: {} });
    fake.update((s) => {
      s.runs = [
        nightly({
          id: 8,
          workflow: "ci.yml",
          headSha: "b",
          createdAt: "2026-11-03T02:10:00Z",
        }),
        nightly({}),
        nightly({ id: 6, createdAt: "2026-11-02T02:00:05Z" }),
      ];
      s.jobs["7"] = jobs;
      s.pull = {
        number: 43,
        state: "open",
        merged: false,
        autoMerge: false,
        headSha: "b",
        url: "https://github.com/pull/43",
        title: "t",
      };
    });
    const card = await lastRebuild(fake);
    expect(card).toMatchObject({
      kind: "run",
      stage: "Waiting for review",
      date: "2026-11-03T02:00:05Z",
      scheduled: true,
      url: "https://github.com/run/7",
      pull: { number: 43, url: "https://github.com/pull/43" },
    });
  });

  it("a dispatched rebuild that merged", async () => {
    const fake = new FakeGitHub({ files: {} });
    fake.update((s) => {
      s.runs = [
        nightly({
          id: 8,
          workflow: "ci.yml",
          headSha: "b",
          createdAt: "2026-11-03T02:10:00Z",
        }),
        nightly({ event: "workflow_dispatch" }),
      ];
      s.jobs["7"] = jobs;
      s.pull = {
        number: 44,
        state: "closed",
        merged: true,
        autoMerge: true,
        headSha: "b",
        url: "p",
        title: "t",
      };
    });
    expect(await lastRebuild(fake)).toMatchObject({
      kind: "run",
      stage: "Merged",
      scheduled: false,
      pull: { number: 44 },
    });
  });

  it("a run under way, with no pull request read", async () => {
    const fake = new FakeGitHub({ files: {} });
    fake.update((s) => {
      s.runs = [nightly({ status: "in_progress", conclusion: null })];
    });
    const pull = vi.spyOn(fake, "dataPullRequest");
    expect(await lastRebuild(fake)).toMatchObject({
      kind: "run",
      stage: "Building",
    });
    expect(pull).not.toHaveBeenCalled();
  });
});

describe("the home summary without a database call", () => {
  it("asks GitHub once it is on, and reads the token's days after it", async () => {
    const fake = new FakeGitHub({ files: {} });
    const runs = vi.spyOn(fake, "workflowRuns");
    const days = vi.spyOn(fake, "tokenDaysLeft").mockReturnValue(12);
    const summary = await homeSummary({
      db: { query: () => Promise.reject(new Error("no database")) },
      today: "2026-11-03",
      pool: pool([]),
      github: fake,
    });
    expect(runs).toHaveBeenCalledTimes(1);
    expect(days).toHaveBeenCalledAfter(runs);
    expect(summary.rebuild).toEqual({ kind: "none" });
    expect(summary.github).toEqual(githubCard({ daysLeft: 12 }));
  });
});
