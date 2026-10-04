import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { createTestClient, resetDatabase, resetTables } from "./testing";

// The rules the data pipeline relies on, proven against Postgres itself.

const db = createTestClient();

beforeEach(async () => {
  await resetDatabase(db);
});

afterAll(async () => {
  await db.$disconnect();
});

async function seed() {
  await db.governorate.create({
    data: {
      id: "sfax",
      nameLatin: "Sfax",
      nameArabic: "صفاقس",
      nameFrench: "Sfax",
      region: "centre_east",
    },
  });
  await db.club.create({
    data: {
      id: "cs-sfaxien",
      wikidataId: "Q1",
      nameLatin: "CS Sfaxien",
      country: "TN",
      confederation: "CAF",
      ligue1: true,
    },
  });
}

function createPlayer(data: Partial<Prisma.PlayerUncheckedCreateInput> = {}) {
  return db.player.create({
    data: {
      id: "ali-maaloul",
      nameLatin: "Ali Maâloul",
      position: "defender",
      birthDate: new Date("1990-01-01"),
      ...data,
    },
  });
}

function addSpell(data: Partial<Prisma.PlayerClubUncheckedCreateInput> = {}) {
  return db.playerClub.create({
    data: {
      playerId: "ali-maaloul",
      seq: 0,
      clubId: "cs-sfaxien",
      clubName: "CS Sfaxien",
      fromYear: 2010,
      toYear: 2016,
      ...data,
    },
  });
}

describe("players", () => {
  it("store aliases, a governorate, a structured photo credit and both pool flags", async () => {
    await seed();
    await createPlayer({
      aliases: ["maaloul", "ma3loul", "معلول"],
      governorateId: "sfax",
      birthCountry: "TN",
      capsAsOf: new Date("2026-09-19"),
      photoFile: "File:Ali Maaloul.jpg",
      photoUrl: "https://upload.wikimedia.org/x.jpg",
      photoAuthor: "Someone",
      photoLicence: "CC BY-SA 4.0",
      photoLicenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      photoSourceUrl: "https://commons.wikimedia.org/wiki/File:Ali_Maaloul.jpg",
      poolActive: true,
      poolLegend: true,
    });

    const player = await db.player.findUniqueOrThrow({
      where: { id: "ali-maaloul" },
      include: { governorate: true },
    });
    expect(player.aliases).toEqual(["maaloul", "ma3loul", "معلول"]);
    expect(player.governorate?.region).toBe("centre_east");
    expect(player.poolActive && player.poolLegend).toBe(true);
  });

  it("reject a birth country that is not two capital letters", async () => {
    await expect(createPlayer({ birthCountry: "fr" })).rejects.toThrow(
      /players_birth_country_iso/,
    );
  });

  it("have a governorate only when born in Tunisia", async () => {
    await seed();
    await expect(
      createPlayer({ governorateId: "sfax", birthCountry: "FR" }),
    ).rejects.toThrow(/players_governorate_in_tunisia/);
    await createPlayer({ governorateId: "sfax", birthCountry: "TN" });
  });

  it("refer to an existing governorate", async () => {
    await expect(
      createPlayer({ governorateId: "atlantis" }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("need a licence and a source page with a photo", async () => {
    await expect(
      createPlayer({ photoUrl: "https://upload.wikimedia.org/x.jpg" }),
    ).rejects.toThrow(/players_photo_credited/);
  });
});

describe("careers", () => {
  it("keep spells in order and go with the player", async () => {
    await seed();
    await createPlayer();
    await addSpell();
    await addSpell({
      seq: 1,
      clubId: null,
      clubName: "Al Ahly",
      fromYear: 2016,
      toYear: null,
    });

    const career = await db.playerClub.findMany({
      where: { playerId: "ali-maaloul" },
      orderBy: { seq: "asc" },
    });
    expect(career.map((s) => s.clubName)).toEqual(["CS Sfaxien", "Al Ahly"]);

    await db.player.delete({ where: { id: "ali-maaloul" } });
    expect(await db.playerClub.count()).toBe(0);
  });

  it("allow one spell per position in a career", async () => {
    await seed();
    await createPlayer();
    await addSpell();
    await expect(addSpell()).rejects.toMatchObject({ code: "P2002" });
  });

  it("reject a spell that ends before it starts, or out-of-range years", async () => {
    await seed();
    await createPlayer();
    await expect(addSpell({ fromYear: 2016, toYear: 2010 })).rejects.toThrow(
      /player_clubs_years_ordered/,
    );
    await expect(addSpell({ fromYear: 1800 })).rejects.toThrow(
      /player_clubs_years_range/,
    );
  });

  it("reject negative appearances, goals or position", async () => {
    await seed();
    await createPlayer();
    await expect(addSpell({ apps: -1 })).rejects.toThrow(
      /player_clubs_stats_non_negative/,
    );
    await expect(addSpell({ seq: -1 })).rejects.toThrow(
      /player_clubs_seq_non_negative/,
    );
  });
});

describe("honours", () => {
  const honour = {
    competition: "tn_ligue1" as const,
    seasonStart: 2012,
    seasonEnd: 2013,
    clubId: "cs-sfaxien",
    source: "wikidata",
  };

  it("have one winner per competition and edition", async () => {
    await seed();
    await db.honour.create({ data: honour });
    await expect(db.honour.create({ data: honour })).rejects.toMatchObject({
      code: "P2002",
    });
    await db.honour.create({ data: { ...honour, competition: "tn_cup" } });
  });

  it("keep two editions that start in the same year", async () => {
    await seed();
    const cl = { ...honour, competition: "caf_cl" as const, seasonStart: 2018 };
    await db.honour.create({ data: { ...cl, seasonEnd: 2018 } });
    await db.honour.create({ data: { ...cl, seasonEnd: 2019 } });
    expect(await db.honour.count({ where: { competition: "caf_cl" } })).toBe(2);
  });

  it("reject an edition that ends before it starts", async () => {
    await seed();
    await expect(
      db.honour.create({ data: { ...honour, seasonEnd: 2011 } }),
    ).rejects.toThrow(/honours_season_end_not_before_start/);
  });

  it("reject an edition longer than two calendar years", async () => {
    await seed();
    await expect(
      db.honour.create({ data: { ...honour, seasonEnd: 2014 } }),
    ).rejects.toThrow(/honours_season_end_within_a_year/);
  });

  it("reject an unknown source and a season out of range", async () => {
    await seed();
    await expect(
      db.honour.create({ data: { ...honour, source: "guess" } }),
    ).rejects.toThrow(/honours_source/);
    await expect(
      db.honour.create({
        data: {
          ...honour,
          seasonStart: 1800,
          seasonEnd: 1800,
          source: "curated",
        },
      }),
    ).rejects.toThrow(/honours_season_range/);
  });
});

describe("resetDatabase", () => {
  it("empties every table in the schema", async () => {
    const rows = await db.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    expect([...resetTables].sort()).toEqual(
      rows.map((row) => row.tablename).sort(),
    );
  });
});
