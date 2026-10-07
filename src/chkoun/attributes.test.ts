import { describe, expect, it } from "vitest";
import { footballer } from "@/pipeline/__fixtures__/calendar-pool.ts";
import type { Pool } from "@/pipeline/types.ts";
import { buildFootballers } from "./attributes.ts";

const governorates = [
  {
    id: "sfax",
    nameLatin: "Sfax",
    nameArabic: "صفاقس",
    nameFrench: "Sfax",
    region: "centre_east" as const,
  },
];

const active = {
  ...footballer("an-active-footballer", "A"),
  clubId: "club-a",
  history: [
    {
      clubId: "club-b",
      clubName: "B",
      from: 2015,
      to: 2018,
      apps: 1,
      goals: 0,
      loan: false,
    },
    {
      clubId: null,
      clubName: "Unknown",
      from: 2018,
      to: 2019,
      apps: null,
      goals: null,
      loan: false,
    },
  ],
  caps: 31,
  photo: {
    file: "File:X.jpg",
    thumbUrl: "https://upload.wikimedia.org/x.jpg",
    width: 330,
    height: 400,
    licence: "CC BY-SA 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    author: "Someone",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:X.jpg",
    attributionRequired: true,
    path: "/photos/an-active-footballer.jpg",
  },
};
const legend = {
  ...footballer("a-legend", "A"),
  birthCountry: "FR",
  governorate: null,
  pools: { active: false, legend: true },
  photo: { ...active.photo, path: null },
};

const pool: Pool = {
  version: 1,
  players: [active, legend],
  clubs: [
    {
      id: "club-a",
      wikidataId: "Q1",
      nameLatin: "A",
      nameArabic: null,
      nameFrench: null,
      country: "DE",
      confederation: "UEFA",
      leagueWikidataId: null,
      ligue1: false,
    },
  ],
  honours: [],
  flags: [],
  dropped: [],
};

describe("buildFootballers", () => {
  const f = buildFootballers(pool, governorates);

  it("holds the tile facts of every footballer, legends included", () => {
    expect(f.facts.get("an-active-footballer")).toEqual({
      id: "an-active-footballer",
      clubId: "club-a",
      clubCountry: "DE",
      confederation: "UEFA",
      line: "midfielder",
      birthDate: "1995-01-01",
      capsBand: 3,
      governorate: "sfax",
      region: "centre_east",
      birthCountry: "TN",
      pastClubIds: ["club-b"],
    });
    expect(f.facts.get("a-legend")).toMatchObject({
      clubId: null,
      clubCountry: null,
      governorate: null,
      birthCountry: "FR",
    });
  });

  it("only the active pool may be guessed", () => {
    expect([...f.guessable]).toEqual(["an-active-footballer"]);
  });

  it("a footballer in grace may be guessed too (P54)", () => {
    const inGrace = {
      ...footballer("in-grace", "A"),
      pools: { active: false, legend: false, graceUntil: "2026-12-03" },
    };
    const g = buildFootballers(
      {
        ...pool,
        players: [
          ...pool.players,
          inGrace,
          {
            ...legend,
            id: "a-legend-in-grace",
            pools: { ...legend.pools, graceUntil: "2026-12-03" },
          },
        ],
      },
      governorates,
    );
    expect([...g.guessable].sort()).toEqual([
      "a-legend-in-grace",
      "an-active-footballer",
      "in-grace",
    ]);
    expect(g.facts.has("in-grace")).toBe(true);
  });

  it("the card carries a photo only when it was copied", () => {
    expect(f.card("an-active-footballer")).toMatchObject({
      birth: "gov:sfax",
      caps: 31,
      photo: {
        path: "/photos/an-active-footballer.jpg",
        author: "Someone",
        licence: "CC BY-SA 4.0",
      },
    });
    expect(f.card("a-legend")).toMatchObject({
      birth: "abroad:FR",
      photo: null,
    });
    expect(f.card("nobody")).toBeNull();
  });
});
