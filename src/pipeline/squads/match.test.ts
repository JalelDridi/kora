import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { WdPlayer } from "../types.ts";
import { parseSquadList } from "../wiki/squads.ts";
import type { SquadList } from "../wiki/squads.ts";
import { knownTitleIds, linkTargets, matchRows } from "./match.ts";

const fixtures = path.join(
  import.meta.dirname,
  "..",
  "wiki",
  "__fixtures__",
  "squads",
);
const list = (
  file: string,
  lang: "en" | "fr",
  page: string,
  kind: "club" | "national" = "club",
): SquadList =>
  parseSquadList({
    lang,
    page,
    kind,
    wikitext: readFileSync(path.join(fixtures, `${file}.wikitext`), "utf8"),
    today: "2026-10-04",
  });

function player(
  qid: string,
  name: string,
  over: Partial<WdPlayer> = {},
): WdPlayer {
  return {
    qid,
    nameEn: name,
    nameFr: name,
    nameAr: null,
    aliases: [],
    male: true,
    birthDate: null,
    positions: [],
    birthPlaceQid: null,
    birthPlaceName: null,
    birthCountry: null,
    governorates: [],
    imageFile: null,
    titles: { en: name, fr: name, ar: null },
    ...over,
  };
}

const clubAfricainEn = () =>
  list("en/club-africain-squad", "en", "Club Africain");
const clubAfricainFr = () =>
  list("fr/club-africain-effectif", "fr", "Club africain (football)");
const esperance = () =>
  list("en/esperance-squad", "en", "Espérance Sportive de Tunis");

describe("linkTargets", () => {
  it("asks only Tunisian linked targets that are not a known footballer title", () => {
    const targets = linkTargets(
      [clubAfricainEn(), clubAfricainFr(), esperance()],
      {
        en: new Set(["Mouhib Chamakh"]),
        fr: new Set(["Yassine Meriah"]),
      },
    );
    // Known: not asked. Foreign (Phillippe Kinzumbi, COD): never asked.
    expect(targets.en).toContain("Bassem Srarfi");
    expect(targets.en).not.toContain("Mouhib Chamakh");
    expect(targets.en).not.toContain("Phillippe Kinzumbi");
    // The undated Espérance list gives no vote: its links are not asked.
    expect(targets.en).not.toContain("Mohamed Ben Ali");
    expect(targets.fr).toContain("Bassem Srarfi");
    expect(targets.fr).not.toContain("Yassine Meriah");
    expect(targets.fr).not.toContain("Malek Saada"); // nolink=oui
    expect(targets.fr).not.toContain("Ismaïla Simpara"); // Mali
  });
});

describe("matchRows", () => {
  it("matches by Wikidata id through a redirect", () => {
    const srarfi = player("Q11", "Bassem Srarfi", {
      titles: { en: "Bassem Srarfi (footballer)", fr: null, ar: null },
    });
    const ids = knownTitleIds([srarfi]);
    // The pageprops lookup: the list's link redirects to his article.
    ids.set("en:Bassem Srarfi", "Q11");
    const { sightings } = matchRows([clubAfricainEn()], [srarfi], ids);
    expect(sightings).toEqual([
      expect.objectContaining({
        qid: "Q11",
        by: "link",
        part: "squad",
        asOf: "2026-09-27",
      }),
    ]);
  });

  it("matches a French row by name and birth date", () => {
    // His French title is not the list's "prénom nom" and no lookup found it.
    const meriah = player("Q12", "Yassine Meriah", {
      birthDate: "1993-07-02",
      titles: { en: null, fr: "Yassine Meriah (footballeur)", ar: null },
    });
    const { sightings } = matchRows(
      [clubAfricainFr()],
      [meriah],
      knownTitleIds([meriah]),
    );
    expect(sightings).toEqual([
      expect.objectContaining({
        qid: "Q12",
        by: "name-birth",
        asOf: "2026-07-01",
      }),
    ]);
  });

  it("never matches by name alone", () => {
    // The English plain-text rows: Club Africain's "Houssem Romdhane" and a
    // hand-made "Mohamed Ben Ali" without a link or a birth date.
    const romdhane = player("Q13", "Houssem Romdhane", {
      titles: { en: "Houssem Hassen Romdhane", fr: null, ar: null },
      birthDate: "2000-02-21",
    });
    const benAli = player("Q14", "Mohamed Ben Ali");
    const handMade: SquadList = {
      lang: "en",
      page: "CS Hammam-Lif",
      kind: "club",
      date: "2026-09-27",
      season: null,
      status: "current",
      rows: [
        { name: "Mohamed Ben Ali", link: null, part: "squad", nat: "TUN" },
      ],
    };
    const { sightings, unmatched } = matchRows(
      [clubAfricainEn(), handMade],
      [romdhane, benAli],
      knownTitleIds([romdhane, benAli]),
    );
    expect(sightings).toEqual([]);
    expect(unmatched.get("en:CS Hammam-Lif")).toEqual({ linked: 0, plain: 1 });
    // A French row with the same name but another birth date: no match either.
    const frRomdhane = player("Q13", "Houssem Hassen Romdhane", {
      birthDate: "2000-02-21",
      titles: { en: null, fr: null, ar: null },
    });
    expect(
      matchRows([clubAfricainFr()], [frRomdhane], new Map()).sightings,
    ).toEqual([]);
  });

  it("a link and a name plus birth date naming two footballers give no match and a note", () => {
    const chamakh = player("Q15", "Mouhib Chamakh", {
      birthDate: "1990-01-01",
    });
    const twin = player("Q16", "Mouhib Chamakh (born 2001)", {
      aliases: ["Mouhib Chamakh"],
      birthDate: "2001-08-25",
      titles: { en: null, fr: null, ar: null },
    });
    const ids = new Map([["fr:Mouhib Chamakh", "Q15"]]);
    const { sightings, notes } = matchRows(
      [clubAfricainFr()],
      [chamakh, twin],
      ids,
    );
    expect(sightings.filter((s) => s.qid === "Q15" || s.qid === "Q16")).toEqual(
      [],
    );
    expect(notes).toEqual([
      "fr:Club africain (football): Mouhib Chamakh links to Q15 but the name and birth date are Q16's; no match",
    ]);
  });

  it("counts unmatched linked and plain rows per list", () => {
    const { unmatched } = matchRows([clubAfricainEn()], [], new Map());
    // 20 Tunisians: 7 linked (Chamakh, Bouguerra, Srarfi, Chikhaoui, Aït Malek, Zaddem, Harzi).
    expect(unmatched.get("en:Club Africain")).toEqual({ linked: 7, plain: 13 });
  });

  it("keeps a national row's caps, goals and club link", () => {
    const national = list(
      "en/tunisia-current-squad",
      "en",
      "Tunisia national football team",
      "national",
    );
    const dahmen = player("Q17", "Aymen Dahmen");
    const kadida = player("Q18", "Sadok Kadida", {
      birthDate: "2003-12-02",
      titles: { en: null, fr: null, ar: null },
    });
    const { sightings } = matchRows(
      [national],
      [dahmen, kadida],
      knownTitleIds([dahmen, kadida]),
    );
    expect(sightings).toEqual([
      expect.objectContaining({
        qid: "Q17",
        caps: 41,
        goals: 0,
        clubLink: "CS Sfaxien",
        asOf: "2026-09-28",
        by: "link",
      }),
      expect.objectContaining({ qid: "Q18", caps: 1, by: "name-birth" }),
    ]);
  });
});
