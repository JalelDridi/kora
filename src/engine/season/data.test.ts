import { describe, expect, it } from "vitest";
import { buildSeasonData, readCode, slotCode } from "./data.ts";
import type {
  Decade,
  SeasonSource,
  SourcePlayer,
  SourceSpell,
} from "./types.ts";

const spell = (
  clubId: string | null,
  from: number | null,
  to: number | null,
  apps: number | null = null,
  loan = false,
): SourceSpell => ({ clubId, from, to, apps, loan });

const sure = { confidence: "high" as const };
const player = (
  id: string,
  wikidataId: string,
  position: SourcePlayer["position"],
  history: SourceSpell[],
  extra: Partial<SourcePlayer> = {},
): SourcePlayer => ({
  id,
  wikidataId,
  nameLatin: id.toUpperCase(),
  nameArabic: null,
  nameFrench: null,
  position,
  caps: 40,
  goals: 8,
  history,
  provenance: { caps: sure, goals: sure, history: sure },
  ...extra,
});

// club-a and club-b in Ligue 1, club-x abroad; f1 to f7 each built for one rule.
const source: SeasonSource = {
  clubs: [
    {
      id: "club-b",
      ligue1: true,
      nameLatin: "Club B",
      nameArabic: "نادي ب",
      nameFrench: "Club B",
    },
    {
      id: "club-a",
      ligue1: true,
      nameLatin: "Club A",
      nameArabic: null,
      nameFrench: null,
    },
    {
      id: "club-x",
      ligue1: false,
      nameLatin: "Club X",
      nameArabic: null,
      nameFrench: null,
    },
  ],
  honours: [
    { competition: "tn_ligue1", seasonEnd: 2010, clubId: "club-a" },
    { competition: "tn_ligue1", seasonEnd: 2013, clubId: "club-a" },
    { competition: "caf_cl", seasonEnd: 2011, clubId: "club-a" },
    { competition: "tn_cup", seasonEnd: 2016, clubId: "club-a" }, // after both spells
    { competition: "tn_ligue1", seasonEnd: 2005, clubId: "club-a" }, // before both spells
    { competition: "tn_cup", seasonEnd: 2012, clubId: "club-b" }, // another club
  ],
  players: [
    player("f1", "Q1", "forward", [
      spell("club-a", 2008, 2011, 60),
      spell("club-a", 2012, 2014, 35),
    ]),
    player("f2", "Q2", "midfielder", [spell("club-a", 2010, 2012, 20, true)]),
    player("f3", "Q3", "midfielder", [spell("club-a", null, 2012, 20)]),
    player("f4", "Q4", "defender", [spell("club-x", 2010, 2014, 50)]),
    player("f5", "Q5", "defender", [spell("club-b", 2022, null)]),
    player("f6", "Q6", "goalkeeper", [spell("club-a", 2011, 2015, 80)], {
      caps: 12,
      goals: 0,
      provenance: { caps: { confidence: "low" }, goals: sure, history: sure },
    }),
    player("f7", "Q7", "midfielder", [spell("club-b", 2021, null, 30)], {
      provenance: { caps: sure, goals: sure, history: { confidence: "low" } },
    }),
  ],
};
const strength = { clubs: { "club-b": 60, "club-a": 70 } };
const data = buildSeasonData(
  source,
  { strength, afcon: { footballers: ["Q1"] } },
  2026,
);

const candidate = (id: string, club: string, decade: Decade) => {
  const found = [...data.index.values()]
    .flat()
    .find(
      (c) => c.footballerId === id && c.clubId === club && c.decade === decade,
    );
  if (!found) throw new Error(`no candidate ${id} ${club} ${decade}`);
  return found;
};

describe("buildSeasonData", () => {
  it("a candidate exists per non-loan spell at a Ligue 1 club overlapping a decade", () =>
    // f1 (Q1, forward) at club-a 2008–2011 (60 apps) and 2012–2014 (35 apps)
    expect(data.combos.get("f1")).toEqual([
      "club-a|2000|forward",
      "club-a|2010|forward",
    ]));
  it("loans, spells without a start and clubs outside Ligue 1 give nothing", () =>
    ["f2", "f3", "f4"].forEach((id) =>
      expect(data.combos.has(id)).toBe(false),
    )); // loan only; from null; foreign club
  it("an open spell runs to the current year", () =>
    expect(data.combos.get("f5")).toEqual(["club-b|2020|defender"]));
  it("apps are summed over the matching spells; null when none is known", () =>
    expect([
      candidate("f1", "club-a", 2010).inputs.apps,
      candidate("f5", "club-b", 2020).inputs.apps,
    ]).toEqual([95, null]));
  it("titles count the club's league, cup and CAF wins whose season ends inside a spell", () =>
    expect(candidate("f1", "club-a", 2010).inputs.titles).toEqual({
      league: 2,
      cup: 0,
      caf: 1,
    }));
  it("low caps not band-agreed are rated from the band midpoint; low history and AFCON 2004 are flagged", () => {
    expect(candidate("f6", "club-a", 2010).inputs).toMatchObject({
      caps: 20,
      capsFromBand: true,
    }); // D-S3-6
    expect(candidate("f7", "club-b", 2020).inputs.historyDoubt).toBe(true);
    expect(candidate("f1", "club-a", 2010).inputs.afcon2004).toBe(true); // files.afcon.footballers = ["Q1"]
  });
  it("a share code reads back to the same candidate", () => {
    for (const list of data.index.values())
      for (const c of list)
        expect(readCode(data, slotCode(data, c))).toEqual(c);
    expect(readCode(data, "f1_9")).toBeNull();
    expect(readCode(data, "nobody_0")).toBeNull();
    expect(readCode(data, "f1.0")).toBeNull(); // the old separator is refused
  });
  it("band-agreed caps keep the count; the clubs, people and table are sorted", () => {
    const agreed = buildSeasonData(
      {
        ...source,
        players: [
          player("f8", "Q8", "forward", [spell("club-a", 2011, 2012)], {
            caps: 12,
            provenance: { caps: { confidence: "low", bandAgreed: true } },
          }),
        ],
      },
      { strength, afcon: { footballers: [] } },
      2026,
    );
    expect([...agreed.index.values()].flat()[0].inputs).toMatchObject({
      caps: 12,
      capsFromBand: false,
      goalsDoubt: true,
      historyDoubt: true,
    });
    expect(data.clubIds).toEqual(["club-a", "club-b"]);
    expect(data.clubs.get("club-b")).toEqual({
      nameLatin: "Club B",
      nameArabic: "نادي ب",
      nameFrench: "Club B",
    });
    expect(data.table).toEqual([
      { clubId: "club-a", strength: 70 },
      { clubId: "club-b", strength: 60 },
    ]);
    expect([...data.people.keys()].sort()).toEqual(["f1", "f5", "f6", "f7"]);
    expect(data.people.get("f1")).toEqual({
      id: "f1",
      nameLatin: "F1",
      nameArabic: null,
      nameFrench: null,
      line: "forward",
    });
  });
});
