import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { colourKey, compare, LINE_ORDER } from "./tiles.ts";
import type { CapsBand, TileFacts } from "./types.ts";

// Four footballers written by hand, modelled on data/pool.json.
const msakni: TileFacts = {
  id: "youssef-msakni",
  clubId: "esperance-sportive-de-tunis",
  clubCountry: "TN",
  confederation: "CAF",
  line: "forward",
  birthDate: "1990-10-28",
  capsBand: 4,
  governorate: "tunis",
  region: "grand_tunis",
  birthCountry: "TN",
  pastClubIds: ["al-duhail-sc", "k-a-s-eupen", "al-arabi-sc"],
};
const meriah: TileFacts = {
  id: "yassine-meriah",
  clubId: "club-africain",
  clubCountry: "TN",
  confederation: "CAF",
  line: "defender",
  birthDate: "1993-07-02",
  capsBand: 4,
  governorate: "ariana",
  region: "grand_tunis",
  birthCountry: "TN",
  pastClubIds: ["cs-sfaxien", "olympiacos-f-c", "esperance-sportive-de-tunis"],
};
const skhiri: TileFacts = {
  id: "ellyes-skhiri",
  clubId: "1-fc-koln",
  clubCountry: "DE",
  confederation: "UEFA",
  line: "midfielder",
  birthDate: "1995-05-10",
  capsBand: 4,
  governorate: null,
  region: null,
  birthCountry: "FR",
  pastClubIds: ["montpellier-herault-sport-club", "eintracht-frankfurt"],
};
const chaouat: TileFacts = {
  id: "firas-chaouat",
  clubId: "al-ahly-sc-benghazi",
  clubCountry: "LY",
  confederation: "CAF",
  line: "forward",
  birthDate: "1996-05-08",
  capsBand: 3,
  governorate: "sfax",
  region: "centre_east",
  birthCountry: "TN",
  pastClubIds: ["cs-sfaxien", "club-africain", "etoile-sportive-du-sahel"],
};

const day = "2026-10-19";

const band: fc.Arbitrary<CapsBand> = fc.constantFrom(0, 1, 2, 3, 4);

const facts: fc.Arbitrary<TileFacts> = fc
  .record({
    id: fc.string({ minLength: 1, maxLength: 8 }),
    clubId: fc.option(fc.constantFrom("a", "b", "c")),
    clubCountry: fc.option(fc.constantFrom("TN", "FR", "DE", "QA")),
    confederation: fc.option(fc.constantFrom("CAF", "UEFA", "AFC")),
    line: fc.constantFrom(...LINE_ORDER),
    birthDate: fc
      .integer({ min: 0, max: 9000 })
      .map((n) =>
        new Date(Date.UTC(1985, 0, 1) + n * 86_400_000)
          .toISOString()
          .slice(0, 10),
      ),
    capsBand: fc.option(band),
    governorate: fc.option(fc.constantFrom("tunis", "sfax", "ariana")),
    region: fc.option(fc.constantFrom("grand_tunis", "centre_east")),
    birthCountry: fc.option(fc.constantFrom("TN", "FR", "DE")),
    pastClubIds: fc.array(fc.constantFrom("a", "b", "c", "d")),
  })
  .map((f) => ({
    ...f,
    // Keep generated facts coherent: a governorate means born in Tunisia.
    birthCountry: f.governorate ? "TN" : f.birthCountry,
    region: f.governorate ? (f.region ?? "grand_tunis") : null,
  }));

const known = facts.filter(
  (f) =>
    f.clubId !== null &&
    f.clubCountry !== null &&
    f.capsBand !== null &&
    (f.governorate !== null ||
      (f.birthCountry !== null && f.birthCountry !== "TN")),
);

describe("compare", () => {
  it("a footballer compared with himself is all green and has no arrows", () => {
    fc.assert(
      fc.property(known, (f) => {
        const row = compare(f, f, day);
        for (const t of Object.values(row)) {
          expect(t.colour).toBe("green");
          expect(t.arrow).toBeNull();
        }
        expect(colourKey(row)).toBe("gggggg");
      }),
    );
  });

  it("club amber when the answer played for the guessed footballer's current club before", () => {
    // Meriah (the answer) played for Espérance, Msakni's club.
    expect(compare(msakni, meriah, day).club).toEqual({
      colour: "amber",
      arrow: null,
      value: "esperance-sportive-de-tunis",
    });
  });

  it("club grey otherwise", () => {
    expect(compare(meriah, msakni, day).club.colour).toBe("grey");
  });

  it('club "?" when the guess has no club', () => {
    const free = { ...msakni, clubId: null, clubCountry: null };
    expect(compare(free, meriah, day).club).toEqual({
      colour: "unknown",
      arrow: null,
      value: null,
    });
    expect(compare(free, meriah, day).country.colour).toBe("unknown");
  });

  it("country green for the same country, amber for the same confederation", () => {
    expect(compare(meriah, msakni, day).country.colour).toBe("green");
    expect(compare(chaouat, msakni, day).country).toEqual({
      colour: "amber",
      arrow: null,
      value: "LY",
    });
    expect(compare(skhiri, msakni, day).country.colour).toBe("grey");
  });

  it("position amber only for the neighbouring line", () => {
    const keeper = { ...meriah, line: "goalkeeper" as const };
    expect(compare(keeper, meriah, day).position.colour).toBe("amber");
    expect(compare(keeper, skhiri, day).position.colour).toBe("grey");
    expect(compare(chaouat, msakni, day).position).toEqual({
      colour: "green",
      arrow: null,
      value: "forward",
    });
  });

  it("age green when equal, amber within 2 with the arrow pointing to the answer, grey beyond", () => {
    // On 19 Oct 2026: Msakni 35, Meriah 33, Skhiri 31, Chaouat 30.
    expect(compare(meriah, msakni, day).age).toEqual({
      colour: "amber",
      arrow: "up",
      value: 33,
    });
    expect(compare(msakni, meriah, day).age).toEqual({
      colour: "amber",
      arrow: "down",
      value: 35,
    });
    expect(compare(chaouat, msakni, day).age).toEqual({
      colour: "grey",
      arrow: "up",
      value: 30,
    });
    const twin = { ...chaouat, id: "twin", birthDate: "1996-01-01" };
    expect(compare(twin, chaouat, day).age).toEqual({
      colour: "green",
      arrow: null,
      value: 30,
    });
  });

  it("age is computed on the puzzle day", () => {
    const born = { ...msakni, birthDate: "2000-10-20" };
    expect(compare(born, msakni, "2026-10-19").age.value).toBe(25);
    expect(compare(born, msakni, "2026-10-20").age.value).toBe(26);
  });

  it("caps compares bands: amber for the next band, arrow up when the answer is in a higher band", () => {
    expect(compare(chaouat, msakni, day).caps).toEqual({
      colour: "amber",
      arrow: "up",
      value: 3,
    });
    expect(compare(msakni, chaouat, day).caps).toEqual({
      colour: "amber",
      arrow: "down",
      value: 4,
    });
    const rookie = { ...chaouat, capsBand: 1 as const };
    expect(compare(rookie, msakni, day).caps).toEqual({
      colour: "grey",
      arrow: "up",
      value: 1,
    });
    const unknownCaps = { ...chaouat, capsBand: null };
    expect(compare(unknownCaps, msakni, day).caps).toEqual({
      colour: "unknown",
      arrow: null,
      value: null,
    });
  });

  it('governorate: same green, same region amber; both abroad same country green, different countries amber; one abroad grey; unknown "?"', () => {
    const tunisian = { ...meriah, governorate: "tunis" };
    expect(compare(msakni, tunisian, day).governorate).toEqual({
      colour: "green",
      arrow: null,
      value: "gov:tunis",
    });
    expect(compare(meriah, msakni, day).governorate.colour).toBe("amber");
    expect(compare(chaouat, msakni, day).governorate.colour).toBe("grey");

    const french = {
      ...chaouat,
      governorate: null,
      region: null,
      birthCountry: "FR",
    };
    const german = { ...french, birthCountry: "DE" };
    expect(compare(french, skhiri, day).governorate).toEqual({
      colour: "green",
      arrow: null,
      value: "abroad:FR",
    });
    expect(compare(german, skhiri, day).governorate).toEqual({
      colour: "amber",
      arrow: null,
      value: "abroad:DE",
    });
    expect(compare(skhiri, msakni, day).governorate.colour).toBe("grey");
    expect(compare(msakni, skhiri, day).governorate.colour).toBe("grey");

    const nowhere = {
      ...chaouat,
      governorate: null,
      region: null,
      birthCountry: "TN",
    };
    expect(compare(nowhere, msakni, day).governorate).toEqual({
      colour: "unknown",
      arrow: null,
      value: null,
    });
    const noCountry = { ...nowhere, birthCountry: null };
    expect(compare(noCountry, msakni, day).governorate.colour).toBe("unknown");
  });

  it("position and caps amber are symmetric", () => {
    fc.assert(
      fc.property(known, known, (a, b) => {
        expect(compare(a, b, day).position.colour).toBe(
          compare(b, a, day).position.colour,
        );
        expect(compare(a, b, day).caps.colour).toBe(
          compare(b, a, day).caps.colour,
        );
      }),
    );
  });
});

describe("colourKey", () => {
  it("writes g, a, x and u in tile order, club to governorate", () => {
    const nowhere = { ...chaouat, governorate: null, region: null };
    // club x, country a, position g, age x, caps a, governorate u
    expect(colourKey(compare(nowhere, msakni, day))).toBe("xagxau");
  });
});
