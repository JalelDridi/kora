import type { Metadata } from "next";
import { DEPLOYMENT_DATA } from "@/admin/edit/commit.server";
import { readOverrides } from "@/admin/edit/read-overrides.server";
import { saveError } from "@/admin/footballer-page";
import { loadPool } from "@/admin/load-pool";
import { NavLink } from "@/admin/nav-link";
import { getWikidataFetch } from "@/admin/wikidata";
import { searchFootballers } from "@/admin/wikidata-search";
import type { SearchHit } from "@/admin/wikidata-search";
import type { PlayerOverride } from "@/pipeline/overrides.ts";
import type { PoolDropped } from "@/pipeline/types.ts";
import { includeFootballer } from "./actions";

// Add a footballer by a Wikidata search (T-AD-5): a GET form, the search
// done on the server (at most two requests), the hits as cards with the two
// checks Jalel needs. "Add to the pool" commits an include override; one
// already in the pool, or seen and left out by the last build, links to his
// editor instead. English, plain forms, no client script.

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Add a footballer" };

const one = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

type Searched =
  { ok: true; hits: SearchHit[] } | { ok: false; error: string } | null;

export default async function AddFootballerPage({
  searchParams,
}: PageProps<"/admin/add">) {
  // loadPool checks the admin password again (never the proxy alone).
  const pool = await loadPool();
  const query = await searchParams;
  const q = (one(query.q) ?? "").trim().slice(0, 80);
  const error = saveError(one(query.error));
  const overrides = await readOverrides();
  const players = (
    JSON.parse(overrides.text) as { players: Record<string, PlayerOverride> }
  ).players;

  let searched: Searched = null;
  if (q !== "") {
    try {
      const registry =
        (
          JSON.parse((await DEPLOYMENT_DATA.read("ids.json")) ?? "{}") as {
            players?: Record<string, string>;
          }
        ).players ?? {};
      searched = {
        ok: true,
        hits: await searchFootballers(q, getWikidataFetch(), {
          pool,
          registry,
        }),
      };
    } catch (e) {
      searched = { ok: false, error: e instanceof Error ? e.message : "error" };
    }
  }
  const dropped = new Map(pool.dropped.map((d) => [d.wikidataId, d]));

  return (
    <main className="editor">
      <h1>Add a footballer</h1>
      <p className="dim">
        Search Wikidata by name. Adding one writes an include override: the
        nightly then fetches him with the Tunisian footballers, and he joins
        whichever pool his data fits.
      </p>
      {overrides.notice ? (
        <p className="notice">
          {overrides.notice.replace("saving is off", "adding is off")}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="notice notice-error">
          {error}
        </p>
      ) : null}
      <form method="get" action="/admin/add" role="search" className="field">
        <label htmlFor="q">Name on Wikidata</label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          maxLength={80}
          autoComplete="off"
          required
        />
        <div className="actions">
          <button type="submit">Search</button>
        </div>
      </form>
      {searched && !searched.ok ? (
        <p className="notice notice-error">
          Wikidata could not be searched ({searched.error}). Try again in a
          minute.
        </p>
      ) : null}
      {searched?.ok ? (
        <section aria-labelledby="results">
          <h2 id="results">
            {searched.hits.length === 0
              ? `No item on Wikidata matches “${q}”`
              : `Wikidata’s matches for “${q}”`}
          </h2>
          <ul className="hits">
            {searched.hits.map((hit) => (
              <Hit
                key={hit.qid}
                hit={hit}
                q={q}
                added={players[hit.qid]?.include ?? null}
                dropped={dropped.get(hit.qid) ?? null}
                canSave={overrides.github !== null}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

function Hit({
  hit,
  q,
  added,
  dropped,
  canSave,
}: {
  hit: SearchHit;
  q: string;
  added: { at: string; note?: string } | null;
  dropped: PoolDropped | null;
  canSave: boolean;
}) {
  const id = `hit-${hit.qid}`;
  const editor = `/admin/footballers/${hit.qid}`;
  const yes = (on: boolean) => (on ? "yes" : "no");
  return (
    <li className="hit" aria-labelledby={id}>
      <h3 id={id}>{hit.label}</h3>
      {hit.description ? <p className="dim">{hit.description}</p> : null}
      <dl className="hit-facts">
        <div>
          <dt>Born</dt>
          <dd>{hit.born ?? "not on Wikidata"}</dd>
        </div>
        <div>
          <dt>Footballer</dt>
          <dd data-testid="footballer">{yes(hit.footballer)}</dd>
        </div>
        <div>
          <dt>Tunisian</dt>
          <dd data-testid="tunisian">{yes(hit.tunisian)}</dd>
        </div>
        <div>
          <dt>Wikidata</dt>
          <dd>
            <a href={`https://www.wikidata.org/wiki/${hit.qid}`}>{hit.qid}</a>
          </dd>
        </div>
        {hit.enwiki ? (
          <div>
            <dt>English page</dt>
            <dd>
              <a
                href={`https://en.wikipedia.org/wiki/${encodeURIComponent(hit.enwiki.replaceAll(" ", "_"))}`}
              >
                {hit.enwiki}
              </a>
            </dd>
          </div>
        ) : null}
      </dl>
      {hit.inPool ? (
        <p className="actions">
          <span>Already in the pool.</span>
          <NavLink href={editor}>
            Edit his overrides
            <span className="visually-hidden"> ({hit.label})</span>
          </NavLink>
        </p>
      ) : added ? (
        <p className="actions">
          <span>
            Added on {added.at}; he joins the pool at the next rebuild if his
            data qualifies him.
          </span>
          <NavLink href={editor}>
            Open his editor
            <span className="visually-hidden"> ({hit.label})</span>
          </NavLink>
        </p>
      ) : dropped ? (
        <p className="actions">
          <span>
            Already fetched every night, left out of the pool ({dropped.reason}
            ).
          </span>
          <NavLink href={editor}>
            Open his editor
            <span className="visually-hidden"> ({hit.label})</span>
          </NavLink>
        </p>
      ) : (
        <form action={includeFootballer}>
          <input type="hidden" name="qid" value={hit.qid} />
          <input type="hidden" name="label" value={hit.label} />
          <input type="hidden" name="q" value={q} />
          <fieldset disabled={!canSave} className="fields">
            <legend className="visually-hidden">Add {hit.label}</legend>
            <label htmlFor={`${id}-note`}>Note</label>
            <p className="dim" id={`${id}-hint`}>
              Why he belongs, and where it says so.
            </p>
            <textarea
              id={`${id}-note`}
              name="note"
              rows={2}
              maxLength={500}
              required
              aria-describedby={`${id}-hint`}
            />
          </fieldset>
          {canSave ? (
            <div className="actions">
              <button type="submit">
                Add to the pool
                <span className="visually-hidden"> ({hit.label})</span>
              </button>
            </div>
          ) : null}
        </form>
      )}
    </li>
  );
}
