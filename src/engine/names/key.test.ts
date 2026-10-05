import { describe, expect, it } from "vitest";
import { key } from "./key.ts";
import { normalise } from "./normalise.ts";

function keysOf(s: string): string[] {
  return normalise(s).flatMap(key);
}

describe("key", () => {
  it("mejbri and المجبري give the same key", () => {
    expect(key("mejbri")).toEqual(["MJBR"]);
    expect(key("المجبري")).toContain("MJBR");
  });

  it("9, g, k, q and ق all give K", () => {
    for (const k of ["9", "g", "k", "q"]) expect(key(`a${k}a`)).toEqual(["K"]);
    expect(key("ق")).toEqual(["K"]);
    expect(keysOf("ڨ")).toEqual(["K"]);
  });

  it("8 and gh give G", () => {
    expect(key("8andri")).toEqual(["GNDR"]);
    expect(key("ghandri")).toEqual(["GNDR"]);
    expect(keysOf("الغندري")).toContain("GNDR");
  });

  it("3 and 2 give nothing", () => {
    expect(key("ma3loul")).toEqual(key("maaloul"));
    expect(key("ra2ouf")).toEqual(["RF"]);
    expect(keysOf("معلول")).toEqual(key("maaloul"));
  });

  it("7 gives H", () => {
    expect(key("7amza")).toEqual(["HMZ"]);
    expect(key("hamza")).toEqual(["HMZ"]);
    expect(keysOf("حمزة")).toEqual(["HMZ"]);
  });

  it("the digraphs ch, kh, dh and th", () => {
    expect(key("chaouat")).toEqual(["CT"]);
    expect(keysOf("شواط")).toEqual(["CT"]);
    expect(key("khazri")).toEqual(["XZR"]);
    expect(keysOf("خزري")).toEqual(["XZR"]);
    expect(key("riadh")).toEqual(keysOf("رياض"));
    expect(key("mathlouthi")).toEqual(keysOf("مثلوثي"));
  });

  it("doubled letters collapse", () => {
    expect(key("chemmam")).toEqual(key("chamam"));
    expect(key("sellimi")).toEqual(["SLM"]);
  });

  it("a token starting with ال yields two keys", () => {
    expect(key("المساكني")).toEqual(["MSKN", "LMSKN"]);
    expect(key("msakni")).toEqual(["MSKN"]);
  });
});
