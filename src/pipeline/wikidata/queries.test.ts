import { describe, expect, it } from "vitest";
import { clubsQuery, PLAYERS_QUERY, sparqlRequest } from "./queries.ts";

describe("queries", () => {
  it("ask for article titles, not article URLs (the probe's bug)", () => {
    expect(PLAYERS_QUERY).toContain("schema:name ?enTitle");
    expect(PLAYERS_QUERY).toContain("schema:name ?frTitle");
  });

  it("look clubs up by id and by English and French title, escaping quotes", () => {
    const query = clubsQuery(["Q1", "Q2"], ['Club "A"'], ["Club B"]);
    expect(query).toContain("VALUES ?club { wd:Q1 wd:Q2 }");
    expect(query).toContain('"Club \\"A\\""@en');
    expect(query).toContain('"Club B"@fr');
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
