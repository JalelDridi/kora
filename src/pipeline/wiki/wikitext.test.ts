import { describe, expect, it } from "vitest";
import {
  cells,
  findTemplate,
  intOrNull,
  links,
  parseYears,
  plainText,
  splitParams,
} from "./wikitext.ts";

describe("findTemplate and splitParams", () => {
  const page = `Intro {{Use dmy dates}}
{{Infobox football biography
| name = Test <!-- a comment -->
| clubs1 = [[Club Africain|CA]]<ref>{{cite web|url=x}}</ref>
| caps1 = {{0}}86
| years1 = 2016–
| note = {{nowrap|a = b}}
}}
Body text.`;

  it("finds a template by name, with nested templates and links inside", () => {
    const body = findTemplate(page, /^infobox football biography$/i);
    expect(body).not.toBeNull();
    const params = splitParams(body!);
    expect(params.get("name")).toBe("Test");
    expect(params.get("clubs1")).toBe("[[Club Africain|CA]]");
    expect(params.get("note")).toBe("{{nowrap|a = b}}");
  });

  it("returns null when the template is absent", () => {
    expect(findTemplate(page, /^infobox footballeur$/i)).toBeNull();
  });

  it("numbers positional parameters", () => {
    expect([...splitParams("|a|b=c|d")]).toEqual([
      ["1", "a"],
      ["b", "c"],
      ["2", "d"],
    ]);
  });

  // A French career row, as recorded in fr/wahbi-khazri line 24.
  it("splits a row into top-level cells, ignoring text before the first pipe", () => {
    expect(
      cells(
        " |[[2014 en football|2014]]-[[2016 en football|2016]]|{{nobr|{{FRA-d}} [[Football Club des Girondins de Bordeaux|Girondins de Bordeaux]]}}|{{0}}64 (15)",
      ),
    ).toEqual([
      "[[2014 en football|2014]]-[[2016 en football|2016]]",
      "{{nobr|{{FRA-d}} [[Football Club des Girondins de Bordeaux|Girondins de Bordeaux]]}}",
      "{{0}}64 (15)",
    ]);
  });
});

describe("links, plainText, intOrNull", () => {
  it("reads link targets and labels, ignoring files and sections", () => {
    expect(
      links(
        "[[File:x.jpg|thumb]] [[Tunisia national football team#History|Tunisia]] [[burnley F.C.]]",
      ),
    ).toEqual([
      { title: "Tunisia national football team", label: "Tunisia" },
      { title: "Burnley F.C.", label: "burnley F.C." },
    ]);
  });

  it("flattens links, templates, padding and tags", () => {
    expect(plainText("{{fb|TUN}} [[A|B]] {{0}}86 ({{0}}4)<br />''x''")).toBe(
      "B 86 (4) x",
    );
  });

  // Trap: a flag nested inside {{nobr}} (fr/wahbi-khazri line 24) and {{0|00}} padding
  // (fr/ellyes-skhiri line 25).
  it("unwraps {{nobr}} around a nested flag, and drops {{0|00}}", () => {
    expect(
      plainText(
        "{{nobr|{{FRA-d}} [[Football Club des Girondins de Bordeaux|Girondins de Bordeaux]]}}",
      ),
    ).toBe("Girondins de Bordeaux");
    expect(plainText("{{0|00}}5 {{0}}(0)")).toBe("5 (0)");
  });

  it("reads a number through padding and returns null for none", () => {
    expect(intOrNull("{{0}}74")).toBe(74);
    expect(intOrNull("(?)")).toBeNull();
  });
});

describe("parseYears", () => {
  it("reads ranges, open spells, single years and two-digit ends", () => {
    expect(parseYears("2010–2016")).toEqual({
      from: 2010,
      to: 2016,
      open: false,
    });
    expect(parseYears("2016–")).toEqual({ from: 2016, to: null, open: true });
    expect(parseYears("{{nowrap|2019}}")).toEqual({
      from: 2019,
      to: 2019,
      open: false,
    });
    expect(parseYears("2010-11")).toEqual({
      from: 2010,
      to: 2011,
      open: false,
    });
    expect(parseYears("")).toEqual({ from: null, to: null, open: false });
  });
});
