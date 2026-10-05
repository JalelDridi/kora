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

function createClub(
  overrides: { id?: string; wikidataId?: string; country?: string } = {},
) {
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
    await expect(createResult({ game: "aktar", score: -1 })).rejects.toThrow(
      /results_score_non_negative/,
    );
  });

  it("a Chkoun? result has 1 to 8 guesses", async () => {
    await expect(createResult({ score: 0 })).rejects.toThrow(
      /results_chkoun_score/,
    );
    await expect(createResult({ score: 9 })).rejects.toThrow(
      /results_chkoun_score/,
    );
    await createResult({ score: 1 });
    await createResult({ score: 8, visitorId: otherVisitor });
  });
});

describe("puzzles", () => {
  it("allows one puzzle per game and day", async () => {
    await createPlayer();
    const playerId = "test-player";
    await db.puzzle.create({ data: { game: "chkoun", day, playerId } });

    await expect(
      db.puzzle.create({ data: { game: "chkoun", day, playerId } }),
    ).rejects.toMatchObject({ code: "P2002" });

    await db.puzzle.create({
      data: { game: "chkoun", day: nextDay, playerId },
    });
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

describe("the Chkoun? calendar", () => {
  // Days relative to today in Tunis, computed by Postgres, never a fixed date.
  async function insertDay(offset: number, source = "generator") {
    await db.$executeRawUnsafe(
      `INSERT INTO puzzles (id, game, day, player_id, source)
       VALUES (gen_random_uuid(), 'chkoun',
               (now() AT TIME ZONE 'Africa/Tunis')::date + $1::int,
               'test-player', $2)`,
      offset,
      source,
    );
  }

  function updateDay(offset: number) {
    return db.$executeRawUnsafe(
      `UPDATE puzzles SET note = 'swapped'
       WHERE game = 'chkoun'
         AND day = (now() AT TIME ZONE 'Africa/Tunis')::date + $1::int`,
      offset,
    );
  }

  function deleteDay(offset: number) {
    return db.$executeRawUnsafe(
      `DELETE FROM puzzles
       WHERE game = 'chkoun'
         AND day = (now() AT TIME ZONE 'Africa/Tunis')::date + $1::int`,
      offset,
    );
  }

  beforeEach(async () => {
    await createPlayer();
  });

  it("a Chkoun? puzzle must name a footballer", async () => {
    await expect(
      db.puzzle.create({ data: { game: "chkoun", day } }),
    ).rejects.toThrow(/puzzles_chkoun_has_player/);
    await db.puzzle.create({ data: { game: "season", day } });
  });

  it("a puzzle's source is generator, pin or reserve", async () => {
    await expect(insertDay(10, "manual")).rejects.toThrow(/puzzles_source/);
    await insertDay(10, "generator");
    await insertDay(11, "pin");
    await insertDay(12, "reserve");
    expect(await db.puzzle.count()).toBe(3);
  });

  it("a note is 1 to 200 characters", async () => {
    await expect(
      db.puzzle.create({
        data: { game: "chkoun", day, playerId: "test-player", note: "" },
      }),
    ).rejects.toThrow(/puzzles_note_length/);
  });

  it("a day less than 48 hours away cannot be changed", async () => {
    await insertDay(1);
    await insertDay(5);

    await expect(updateDay(1)).rejects.toThrow(/puzzle day is frozen/);
    expect(await updateDay(5)).toBe(1);
    await expect(deleteDay(1)).rejects.toThrow(/puzzle day is frozen/);
    expect(await db.puzzle.count()).toBe(2);
  });

  it("a frozen day can still be filled once", async () => {
    await insertDay(0, "reserve");
    expect(await db.puzzle.count()).toBe(1);
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

  it("keeps a club's Wikidata id unique", async () => {
    await createClub({ wikidataId: "Q2" });

    await expect(
      createClub({ id: "club-africain", wikidataId: "Q2" }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("fame tier is A to D", async () => {
    await expect(
      db.player.create({
        data: {
          id: "test-player",
          nameLatin: "Test Player",
          position: "midfielder",
          birthDate: new Date("1998-01-01"),
          fameTier: "E",
        },
      }),
    ).rejects.toThrow(/players_fame_tier/);
  });

  it("a stored photo path needs a credited photo", async () => {
    await expect(
      db.player.create({
        data: {
          id: "test-player",
          nameLatin: "Test Player",
          position: "midfielder",
          birthDate: new Date("1998-01-01"),
          photoPath: "/photos/test-player.jpg",
        },
      }),
    ).rejects.toThrow(/players_photo_path_credited/);
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
