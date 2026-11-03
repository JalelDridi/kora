import { describe, expect, it } from "vitest";
import { USER_AGENT } from "../pipeline/http.ts";
import type { Pool } from "../pipeline/types.ts";
import {
  fakeWikidataFetch,
  searchFootballers,
  type FakeSearch,
} from "./wikidata-search.ts";

// The add page's search (T-AD-5): wbsearchentities, then one wbgetentities
// for the hits, read for the two checks the page shows. A fake fetch with
// two canned answers; Vitest's own fetch throws.

const claim = (id: string) => ({
  mainsnak: { snaktype: "value", datavalue: { value: { id } } },
});
const born = (time: string, precision = 11) => ({
  mainsnak: { snaktype: "value", datavalue: { value: { time, precision } } },
});

const canned = {
  search: {
    search: [
      { id: "Q3", label: "Hamza Msakni", description: "footballer" },
      {
        id: "Q2409513",
        label: "Youssef Msakni",
        description: "Tunisian footballer",
      },
      { id: "Q3148359", label: "Iheb Msakni", description: "" },
      { id: "Q7", label: "Msakni (surname)" },
    ],
  },
  entities: {
    entities: {
      Q3: {
        id: "Q3",
        labels: { en: { language: "en", value: "Hamza Msakni" } },
        claims: {
          P106: [claim("Q937857")],
          P1532: [claim("Q948")],
          P569: [born("+2001-02-03T00:00:00Z")],
        },
        sitelinks: { enwiki: { site: "enwiki", title: "Hamza Msakni" } },
      },
      Q2409513: {
        id: "Q2409513",
        claims: {
          P106: [claim("Q937857")],
          P27: [claim("Q948")],
          P569: [born("+1990-10-28T00:00:00Z")],
        },
        sitelinks: {},
      },
      Q3148359: {
        id: "Q3148359",
        labels: { fr: { language: "fr", value: "Iheb Msakni" } },
        descriptions: { en: { language: "en", value: "footballeur" } },
        claims: {
          P106: [claim("Q937857")],
          P27: [claim("Q31")],
          P569: [born("+1996-00-00T00:00:00Z", 9)],
        },
      },
      Q7: { id: "Q7", claims: { P31: [claim("Q101352")] } },
    },
  },
};

const known = {
  pool: {
    players: [{ wikidataId: "Q2409513", id: "youssef-msakni" }],
    dropped: [
      {
        wikidataId: "Q3148359",
        name: "Iheb Msakni",
        reason: "no-pool",
        flags: [],
      },
    ],
  } as unknown as Pick<Pool, "players" | "dropped">,
  registry: { Q2409513: "youssef-msakni", Q8: "gone" },
};

function recording(answers: unknown[]) {
  const calls: { url: URL; headers: Headers; signal: AbortSignal | null }[] =
    [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: new URL(String(input)),
      headers: new Headers(init?.headers),
      signal: init?.signal ?? null,
    });
    return Response.json(answers[calls.length - 1] ?? {});
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("searchFootballers", () => {
  it("keeps Wikidata's order and reads the two checks, the birth date and the pool", async () => {
    const { calls, fetchImpl } = recording([canned.search, canned.entities]);
    const hits = await searchFootballers("  Msakni ", fetchImpl, known);
    expect(hits).toEqual([
      {
        qid: "Q3",
        label: "Hamza Msakni",
        description: "footballer",
        footballer: true,
        tunisian: true,
        born: "2001-02-03",
        enwiki: "Hamza Msakni",
        inPool: null,
        seen: null,
      },
      {
        qid: "Q2409513",
        label: "Youssef Msakni",
        description: "Tunisian footballer",
        footballer: true,
        tunisian: true,
        born: "1990-10-28",
        enwiki: null,
        inPool: "youssef-msakni",
        seen: null,
      },
      {
        qid: "Q3148359",
        label: "Iheb Msakni",
        description: "footballeur",
        footballer: true,
        tunisian: false,
        born: "1996",
        enwiki: null,
        inPool: null,
        seen: "dropped",
      },
      {
        qid: "Q7",
        label: "Msakni (surname)",
        description: "",
        footballer: false,
        tunisian: false,
        born: null,
        enwiki: null,
        inPool: null,
        seen: null,
      },
    ]);
    expect(calls).toHaveLength(2);
    const [search, get] = calls;
    expect(search.url.origin + search.url.pathname).toBe(
      "https://www.wikidata.org/w/api.php",
    );
    expect(Object.fromEntries(search.url.searchParams)).toMatchObject({
      action: "wbsearchentities",
      search: "Msakni",
      language: "en",
      uselang: "en",
      type: "item",
      limit: "10",
      format: "json",
    });
    expect(Object.fromEntries(get.url.searchParams)).toMatchObject({
      action: "wbgetentities",
      ids: "Q3|Q2409513|Q3148359|Q7",
      props: "claims|labels|descriptions|sitelinks",
      languages: "en|fr|ar",
    });
    for (const call of calls) {
      expect(call.headers.get("user-agent")).toBe(USER_AGENT);
      expect(call.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("cuts a long query to 80 characters, searches Arabic in Arabic, and asks nothing for an empty one", async () => {
    const long = recording([{ search: [] }]);
    expect(
      await searchFootballers("x".repeat(200), long.fetchImpl, known),
    ).toEqual([]);
    expect(long.calls).toHaveLength(1);
    expect(long.calls[0].url.searchParams.get("search")).toBe("x".repeat(80));
    const arabic = recording([{ search: [] }]);
    await searchFootballers("المساكني", arabic.fetchImpl, known);
    expect(arabic.calls[0].url.searchParams.get("language")).toBe("ar");
    const empty = recording([]);
    expect(await searchFootballers("   ", empty.fetchImpl, known)).toEqual([]);
    expect(empty.calls).toHaveLength(0);
  });

  it("names an id the registry has seen outside the last pool", async () => {
    const { fetchImpl } = recording([
      { search: [{ id: "Q8", label: "Gone" }] },
      { entities: { Q8: { id: "Q8", claims: {} } } },
    ]);
    const [hit] = await searchFootballers("Gone", fetchImpl, known);
    expect(hit).toMatchObject({ qid: "Q8", inPool: null, seen: "registry" });
  });

  it("fails on Wikidata's error answer or a refusal, never with an empty list", async () => {
    const error = recording([{ error: { code: "badvalue", info: "x" } }]);
    await expect(
      searchFootballers("a", error.fetchImpl, known),
    ).rejects.toThrow("Wikidata search: badvalue");
    const refused = (async () =>
      new Response("", { status: 429 })) as typeof fetch;
    await expect(searchFootballers("a", refused, known)).rejects.toThrow();
  });

  it("the browser tests' fake answers both requests from its canned state", async () => {
    const state: FakeSearch = {
      results: { Msakni: canned.search.search },
      entities: canned.entities.entities,
    };
    const hits = await searchFootballers(
      "Msakni",
      fakeWikidataFetch(() => state),
      known,
    );
    expect(hits.map((h) => [h.qid, h.inPool])).toEqual([
      ["Q3", null],
      ["Q2409513", "youssef-msakni"],
      ["Q3148359", null],
      ["Q7", null],
    ]);
    expect(
      await searchFootballers(
        "Zzz",
        fakeWikidataFetch(() => state),
        known,
      ),
    ).toEqual([]);
  });
});
