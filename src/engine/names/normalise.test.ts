import { describe, expect, it } from "vitest";
import { normalise } from "./normalise.ts";

// Invisible characters, written by code point so the test reads.
const [ZWSP, LRM, RLM, RLE, PDF, BOM] = [
  0x200b, 0x200e, 0x200f, 0x202b, 0x202c, 0xfeff,
].map((c) => String.fromCharCode(c));

describe("normalise", () => {
  it("strips invisible marks U+200B to U+200F, U+202A to U+202E and U+FEFF", () => {
    expect(normalise(`${LRM}علي${RLM} ${RLE}معلول${PDF}${BOM}`)).toEqual([
      "علي",
      "معلول",
    ]);
    expect(normalise(`Ali${ZWSP} Maâloul`)).toEqual(["ali", "maaloul"]);
  });

  it("strips tashkeel and tatweel", () => {
    expect(normalise("مُحَمَّد إِلْيَاس")).toEqual(["محمد", "الياس"]);
    expect(normalise("مـحـمـد")).toEqual(["محمد"]);
  });

  it("folds the hamza forms, alef maqsura and ta marbuta", () => {
    expect(normalise("أ إ آ ٱ")).toEqual(["ا", "ا", "ا", "ا"]);
    expect(normalise("يحيى")).toEqual(["يحيي"]);
    expect(normalise("حمزة")).toEqual(["حمزه"]);
    expect(normalise("رؤوف")).toEqual(["رووف"]);
    expect(normalise("ئ")).toEqual(["ي"]);
  });

  it("folds the Maghrebi and Persian letters", () => {
    expect(normalise("ڨ گ ی ک چ ڤ پ")).toEqual([
      "ق",
      "ق",
      "ي",
      "ك",
      "ج",
      "ف",
      "ب",
    ]);
  });

  it("lower-cases Latin and drops accents", () => {
    expect(normalise("Maâloul Belaïd Sofiène JEMÂA")).toEqual([
      "maaloul",
      "belaid",
      "sofiene",
      "jemaa",
    ]);
  });

  it("splits on spaces, hyphens, apostrophes and dots", () => {
    expect(normalise("Ben-Hatira Al'Msakni M. Ifa")).toEqual([
      "ben",
      "hatira",
      "msakni",
      "m",
      "ifa",
    ]);
  });

  it("drops el, al, es and en tokens", () => {
    expect(normalise("Youssef al-Msakni El Ayari es Sassi en Ben")).toEqual([
      "youssef",
      "msakni",
      "ayari",
      "sassi",
      "ben",
    ]);
  });
});
