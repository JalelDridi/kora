import { describe, expect, it } from "vitest";
import type { Tile } from "@/engine/chkoun/types.ts";
import type { GovernorateRow, Pool } from "@/pipeline/types.ts";
import {
  birthText,
  buildLabels,
  format,
  frenchCountryName,
  localName,
  tileText,
} from "./labels";

const governorates: GovernorateRow[] = [
  {
    id: "manouba",
    nameLatin: "Manouba",
    nameArabic: "منوبة",
    nameFrench: "La Manouba",
    region: "grand_tunis",
  },
];

const club = (id: string, nameArabic: string | null, nameFrench: string) => ({
  id,
  wikidataId: `Q${id.length}`,
  nameLatin: `${id} Latin`,
  nameArabic,
  nameFrench,
  country: id === "abroad-fc" ? "FR" : "TN",
  confederation: id === "abroad-fc" ? ("UEFA" as const) : ("CAF" as const),
  leagueWikidataId: null,
  ligue1: id !== "abroad-fc",
});

const player = (id: string, clubId: string, active: boolean) =>
  ({
    id,
    clubId,
    birthCountry: id === "born-abroad" ? "DE" : "TN",
    pools: { active, legend: !active },
  }) as Pool["players"][number];

const pool = {
  players: [
    player("a", "est", true),
    player("born-abroad", "abroad-fc", true),
    player("old", "legend-club", false),
  ],
  clubs: [
    club("est", "الترجي", "Espérance de Tunis"),
    club("abroad-fc", null, "Abroad FC fr"),
    club("legend-club", "قديم", "Vieux club"),
  ],
} as unknown as Pool;

const strings = {
  positions: {
    goalkeeper: "G",
    defender: "D",
    midfielder: "M",
    forward: "F",
  },
  caps: {
    band0: "0",
    band1: "1-9",
    band2: "10-29",
    band3: "30-59",
    band4: "60+",
  },
  abroad: "Abroad: {country}",
  noClub: "No club",
};

const tile = (value: Tile["value"]): Tile => ({
  colour: "grey",
  arrow: null,
  value,
});

describe("labels", () => {
  it("club label: Arabic name on /ar, Latin on /tn, French then Latin on /fr", () => {
    const ar = buildLabels(pool, governorates, "ar-TN", {});
    const tn = buildLabels(pool, governorates, "ar-Latn-TN", {});
    const fr = buildLabels(pool, governorates, "fr", null);
    expect(ar.clubs.est).toBe("الترجي");
    expect(ar.clubs["abroad-fc"]).toBe("abroad-fc Latin");
    expect(tn.clubs.est).toBe("est Latin");
    expect(fr.clubs.est).toBe("Espérance de Tunis");
    expect(
      localName({ nameLatin: "L", nameArabic: null, nameFrench: null }, "fr"),
    ).toBe("L");
  });

  it("lists only the clubs of active footballers", () => {
    const fr = buildLabels(pool, governorates, "fr", null);
    expect(Object.keys(fr.clubs).sort()).toEqual(["abroad-fc", "est"]);
  });

  it("French country names come from Intl.DisplayNames", () => {
    const fr = buildLabels(pool, governorates, "fr", null);
    expect(fr.countries.DE).toBe(frenchCountryName("DE"));
    expect(fr.countries.DE).toBe("Allemagne");
    expect(fr.countries.FR).toBe("France");
  });

  it("Derja country names come from Jalel's file", () => {
    const ar = buildLabels(pool, governorates, "ar-TN", { DE: "ألمانيا" });
    expect(ar.countries.DE).toBe("ألمانيا");
  });

  it("governorates in the locale's script", () => {
    expect(buildLabels(pool, governorates, "fr", null).governorates).toEqual({
      manouba: "La Manouba",
    });
    expect(
      buildLabels(pool, governorates, "ar-TN", {}).governorates.manouba,
    ).toBe("منوبة");
  });

  it("tile text for every column, '?' and the 'no club' words when unknown", () => {
    const labels = buildLabels(pool, governorates, "fr", null);
    expect(tileText("club", tile("est"), labels, strings).text).toBe(
      "Espérance de Tunis",
    );
    expect(tileText("club", tile(null), labels, strings)).toEqual({
      text: "?",
      label: "No club",
    });
    expect(tileText("caps", tile(null), labels, strings)).toEqual({
      text: "?",
      label: null,
    });
    expect(tileText("country", tile("FR"), labels, strings).text).toBe(
      "France",
    );
    expect(tileText("position", tile("defender"), labels, strings).text).toBe(
      "D",
    );
    expect(tileText("age", tile(27), labels, strings).text).toBe("27");
    expect(tileText("caps", tile(4), labels, strings).text).toBe("60+");
    expect(
      tileText("governorate", tile("gov:manouba"), labels, strings).text,
    ).toBe("La Manouba");
    expect(
      tileText("governorate", tile("abroad:DE"), labels, strings).text,
    ).toBe("Abroad: Allemagne");
  });

  it("a code missing from the tables prints as itself, never as nothing", () => {
    const labels = { clubs: {}, governorates: {}, countries: {} };
    expect(birthText("abroad:XK", labels, strings)).toBe("Abroad: XK");
    expect(tileText("club", tile("gone"), labels, strings).text).toBe("gone");
  });

  it("formats {placeholders} and leaves unknown ones alone", () => {
    expect(format("Guess {n} of 8", { n: 3 })).toBe("Guess 3 of 8");
    expect(format("{a} {b}", { a: "x" })).toBe("x {b}");
  });
});
