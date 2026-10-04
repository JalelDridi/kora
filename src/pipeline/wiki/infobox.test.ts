import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseEnInfobox } from "./infobox-en.ts";
import {
  isSeniorTunisie,
  parseFrInfobox,
  parseRows,
  readRows,
} from "./infobox-fr.ts";

const dir = "src/pipeline/wiki/__fixtures__";
/** A recorded infobox (Task 1), by "en/<slug>" or "fr/<slug>". */
const recorded = (key: string) =>
  readFileSync(`${dir}/${key}.wikitext`, "utf8");
const enBox = (slug: string, title = slug) =>
  parseEnInfobox(title, recorded(`en/${slug}`));
const frBox = (slug: string, title = slug) =>
  parseFrInfobox(title, recorded(`fr/${slug}`));
/** Hand-made English infobox, for shapes the recorded eight lack. */
const en = (fields: string) => `{{Infobox football biography\n${fields}\n}}`;
/** Hand-made French infobox. */
const fr = (fields: string) => `{{Infobox Footballeur\n${fields}\n}}`;

describe("parseEnInfobox", () => {
  it("reads every field of en/ali-maaloul", () => {
    expect(enBox("ali-maaloul", "Ali Maâloul")).toEqual({
      lang: "en",
      title: "Ali Maâloul",
      currentClub: "CS Sfaxien",
      currentClubIsStaff: false,
      positionText: "Left-back",
      spells: [
        {
          clubTitle: "CS Sfaxien",
          from: 2009,
          to: 2016,
          apps: 157,
          goals: 31,
          loan: false,
        },
        {
          clubTitle: "Al Ahly SC",
          from: 2016,
          to: 2025,
          apps: 163,
          goals: 35,
          loan: false,
        },
        {
          clubTitle: "CS Sfaxien",
          from: 2025,
          to: null,
          apps: 25,
          goals: 2,
          loan: false,
        },
      ],
      caps: 89,
      goals: 3,
      nationalOpen: true,
      clubsAsOf: "2026-09-04",
      capsAsOf: "2024-04-01",
      skipped: [],
      birthDate: "1990-01-01",
    });
  });

  // Trap: youth rows link to the senior article with labels "Tunisia U17/U20/U23"
  // (en/youssef-msakni lines 20–35).
  it("counts only the row labelled exactly Tunisia", () => {
    expect(enBox("youssef-msakni")).toMatchObject({ caps: 104, goals: 23 });
  });

  // Trap: the current club is a staff role at the national team (en/wahbi-khazri line 10).
  it("treats a staff role as no current club", () => {
    expect(enBox("wahbi-khazri")).toMatchObject({
      currentClub: null,
      currentClubIsStaff: true,
    });
  });

  // Trap: several parameters on one line (en/yassine-meriah lines 12–19).
  it("reads parameters written on one line", () => {
    const box = enBox("yassine-meriah");
    expect(box?.spells).toHaveLength(8);
    expect(box?.spells[3]).toEqual({
      clubTitle: "Kasımpaşa S.K.",
      from: 2020,
      to: 2020,
      apps: 15,
      goals: 0,
      loan: true,
    });
  });

  // Trap: two pairs of update fields, and times before the date
  // (en/ellyes-skhiri lines 44–45, en/ferjani-sassi lines 46–47).
  it("reads pcupdate/ntupdate and club-update/nationalteam-update", () => {
    expect(enBox("ellyes-skhiri")).toMatchObject({
      clubsAsOf: "2026-09-19",
      capsAsOf: "2026-09-17",
    });
    expect(enBox("ferjani-sassi")).toMatchObject({
      clubsAsOf: "2025-11-21",
      capsAsOf: "2026-01-03",
    });
  });

  // Hand-made: the recorded eight only have a blank current club (en/firas-chaouat line 7).
  it("treats a blank, retired or free-agent current club as none", () => {
    for (const value of ["", "Retired", "Free agent"]) {
      const box = parseEnInfobox("X", en(`| currentclub = ${value}`));
      expect(box?.currentClub).toBeNull();
      expect(box?.currentClubIsStaff).toBe(false);
    }
  });

  // Hand-made.
  it("returns null without the infobox, and null caps without a Tunisia row", () => {
    expect(parseEnInfobox("X", "No infobox here.")).toBeNull();
    expect(parseEnInfobox("X", en("| name = X"))?.caps).toBeNull();
  });
});

describe("parseFrInfobox", () => {
  it("reads every field of fr/yassine-meriah", () => {
    expect(frBox("yassine-meriah", "Yassine Meriah")).toEqual({
      lang: "fr",
      title: "Yassine Meriah",
      currentClub: null,
      currentClubIsStaff: false,
      positionText: "Défenseur central",
      spells: [
        {
          clubTitle: "Association sportive de l'Ariana (football)",
          from: null,
          to: 2013,
          apps: null,
          goals: null,
          loan: false,
        },
        {
          clubTitle: "Étoile sportive de Métlaoui",
          from: 2013,
          to: 2015,
          apps: 27,
          goals: 0,
          loan: false,
        },
        {
          clubTitle: "Club sportif sfaxien (football)",
          from: 2015,
          to: 2018,
          apps: 93,
          goals: 6,
          loan: false,
        },
        {
          clubTitle: "Olympiakós (football)",
          from: 2018,
          to: 2021,
          apps: 44,
          goals: 1,
          loan: false,
        },
        {
          clubTitle: "Kasımpaşa SK",
          from: 2020,
          to: 2020,
          apps: 15,
          goals: 0,
          loan: true,
        },
        {
          clubTitle: "Çaykur Rizespor",
          from: 2020,
          to: 2021,
          apps: 28,
          goals: 1,
          loan: true,
        },
        {
          clubTitle: "Al-Aïn Football Club",
          from: 2021,
          to: 2022,
          apps: 11,
          goals: 1,
          loan: false,
        },
        {
          clubTitle: "Espérance sportive de Tunis (football)",
          from: 2022,
          to: 2026,
          apps: 120,
          goals: 17,
          loan: false,
        },
        {
          clubTitle: "Club africain (football)",
          from: 2026,
          to: 2026,
          apps: 2,
          goals: 0,
          loan: false,
        },
      ],
      caps: 93,
      goals: 5,
      nationalOpen: false,
      clubsAsOf: "2026-09-27",
      capsAsOf: "2026-09-27",
      skipped: [],
      birthDate: "1993-07-02",
    });
  });

  // Trap: the senior career is "parcours pro" in 3 of 8 (fr/ali-maaloul line 18,
  // fr/firas-chaouat line 21, inside {{parcours pro}} rather than {{trois colonnes}}).
  it("reads the career from parcours pro as well as parcours senior", () => {
    expect(frBox("ali-maaloul")?.spells).toHaveLength(3);
    expect(frBox("firas-chaouat")?.spells).toHaveLength(7);
    expect(frBox("ellyes-skhiri")?.spells).toHaveLength(4);
  });

  // Trap: years are links, so the first link of a row is a year (fr/ellyes-skhiri line 22).
  it("takes the club from the team cell, not the year links", () => {
    expect(frBox("ellyes-skhiri")?.spells[0]).toEqual({
      clubTitle: "Montpellier Hérault Sport Club",
      from: 2014,
      to: 2019,
      apps: 133,
      goals: 10,
      loan: false,
    });
  });

  // Trap: a row with an unknown start and unknown stats (fr/yassine-meriah line 19).
  it("reads ?-2013 as an unknown start", () => {
    expect(frBox("yassine-meriah")?.spells[0]).toMatchObject({
      from: null,
      to: 2013,
      apps: null,
      goals: null,
    });
  });

  // Trap: open spells, club and national (fr/ali-maaloul lines 21 and 25).
  it("reads an open spell as no end year", () => {
    const box = frBox("ali-maaloul");
    expect(box?.spells[2]).toEqual({
      clubTitle: "Club sportif sfaxien (football)",
      from: 2025,
      to: null,
      apps: 27,
      goals: 3,
      loan: false,
    });
    expect(box?.nationalOpen).toBe(true);
  });

  // Trap: loans are {{prêt}} or {{Prêt}} before the flag (fr/firas-chaouat line 23,
  // fr/wahbi-khazri line 26, fr/youssef-msakni lines 22–23).
  it("marks {{prêt}} and {{Prêt}} rows as loans", () => {
    const loans = (slug: string) => frBox(slug)?.spells.map((s) => s.loan);
    expect(loans("firas-chaouat")).toEqual([
      false,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(loans("wahbi-khazri")).toEqual([
      false,
      false,
      false,
      true,
      false,
      false,
    ]);
    expect(loans("youssef-msakni")).toEqual([
      false,
      false,
      true,
      true,
      false,
      false,
    ]);
  });

  // Trap: flag templates before the link, also inside {{nobr}} (fr/wahbi-khazri line 24;
  // club actuel, fr/ellyes-skhiri line 6).
  it("reads clubs through flag templates and {{nobr}}", () => {
    expect(frBox("wahbi-khazri")?.spells[1].clubTitle).toBe(
      "Football Club des Girondins de Bordeaux",
    );
    expect(frBox("ellyes-skhiri")?.currentClub).toBe("1. FC Cologne");
  });

  // Trap: the senior team is {{TUN football}} in 7 of 8 (fr/ferjani-sassi line 34), and a
  // flag plus a link labelled "Tunisie" in fr/hannibal-mejbri line 33 (France youth rows above it).
  it("reads senior caps from {{TUN football}} and from a link labelled Tunisie", () => {
    expect(frBox("ferjani-sassi")).toMatchObject({
      caps: 104,
      goals: 9,
      nationalOpen: true,
    });
    expect(frBox("hannibal-mejbri")).toMatchObject({
      caps: 48,
      goals: 1,
      nationalOpen: true,
    });
  });

  // Trap: Tunisian youth rows, linked or not (fr/youssef-msakni lines 28–30, including
  // "Tunisie -23 ans" linked to the olympic team; fr/wahbi-khazri lines 32 and 34;
  // fr/ali-maaloul line 24, unlinked "Tunisie -21 ans").
  it("ignores every Tunisian youth row", () => {
    expect(frBox("youssef-msakni")).toMatchObject({
      caps: 104,
      goals: 23,
      nationalOpen: false,
    });
    expect(frBox("wahbi-khazri")).toMatchObject({ caps: 74, goals: 25 });
    expect(frBox("ali-maaloul")).toMatchObject({ caps: 91, goals: 3 });
  });

  // Trap: {{0}} and {{0|00}} padding, and no space before "(" (fr/ellyes-skhiri line 25,
  // fr/yassine-meriah line 26, fr/firas-chaouat line 28).
  it("reads padded appearances and goals", () => {
    expect(frBox("ellyes-skhiri")?.spells[3]).toMatchObject({
      from: 2026,
      to: null,
      apps: 5,
      goals: 0,
    });
    expect(frBox("yassine-meriah")?.spells[7]).toMatchObject({
      apps: 120,
      goals: 17,
    });
    expect(frBox("firas-chaouat")?.spells[6]).toMatchObject({
      apps: 0,
      goals: 0,
    });
  });

  // Trap: three update-date forms (fr/ali-maaloul line 27, fr/ellyes-skhiri line 31,
  // fr/wahbi-khazri line 38, fr/hannibal-mejbri line 35).
  it("reads date de mise à jour in every recorded form", () => {
    expect(frBox("ali-maaloul")).toMatchObject({
      clubsAsOf: "2026-07-25",
      capsAsOf: "2026-07-25",
    });
    expect(frBox("ellyes-skhiri")).toMatchObject({
      clubsAsOf: "2026-09-19",
      capsAsOf: "2026-09-19",
    });
    expect(frBox("wahbi-khazri")).toMatchObject({
      clubsAsOf: "2025-07-01",
      capsAsOf: "2025-07-01",
    });
    expect(frBox("hannibal-mejbri")).toMatchObject({
      clubsAsOf: "2026-09-06",
      capsAsOf: "2026-09-06",
    });
  });

  // Trap: the field is "position", not "poste" (fr/youssef-msakni line 14).
  it("reads the position field", () => {
    expect(frBox("youssef-msakni")?.positionText).toBe(
      "Ailier gauche, milieu offensif",
    );
  });

  // Trap: no club actuel field at all (fr/youssef-msakni), or an empty one (fr/wahbi-khazri line 6).
  it("reads a missing or empty club actuel as no club", () => {
    expect(frBox("youssef-msakni")).toMatchObject({
      currentClub: null,
      currentClubIsStaff: false,
    });
    expect(frBox("wahbi-khazri")).toMatchObject({
      currentClub: null,
      currentClubIsStaff: false,
    });
  });

  // Hand-made: no recorded French article names a staff role.
  it("treats an assistant coach as a staff role", () => {
    const box = parseFrInfobox(
      "X",
      "{{Infobox Footballeur\n| club actuel = [[Club africain]] (entraîneur adjoint)\n}}",
    );
    expect(box?.currentClub).toBeNull();
    expect(box?.currentClubIsStaff).toBe(true);
  });

  // Hand-made: all eight recorded articles use {{Infobox Footballeur}}.
  it("accepts the other template name", () => {
    expect(
      parseFrInfobox("X", "{{Infobox Football biographie\n| nom = X\n}}"),
    ).not.toBeNull();
  });

  // Hand-made: no recorded senior or national row has an unreadable years cell.
  it("skips a line whose first cell is not a years cell", () => {
    const rows = parseRows(
      "{{trois colonnes\n|janvier|[[A]]|1 (0)\n|[[2020 en football|2020]]-|[[B]]|2 (0)\n}}",
    );
    expect(rows).toEqual([
      {
        from: 2020,
        to: null,
        open: true,
        team: "[[B]]",
        apps: 2,
        goals: 0,
        loan: false,
      },
    ]);
  });

  // Hand-made: every recorded row is on its own line; a wrapper written on one line still reads.
  it("reads several rows written on one line, three cells each", () => {
    expect(
      parseRows(
        "{{trois colonnes|2009-2016|[[A]]|1 (0)|2016-|{{prêt}} [[B]]|2 (1)}}",
      ),
    ).toEqual([
      {
        from: 2009,
        to: 2016,
        open: false,
        team: "[[A]]",
        apps: 1,
        goals: 0,
        loan: false,
      },
      {
        from: 2016,
        to: null,
        open: true,
        team: "{{prêt}} [[B]]",
        apps: 2,
        goals: 1,
        loan: true,
      },
    ]);
  });
});

// Fix round 1: no row is dropped without saying so. The hand-made shapes below
// are ones the recorded eight lack.
describe("skipped rows", () => {
  it("reports a French two-digit end year as an unreadable years cell", () => {
    const box = parseFrInfobox(
      "X",
      fr(
        "| parcours pro = {{trois colonnes\n|[[2009 en football|2009]]-[[2010 en football|2010]]|[[A]]|1 (0)\n|[[2010 en football|2010]]-11|{{TUN-d}} [[B]]|2 (0)\n}}",
      ),
    );
    expect(box?.spells.map((s) => s.clubTitle)).toEqual(["A"]);
    expect(box?.skipped).toEqual([
      {
        field: "parcours pro",
        raw: "|[[2010 en football|2010]]-11|{{TUN-d}} [[B]]|2 (0)",
        reason: "years",
      },
    ]);
  });

  it("reports a French years cell with a note as unreadable", () => {
    const box = parseFrInfobox(
      "X",
      fr(
        "| sélection nationale = {{trois colonnes\n|[[2019 en football|2019]] (janv.)|{{TUN football}}|3 (1)\n}}",
      ),
    );
    expect(box?.caps).toBeNull();
    expect(box?.skipped).toEqual([
      {
        field: "sélection nationale",
        raw: "|[[2019 en football|2019]] (janv.)|{{TUN football}}|3 (1)",
        reason: "years",
      },
    ]);
  });

  it("reports a French row whose team cell names no club", () => {
    const box = parseFrInfobox(
      "X",
      fr(
        "| parcours senior = {{trois colonnes\n|[[2015 en football|2015]]-[[2016 en football|2016]]|{{TUN-d}}|4 (0)\n}}\n| sélection nationale = {{trois colonnes\n|[[2016 en football|2016]]-||5 (1)\n}}",
      ),
    );
    expect(box?.spells).toEqual([]);
    expect(box?.skipped).toEqual([
      {
        field: "parcours senior",
        raw: "|[[2015 en football|2015]]-[[2016 en football|2016]]|{{TUN-d}}|4 (0)",
        reason: "no-club",
      },
      {
        field: "sélection nationale",
        raw: "|[[2016 en football|2016]]-||5 (1)",
        reason: "no-club",
      },
    ]);
  });

  it("reports a French field without a wrapper template once, cut to 200 characters", () => {
    const long = `[[Équipe de Tunisie de football|Tunisie]] 2015-2020 (30 sél.) ${"x".repeat(300)}`;
    const box = parseFrInfobox("X", fr(`| sélection nationale = ${long}`));
    expect(box?.caps).toBeNull();
    expect(box?.skipped).toEqual([
      {
        field: "sélection nationale",
        raw: long.slice(0, 200),
        reason: "no-wrapper",
      },
    ]);
    expect(box?.skipped[0].raw).toHaveLength(200);
  });

  it("reports nothing for an absent or empty field", () => {
    expect(
      parseFrInfobox("X", fr("| parcours pro = \n| nom = X"))?.skipped,
    ).toEqual([]);
    expect(parseEnInfobox("X", en("| clubs1 = \n| name = X"))?.skipped).toEqual(
      [],
    );
  });

  it("gives the caller readRows' skips, and parseRows the rows alone", () => {
    const field =
      "{{trois colonnes\n|janvier|[[A]]|1 (0)\n|[[2020 en football|2020]]-|[[B]]|2 (0)\n}}";
    expect(readRows("parcours pro", field)).toEqual({
      rows: parseRows(field),
      skipped: [
        { field: "parcours pro", raw: "|janvier|[[A]]|1 (0)", reason: "years" },
      ],
    });
  });

  it("reports an English club row with no club name", () => {
    const box = parseEnInfobox(
      "X",
      en(
        "| years1 = 2010–2012\n| clubs1 = {{flagicon|TUN}}\n| caps1 = 4\n| years2 = 2012–\n| clubs2 = [[Club Africain]]",
      ),
    );
    expect(box?.spells.map((s) => s.clubTitle)).toEqual(["Club Africain"]);
    expect(box?.skipped).toEqual([
      { field: "clubs1", raw: "{{flagicon|TUN}}", reason: "no-club" },
    ]);
  });

  it("reports the first English club and national rows beyond the loop limits", () => {
    const box = parseEnInfobox(
      "X",
      en(
        "| clubs40 = [[A]]\n| clubs41 = [[B]]\n| clubs42 = [[C]]\n| nationalteam20 = [[Tunisia national football team|Tunisia]]\n| nationalcaps20 = 1\n| nationalteam21 = [[Tunisia national football team|Tunisia]]\n| nationalcaps21 = 2",
      ),
    );
    expect(box?.spells.map((s) => s.clubTitle)).toEqual(["A"]);
    expect(box?.caps).toBe(1);
    expect(box?.skipped).toEqual([
      { field: "clubs41", raw: "[[B]]", reason: "limit" },
      {
        field: "nationalteam21",
        raw: "[[Tunisia national football team|Tunisia]]",
        reason: "limit",
      },
    ]);
  });

  it("finds no skipped row in any of the 16 recorded articles", () => {
    const skipped: Record<string, unknown> = {};
    for (const lang of ["en", "fr"] as const) {
      for (const file of readdirSync(`${dir}/${lang}`)) {
        const text = readFileSync(`${dir}/${lang}/${file}`, "utf8");
        const box =
          lang === "en"
            ? parseEnInfobox(file, text)
            : parseFrInfobox(file, text);
        skipped[`${lang}/${file}`] = box?.skipped;
      }
    }
    expect(Object.keys(skipped)).toHaveLength(16);
    expect(skipped).toEqual(
      Object.fromEntries(Object.keys(skipped).map((key) => [key, []])),
    );
  });
});

// Step 6.0 (addendum §3): a second and third vote for the birth date.
// expected.json has no birth dates, so the truth is the recorded line cited.
describe("birth dates", () => {
  it("reads birth dates in both languages", () =>
    expect([
      enBox("yassine-meriah")?.birthDate,
      enBox("youssef-msakni")?.birthDate,
      frBox("hannibal-mejbri")?.birthDate,
      frBox("ellyes-skhiri")?.birthDate,
    ]).toEqual(["1993-07-02", "1990-10-28", "2003-01-21", "1995-05-10"]));

  const recordedBirths: [key: string, line: number, iso: string][] = [
    // {{Birth date and age|1990|01|01|df=y}}: zero-padded, capitalised.
    ["en/ali-maaloul", 6, "1990-01-01"],
    // {{Birth date and age|1995|5|10|df=y}}<ref name="DFL"/>
    ["en/ellyes-skhiri", 6, "1995-05-10"],
    ["en/ferjani-sassi", 6, "1992-03-18"],
    ["en/firas-chaouat", 4, "1996-05-08"],
    ["en/hannibal-mejbri", 6, "2003-01-21"],
    // {{Birth date and age|1991|2|8|df=y}}<ref>{{cite web |url=…}}</ref>
    ["en/wahbi-khazri", 6, "1991-02-08"],
    ["en/yassine-meriah", 6, "1993-07-02"],
    // {{birth date and age|1990|10|28|df=yes}}
    ["en/youssef-msakni", 6, "1990-10-28"],
    // {{date de naissance|1|1|1990|âge=oui}}
    ["fr/ali-maaloul", 9, "1990-01-01"],
    // {{Date de naissance|10|5|1995|âge=oui}}: capitalised.
    ["fr/ellyes-skhiri", 10, "1995-05-10"],
    ["fr/ferjani-sassi", 10, "1992-03-18"],
    ["fr/firas-chaouat", 9, "1996-05-08"],
    // Plain text, no template: "21 janvier 2003".
    ["fr/hannibal-mejbri", 11, "2003-01-21"],
    ["fr/wahbi-khazri", 9, "1991-02-08"],
    ["fr/yassine-meriah", 10, "1993-07-02"],
    ["fr/youssef-msakni", 8, "1990-10-28"],
  ];
  it.each(recordedBirths)("reads %s line %i as %s", (key, line, iso) => {
    const [lang, slug] = key.split("/");
    const text = recorded(key).split("\n")[line - 1];
    expect(text).toMatch(/birth_date|date de naissance/);
    const box = lang === "en" ? enBox(slug) : frBox(slug);
    expect(box?.birthDate).toBe(iso);
  });

  // Hand-made: every recorded article has a readable birth date.
  it("gives null for a missing or unreadable birth date", () => {
    expect(parseEnInfobox("X", en("| name = X"))?.birthDate).toBeNull();
    expect(
      parseEnInfobox("X", en("| birth_date = 1990s"))?.birthDate,
    ).toBeNull();
    expect(
      parseEnInfobox("X", en("| birth_date = {{birth date|1990|13|2}}"))
        ?.birthDate,
    ).toBeNull();
    expect(parseFrInfobox("X", fr("| nom = X"))?.birthDate).toBeNull();
    expect(
      parseFrInfobox("X", fr("| date de naissance = {{date|?|?|1990}}"))
        ?.birthDate,
    ).toBeNull();
  });
});

describe("isSeniorTunisie", () => {
  it("counts the senior team, linked or bare, and not the olympic team", () => {
    expect(
      isSeniorTunisie("[[Équipe de Tunisie olympique de football|Tunisie]]"),
    ).toBe(false);
    expect(isSeniorTunisie("Tunisie")).toBe(true);
    expect(isSeniorTunisie("[[Équipe de Tunisie de football|Tunisie]]")).toBe(
      true,
    );
  });
});

// The truth here was read by eye from the recorded articles (Task 1 step 6).
describe("recorded infoboxes", () => {
  const expected = JSON.parse(
    readFileSync(`${dir}/expected.json`, "utf8"),
  ) as Record<
    string,
    {
      currentClub: string | null;
      currentClubIsStaff: boolean;
      caps: number | null;
      goals: number | null;
      capsAsOf: string | null;
      clubsAsOf: string | null;
      spells: number;
      firstSpell: { clubTitle: string; from: number | null; to: number | null };
    }
  >;

  for (const lang of ["en", "fr"] as const) {
    for (const file of readdirSync(`${dir}/${lang}`)) {
      const key = `${lang}/${file.replace(/\.wikitext$/, "")}`;
      it(`parses ${key}`, () => {
        const text = readFileSync(`${dir}/${lang}/${file}`, "utf8");
        const box =
          lang === "en" ? parseEnInfobox(key, text) : parseFrInfobox(key, text);
        const want = expected[key];
        expect(want, `expected.json has no entry for ${key}`).toBeDefined();
        expect(box).toMatchObject({
          currentClub: want.currentClub,
          currentClubIsStaff: want.currentClubIsStaff,
          caps: want.caps,
          goals: want.goals,
          capsAsOf: want.capsAsOf,
          clubsAsOf: want.clubsAsOf,
        });
        expect(box?.spells).toHaveLength(want.spells);
        expect(box?.spells[0]).toMatchObject(want.firstSpell);
      });
    }
  }
});
