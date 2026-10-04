import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestClient, resetDatabase } from "./testing";

// These tests write through Prisma with no application code in between, to
// prove the database itself refuses the states the games rely on never
// happening.

const db = createTestClient();

const visitor = "7b0c1a52-3f0e-4c1d-9a55-0d6a2f1e8c11";
const otherVisitor = "c2d7e9a0-58b4-4f6e-8d21-4b9f3a6c7e02";
const day = new Date("2026-10-04");
const nextDay = new Date("2026-10-05");

beforeEach(async () => {
  await resetDatabase(db);
});

afterAll(async () => {
  await db.$disconnect();
});

function createClub(overrides: { id?: string; country?: string } = {}) {
  return db.club.create({
    data: {
      id: "esperance-tunis",
      nameLatin: "Espérance de Tunis",
      nameArabic: "الترجي الرياضي التونسي",
      country: "TN",
      ...overrides,
    },
  });
}

function createPlayer(
  overrides: {
    id?: string;
    wikidataId?: string;
    caps?: number;
    goals?: number;
    clubId?: string;
  } = {},
) {
  return db.player.create({
    data: {
      id: "test-player",
      nameLatin: "Test Player",
      position: "midfielder",
      birthDate: new Date("1998-01-01"),
      ...overrides,
    },
  });
}

function createResult(
  overrides: {
    game?: "chkoun" | "season" | "aktar";
    day?: Date;
    visitorId?: string;
    score?: number;
  } = {},
) {
  return db.result.create({
    data: {
      game: "chkoun",
      day,
      visitorId: visitor,
      solved: true,
      score: 5,
      ...overrides,
    },
  });
}

describe("results", () => {
  it("keeps one result per visitor, game and day", async () => {
    await createResult();

    await expect(createResult({ score: 8 })).rejects.toMatchObject({
      code: "P2002",
    });
    expect(await db.result.count()).toBe(1);
  });

  it("accepts another day, another game and another visitor", async () => {
    await createResult();
    await createResult({ day: nextDay });
    await createResult({ game: "aktar" });
    await createResult({ visitorId: otherVisitor });

    expect(await db.result.count()).toBe(4);
  });

  it("rejects a negative score", async () => {
    await expect(createResult({ score: -1 })).rejects.toThrow(
      /results_score_non_negative/,
    );
  });
});

describe("puzzles", () => {
  it("allows one puzzle per game and day", async () => {
    await db.puzzle.create({ data: { game: "chkoun", day } });

    await expect(
      db.puzzle.create({ data: { game: "chkoun", day } }),
    ).rejects.toMatchObject({ code: "P2002" });

    await db.puzzle.create({ data: { game: "chkoun", day: nextDay } });
    await db.puzzle.create({ data: { game: "season", day } });
    expect(await db.puzzle.count()).toBe(3);
  });

  it("points at the player who is the answer", async () => {
    await createPlayer();
    const puzzle = await db.puzzle.create({
      data: { game: "chkoun", day, playerId: "test-player" },
      include: { player: true },
    });

    expect(puzzle.player?.nameLatin).toBe("Test Player");
  });
});

describe("players and clubs", () => {
  it("stores a player with a club", async () => {
    await createClub();
    await createPlayer({ clubId: "esperance-tunis" });

    const player = await db.player.findUniqueOrThrow({
      where: { id: "test-player" },
      include: { club: true },
    });
    expect(player.club?.nameArabic).toBe("الترجي الرياضي التونسي");
    expect(player.provenance).toEqual({});
  });

  it("rejects negative caps or goals", async () => {
    await expect(createPlayer({ caps: -1 })).rejects.toThrow(
      /players_caps_non_negative/,
    );
    await expect(createPlayer({ goals: -1 })).rejects.toThrow(
      /players_goals_non_negative/,
    );
  });

  it("keeps Wikidata ids unique", async () => {
    await createPlayer({ wikidataId: "Q1" });

    await expect(
      createPlayer({ id: "other-player", wikidataId: "Q1" }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("rejects a country that is not two capital letters", async () => {
    await expect(createClub({ country: "tn" })).rejects.toThrow(
      /clubs_country_iso/,
    );
  });
});

describe("reports", () => {
  it("start open", async () => {
    await createPlayer();
    const report = await db.report.create({
      data: {
        playerId: "test-player",
        visitorId: visitor,
        message: "He moved clubs in July.",
      },
    });

    expect(report.status).toBe("open");
  });

  it("reject an empty message and one over 500 characters", async () => {
    await createPlayer();
    const data = { playerId: "test-player", visitorId: visitor };

    await expect(
      db.report.create({ data: { ...data, message: "" } }),
    ).rejects.toThrow(/reports_message_length/);
    await expect(
      db.report.create({ data: { ...data, message: "x".repeat(501) } }),
    ).rejects.toThrow(/reports_message_length/);
    await db.report.create({ data: { ...data, message: "x".repeat(500) } });
  });
});
