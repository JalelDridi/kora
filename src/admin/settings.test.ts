import { describe, expect, it } from "vitest";
import { clubShortFilter } from "./settings.ts";

describe("club-short's filter (?q=)", () => {
  const rows = [
    { id: "es-zarzis", latin: "ESZ", arabic: "جرجيس" },
    { id: "club-africain", latin: "CA", arabic: "الإفريقي" },
    { id: "unknown-club", latin: "UC", arabic: "مجهول" },
  ];
  const names: Record<string, string> = {
    "es-zarzis": "ES Zarzis",
    "club-africain": "Club Africain",
  };
  const ids = (q: string) =>
    rows.filter(clubShortFilter(q, (id) => names[id])).map((r) => r.id);

  it("matches the club's name, id, Latin or Arabic label, ignoring case", () => {
    expect(ids("zarzis")).toEqual(["es-zarzis"]);
    expect(ids("AFRICAIN")).toEqual(["club-africain"]);
    expect(ids("club-afr")).toEqual(["club-africain"]);
    expect(ids("esz")).toEqual(["es-zarzis"]);
    expect(ids("الإفريقي")).toEqual(["club-africain"]);
    expect(ids("unknown")).toEqual(["unknown-club"]);
    expect(ids("nowhere")).toEqual([]);
  });

  it("an empty or blank query keeps every row", () => {
    expect(ids("")).toHaveLength(3);
    expect(ids("  ")).toHaveLength(3);
  });

  it("the query is trimmed", () => {
    expect(ids("  Zarzis ")).toEqual(["es-zarzis"]);
  });
});
