import { describe, expect, it } from "vitest";
import { clubsQuery, PLAYERS_QUERY, sparqlRequest } from "./queries.ts";

describe("queries", () => {
  it("ask for article titles, not article URLs (the probe's bug)", () => {
    expect(PLAYERS_QUERY).toContain("schema:name ?enTitle");
    expect(PLAYERS_QUERY).toContain("schema:name ?frTitle");
  });

  // A9: Ali Youssef (Q71806775) and Rami Kaib (Q26710608) have "Sweden" as
  // their birthplace, a country, and came back with no birth country; Omar
  // Rekik (Q96678415), born in Helmond, too. The country of a place, or the
  // place itself when it is a country.
  it("read the birth country from the birthplace itself when it is a country (A9)", () => {
    expect(PLAYERS_QUERY).toContain("OPTIONAL { ?pob wdt:P297 ?selfIso }");
    expect(PLAYERS_QUERY).toContain(
      "OPTIONAL { ?pob wdt:P17/wdt:P297 ?countryIso }",
    );
    expect(PLAYERS_QUERY).toContain(
      "(SAMPLE(COALESCE(?selfIso, ?countryIso)) AS ?birthCountry)",
    );
    expect(PLAYERS_QUERY).not.toContain("?pobCountry");
  });

  it("look clubs up by id and by English and French title, escaping quotes", () => {
    const query = clubsQuery(["Q1", "Q2"], ['Club "A"'], ["Club B"]);
    expect(query).toContain("VALUES ?club { wd:Q1 wd:Q2 }");
    expect(query).toContain('"Club \\"A\\""@en');
    expect(query).toContain('"Club B"@fr');
  });

  it("leave out an empty part, so the ids and each language can be asked apart", () => {
    const byId = clubsQuery(["Q1"], [], []);
    expect(byId).toContain("VALUES ?club { wd:Q1 }");
    expect(byId).not.toContain("VALUES ?t");
    expect(byId).not.toContain("VALUES ?u");
    expect(byId).not.toContain("UNION");
    const byTitle = clubsQuery([], [], ["Club B"]);
    expect(byTitle).not.toContain("VALUES ?club");
    expect(byTitle).toContain('VALUES ?u { "Club B"@fr }');
    expect(byTitle).not.toContain("UNION");
  });

  it("are sent by POST as a form, asking for JSON", () => {
    const { url, init } = sparqlRequest("SELECT 1");
    expect(url).toBe("https://query.wikidata.org/sparql");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("accept")).toBe(
      "application/sparql-results+json",
    );
    expect(init.body).toBe("query=SELECT+1");
  });
});
