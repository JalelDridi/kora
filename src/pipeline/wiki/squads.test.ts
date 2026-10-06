import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { currentSeason, parseSquadList, squadStatus } from "./squads.ts";

const dir = path.join(import.meta.dirname, "__fixtures__", "squads");
const fixture = (name: string) =>
  readFileSync(path.join(dir, `${name}.wikitext`), "utf8");
const TODAY = "2026-10-04";

const en = (name: string, page: string, today = TODAY) =>
  parseSquadList({
    lang: "en",
    page,
    kind: "club",
    wikitext: fixture(`en/${name}`),
    today,
  });
const fr = (name: string, page: string, today = TODAY) =>
  parseSquadList({
    lang: "fr",
    page,
    kind: "club",
    wikitext: fixture(`fr/${name}`),
    today,
  });
const nat = (today = TODAY) =>
  parseSquadList({
    lang: "en",
    page: "Tunisia national football team",
    kind: "national",
    wikitext: fixture("en/tunisia-current-squad"),
    today,
  });

describe("parseSquadList: English club lists", () => {
  it("reads an English current squad with its updated date", () => {
    const list = en("club-africain-squad", "Club Africain");
    expect(list).toMatchObject({
      lang: "en",
      page: "Club Africain",
      kind: "club",
      date: "2026-09-27",
      season: null,
      status: "current",
    });
    // 29 rows, 20 Tunisians (research §2), all in the squad itself.
    expect(list.rows).toHaveLength(20);
    expect(list.rows.every((r) => r.part === "squad")).toBe(true);
  });

  it('accepts "15 September, 2026"', () => {
    expect(en("us-monastir-squad", "US Monastir (football)")).toMatchObject({
      date: "2026-09-15",
      status: "current",
    });
  });

  it('reads an italic "As of" line as the list\'s date', () => {
    expect(en("cs-hammam-lif-squad", "CS Hammam-Lif")).toMatchObject({
      date: "2026-09-27",
      status: "current",
    });
  });

  it("marks a list stale by its own date, not the page edit", () => {
    // The page was edited on 14 August 2026; the list says 13 January 2025.
    expect(en("ca-bizertin-squad", "CA Bizertin")).toMatchObject({
      date: "2025-01-13",
      status: "stale",
    });
  });

  it("marks an undated list undated", () => {
    const list = en("esperance-squad", "Espérance Sportive de Tunis");
    expect(list.date).toBeNull();
    expect(list.status).toBe("undated");
  });

  it("keeps loan and under-contract rows apart and never as the squad", () => {
    const list = en("esperance-squad", "Espérance Sportive de Tunis");
    const part = (link: string) => list.rows.find((r) => r.link === link)?.part;
    expect(part("Mohamed Ben Ali")).toBe("squad");
    expect(part("Aziz Koudhai")).toBe("loan");
    expect(part("Koussay Smiri")).toBe("other");
    // The reserve team is not the squad either.
    expect(part("Wajdi Issaoui")).toBe("other");
    // Retired numbers end the lists: no row from them.
    expect(part("Hédi Berkhissa")).toBeUndefined();
    // Under contract, but Swedish: not kept.
    expect(part("Elyas Bouzaiene")).toBeUndefined();
  });

  it("reads lowercase {{fs player}}", () => {
    const list = en("cs-sfaxien-squad", "CS Sfaxien");
    expect(list.status).toBe("current");
    expect(list.rows.filter((r) => r.part === "squad").length).toBeGreaterThan(
      15,
    );
    expect(list.rows.find((r) => r.part === "loan")).toBeDefined();
  });

  it("reads {{Football squad player}}, the template {{Fs player}} redirects to, and never a retired-numbers list", () => {
    const list = parseSquadList({
      lang: "en",
      page: "Some Club",
      kind: "club",
      today: TODAY,
      wikitext: [
        "==Players==",
        "===Current squad===",
        "{{updated|1 October 2026}}",
        "{{Football squad start}}",
        "{{Football squad player|no=1|nat=TUN|pos=GK|name=[[Amenallah Memmiche]]}}",
        "{{fs player|no=2|nat=TUN|pos=DF|name=[[Mohamed Ben Ali]]}}",
        "{{Football squad end}}",
        "===Retired numbers===",
        "{{football squad start}}",
        "{{football squad player|no=5|pos=DF|nat=TUN|name=[[Hédi Berkhissa]]}}",
        "{{football squad end}}",
      ].join("\n"),
    });
    expect(list.status).toBe("current");
    expect(list.rows.map((r) => [r.link, r.number, r.part])).toEqual([
      ["Amenallah Memmiche", 1, "squad"],
      ["Mohamed Ben Ali", 2, "squad"],
    ]);
  });

  it("keeps a row's link target, label, nat, pos and number; plain-text names have no link", () => {
    const list = en("esperance-squad", "Espérance Sportive de Tunis");
    expect(list.rows.find((r) => r.link === "Hadj Mahmoud")).toEqual({
      name: "Mohamed Belhadj Mahmoud",
      link: "Hadj Mahmoud",
      part: "squad",
      nat: "TUN",
      pos: "MF",
      number: 20,
    });
    const plain = en("club-africain-squad", "Club Africain").rows.find(
      (r) => r.name === "Houssem Romdhane",
    );
    expect(plain).toEqual({
      name: "Houssem Romdhane",
      link: null,
      part: "squad",
      nat: "TUN",
      pos: "DF",
      number: 24,
    });
  });

  it("keeps the namesake link as written (JS El Omrane, Ben Amor)", () => {
    const list = en("js-el-omrane-squad", "JS El Omrane");
    expect(
      list.rows.find((r) => r.name === "Mohamed Amine Ben Amor"),
    ).toMatchObject({ link: "Mohamed Amine Ben Amor", part: "squad" });
  });

  it("gives status none to a page without a list", () => {
    expect(
      parseSquadList({
        lang: "en",
        page: "ES Hammam Sousse",
        kind: "club",
        wikitext: "{{Infobox football club}}\n== History ==\nText.",
        today: TODAY,
      }),
    ).toEqual({
      lang: "en",
      page: "ES Hammam Sousse",
      kind: "club",
      date: null,
      season: null,
      status: "none",
      rows: [],
    });
  });
});

describe("parseSquadList: French club lists", () => {
  it("reads a French list's season from its heading or {{Feff début|saison=}}", () => {
    expect(
      fr("club-africain-effectif", "Club africain (football)"),
    ).toMatchObject({
      season: "2026-2027",
      date: "2026-07-01",
      status: "current",
    });
    const sfax = fr("cs-sfaxien-effectif", "Club sportif sfaxien (football)");
    expect(sfax).toMatchObject({
      season: "2024-2025",
      date: "2024-07-01",
      status: "stale",
    });
    // The season from {{Feff début}} alone, when the heading has none.
    const noLabel = fixture("fr/club-africain-effectif").replace(
      "=== Effectif professionnel (2026-2027) ===",
      "=== Effectif actuel ===",
    );
    expect(
      parseSquadList({
        lang: "fr",
        page: "x",
        kind: "club",
        wikitext: noLabel,
        today: TODAY,
      }),
    ).toMatchObject({ season: "2026-2027", status: "current" });
  });

  it("builds a French link from prénom and nom unless nolink=oui; reads lien= when present [U]", () => {
    const rows = fr("club-africain-effectif", "Club africain (football)").rows;
    expect(rows.find((r) => r.name === "Yassine Meriah")?.link).toBe(
      "Yassine Meriah",
    );
    expect(rows.find((r) => r.name === "Malek Saada")?.link).toBeNull();
    expect(rows.find((r) => r.name === "Houssem Hassen Romdhane")?.link).toBe(
      "Houssem Hassen Romdhane",
    );
    // Hand-made: lien= and dab= (the recorded dab row also has nolink=oui).
    const made = parseSquadList({
      lang: "fr",
      page: "x",
      kind: "club",
      wikitext: `=== Effectif professionnel (2026-2027) ===
{{Feff joueur|num=1|pos=G|prénom=Ali|nom=Test|lien=Ali Test (football)|nat=Tunisie}}
{{Feff joueur|num=2|pos=D|prénom=Sami|nom=Exemple|dab=football, 1999|nat=Tunisie}}`,
      today: TODAY,
    });
    expect(made.rows.map((r) => r.link)).toEqual([
      "Ali Test (football)",
      "Sami Exemple (football, 1999)",
    ]);
  });

  it("reads a French row's birth date", () => {
    const rows = fr("club-africain-effectif", "Club africain (football)").rows;
    expect(rows.find((r) => r.name === "Yassine Meriah")).toMatchObject({
      birthDate: "1993-07-02",
      number: 5,
      pos: "D",
      part: "squad",
    });
    // jour/mois/an given after nat and contrat, with a leading zero.
    expect(rows.find((r) => r.name === "Ghassen Mahersi")?.birthDate).toBe(
      "2001-02-20",
    );
  });

  it("skips {{Feff staff}}", () => {
    const rows = fr("club-africain-effectif", "Club africain (football)").rows;
    expect(rows.some((r) => r.name.includes("Kanzari"))).toBe(false);
    expect(rows.some((r) => r.name.includes("Ksiksi"))).toBe(false);
  });

  it("keeps only Tunisian rows (nat=TUN, nat=Tunisie)", () => {
    const rows = fr("club-africain-effectif", "Club africain (football)").rows;
    expect(rows.every((r) => r.nat === "Tunisie")).toBe(true);
    expect(rows.some((r) => r.name === "Ismaïla Simpara")).toBe(false);
    expect(rows).toHaveLength(22); // research §2: 31 rows, 22 Tunisians
    const enRows = en("us-monastir-squad", "US Monastir (football)").rows;
    expect(enRows.every((r) => r.nat === "TUN")).toBe(true);
    expect(enRows.some((r) => r.name === "Ousmane Diané")).toBe(false);
  });
});

describe("parseSquadList: the national table", () => {
  it('reads the national table\'s caps, goals, club link and "correct as of" date', () => {
    const list = nat();
    expect(list).toMatchObject({
      kind: "national",
      date: "2026-09-28",
      status: "current",
    });
    expect(list.rows).toHaveLength(26);
    expect(list.rows.find((r) => r.link === "Aymen Dahmen")).toEqual({
      name: "Aymen Dahmen",
      link: "Aymen Dahmen",
      part: "squad",
      nat: "TUN",
      pos: "GK",
      number: 16,
      birthDate: "1997-01-28",
      caps: 41,
      goals: 0,
      clubLink: "CS Sfaxien",
    });
    // A plain-text name keeps its birth date, so it can still be matched.
    expect(list.rows.find((r) => r.name === "Sadok Kadida")).toMatchObject({
      link: null,
      birthDate: "2003-12-02",
      caps: 1,
    });
  });

  it("ignores Recent call-ups", () => {
    const list = nat();
    expect(list.rows.some((r) => r.link === "Noureddine Farhati")).toBe(false);
    expect(list.rows.some((r) => r.link === "Dylan Bronn")).toBe(false);
  });

  it("goes stale for its club column after 120 days", () => {
    expect(nat("2027-02-01").status).toBe("stale");
    expect(nat("2027-01-25").status).toBe("current");
  });
});

describe("squadStatus", () => {
  it("starts the season on 1 July", () => {
    expect(currentSeason("2026-06-30")).toBe("2025-2026");
    expect(currentSeason("2026-07-01")).toBe("2026-2027");
  });

  it("needs an English list dated in this season and within 120 days", () => {
    const at = (date: string, today: string) =>
      squadStatus({ lang: "en", kind: "club", date, season: null }, today);
    expect(at("2026-06-20", "2026-07-10")).toBe("stale"); // last season
    expect(at("2026-07-02", "2026-07-10")).toBe("current");
    expect(at("2026-07-02", "2026-10-30")).toBe("current"); // 120 days
    expect(at("2026-07-02", "2026-11-01")).toBe("stale"); // 122 days
  });
});
