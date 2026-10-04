// The five Wikidata queries of a nightly run (research: sprint-1-data-probe.md
// §3, with the title fix). Q948 Tunisia, Q937857 association football player,
// Q690084 governorate of Tunisia, Q6979593 national association football team.

export const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

const BASE = `{ ?p wdt:P106 wd:Q937857 ; wdt:P27 wd:Q948 . }
  UNION { ?p wdt:P106 wd:Q937857 ; wdt:P1532 wd:Q948 . }`;

export const PLAYERS_QUERY = `SELECT ?p (SAMPLE(?en) AS ?enLabel) (SAMPLE(?fr) AS ?frLabel) (SAMPLE(?ar) AS ?arLabel)
  (SAMPLE(?sex) AS ?gender) (MIN(?dob) AS ?birth)
  (GROUP_CONCAT(DISTINCT CONCAT(STRAFTER(STR(?pos), "entity/"), "=", ?posLabel); separator="|") AS ?positions)
  (SAMPLE(?pob) AS ?birthPlace) (SAMPLE(?pobName) AS ?birthPlaceName) (SAMPLE(COALESCE(?selfIso, ?countryIso)) AS ?birthCountry)
  (GROUP_CONCAT(DISTINCT ?govLabel; separator="|") AS ?governorates)
  (SAMPLE(?img) AS ?image)
  (SAMPLE(?enTitle) AS ?enwiki) (SAMPLE(?frTitle) AS ?frwiki) (SAMPLE(?arTitle) AS ?arwiki)
WHERE {
  ${BASE}
  OPTIONAL { ?p rdfs:label ?en FILTER(LANG(?en) = "en") }
  OPTIONAL { ?p rdfs:label ?fr FILTER(LANG(?fr) = "fr") }
  OPTIONAL { ?p rdfs:label ?ar FILTER(LANG(?ar) = "ar") }
  OPTIONAL { ?p wdt:P21 ?sex }
  OPTIONAL { ?p wdt:P569 ?dob }
  OPTIONAL { ?p wdt:P413 ?pos . ?pos rdfs:label ?posLabel FILTER(LANG(?posLabel) = "en") }
  OPTIONAL { ?p wdt:P19 ?pob .
    OPTIONAL { ?pob rdfs:label ?pobName FILTER(LANG(?pobName) = "en") }
    # The birthplace may itself be a country ("Sweden"): its own code first.
    OPTIONAL { ?pob wdt:P297 ?selfIso }
    OPTIONAL { ?pob wdt:P17/wdt:P297 ?countryIso }
    OPTIONAL { ?pob wdt:P131* ?gov . ?gov wdt:P31 wd:Q690084 ; rdfs:label ?govLabel FILTER(LANG(?govLabel) = "en") } }
  OPTIONAL { ?p wdt:P18 ?img }
  OPTIONAL { ?enwiki schema:about ?p ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?enTitle }
  OPTIONAL { ?frwiki schema:about ?p ; schema:isPartOf <https://fr.wikipedia.org/> ; schema:name ?frTitle }
  OPTIONAL { ?arwiki schema:about ?p ; schema:isPartOf <https://ar.wikipedia.org/> ; schema:name ?arTitle }
}
GROUP BY ?p`;

export const ALIASES_QUERY = `SELECT ?p (GROUP_CONCAT(DISTINCT ?alt; separator="|") AS ?aliases) WHERE {
  ${BASE}
  ?p skos:altLabel ?alt FILTER(LANG(?alt) IN ("en", "fr", "ar"))
}
GROUP BY ?p`;

export const MEMBERSHIPS_QUERY = `SELECT ?p ?team ?start ?end ?apps ?goals ?isNational ?teamEn WHERE {
  ${BASE}
  ?p p:P54 ?st . ?st ps:P54 ?team .
  OPTIONAL { ?st pq:P580 ?start }
  OPTIONAL { ?st pq:P582 ?end }
  OPTIONAL { ?st pq:P1350 ?apps }
  OPTIONAL { ?st pq:P1351 ?goals }
  OPTIONAL { ?team wdt:P31/wdt:P279* wd:Q6979593 . BIND(1 AS ?isNational) }
  OPTIONAL { ?team rdfs:label ?teamEn FILTER(LANG(?teamEn) = "en") }
}`;

// An edition is a start year and an end year (P580, P582): the CAF Champions
// League had both a "2018" and a "2018–19" edition. The label is optional so
// that seasons without one are counted as dropped, not silently missing.
export const HONOURS_QUERY = `SELECT DISTINCT ?compName ?season ?seasonLabel ?start ?end ?winner WHERE {
  VALUES ?compName { "Tunisian Ligue Professionnelle 1"@en "Tunisian Cup"@en
                     "CAF Champions League"@en "CAF Confederation Cup"@en }
  ?comp rdfs:label ?compName .
  ?season wdt:P3450 ?comp ; wdt:P1346 ?winner .
  OPTIONAL { ?season rdfs:label ?seasonLabel FILTER(LANG(?seasonLabel) = "en") }
  OPTIONAL { ?season wdt:P580 ?start }
  OPTIONAL { ?season wdt:P582 ?end }
}`;

function literal(value: string, lang: "en" | "fr"): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"@${lang}`;
}

/** Clubs by id (memberships, honours, overrides) and by article title (infoboxes). */
export function clubsQuery(
  qids: string[],
  enTitles: string[],
  frTitles: string[],
): string {
  const ids = qids.map((q) => `wd:${q}`).join(" ");
  const en = enTitles.map((t) => literal(t, "en")).join(" ");
  const fr = frTitles.map((t) => literal(t, "fr")).join(" ");
  // An empty part is left out, so a run can ask for the ids and each
  // language's titles in separate, smaller queries.
  const parts = [
    qids.length > 0 && `{ VALUES ?club { ${ids} } }`,
    enTitles.length > 0 &&
      `{ VALUES ?t { ${en} } ?a schema:name ?t ; schema:isPartOf <https://en.wikipedia.org/> ; schema:about ?club . }`,
    frTitles.length > 0 &&
      `{ VALUES ?u { ${fr} } ?b schema:name ?u ; schema:isPartOf <https://fr.wikipedia.org/> ; schema:about ?club . }`,
  ].filter((p): p is string => typeof p === "string");
  return `SELECT ?club (SAMPLE(?enL) AS ?en) (SAMPLE(?frL) AS ?fr) (SAMPLE(?arL) AS ?ar) (SAMPLE(?isoCode) AS ?iso)
  (GROUP_CONCAT(DISTINCT STRAFTER(STR(?league), "entity/"); separator="|") AS ?leagues)
  (SAMPLE(?enT) AS ?enTitle) (SAMPLE(?frT) AS ?frTitle)
WHERE {
  ${parts.join("\n  UNION ")}
  OPTIONAL { ?club rdfs:label ?enL FILTER(LANG(?enL) = "en") }
  OPTIONAL { ?club rdfs:label ?frL FILTER(LANG(?frL) = "fr") }
  OPTIONAL { ?club rdfs:label ?arL FILTER(LANG(?arL) = "ar") }
  OPTIONAL { ?club wdt:P17 ?c . ?c wdt:P297 ?isoCode }
  OPTIONAL { ?club wdt:P118 ?league }
  OPTIONAL { ?ae schema:about ?club ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?enT }
  OPTIONAL { ?af schema:about ?club ; schema:isPartOf <https://fr.wikipedia.org/> ; schema:name ?frT }
}
GROUP BY ?club`;
}

export function sparqlRequest(query: string): {
  url: string;
  init: RequestInit;
} {
  return {
    url: SPARQL_ENDPOINT,
    init: {
      method: "POST",
      headers: {
        Accept: "application/sparql-results+json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ query }).toString(),
    },
  };
}
