import type { Metadata } from "next";
import { Fragment } from "react";
import { LINES, parseGameQuery, seasonView, sortClubs } from "@/admin/games";
import type { SeasonClub, SeasonSort } from "@/admin/games";
import { loadPool } from "@/admin/load-pool";
import { NavLink } from "@/admin/nav-link";
import { LINE_SHORT } from "@/engine/season/data.ts";
import { getSeasonData } from "@/season/data.server";

// What 30–0 makes of the pool (Task 5): per Ligue 1 club, the candidates
// of each decade and line with the rating their card shows, best first,
// from the same season data the draft endpoint builds once per instance.
// Read only: every name links to the footballer's editor, the strength to
// its row in ligue1-strength.json. Each decade gives its counts per line,
// the names in a closed <details> per line, so an open club stays short on
// a phone. No client script.

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "30–0 view" };

const LINE_LABEL = {
  goalkeeper: "Goalkeepers",
  defender: "Defenders",
  midfielder: "Midfielders",
  forward: "Forwards",
} as const;

const SORTS: [SeasonSort, string][] = [
  ["name", "name"],
  ["strength", "strength"],
  ["open", "open triples"],
];

function Club({
  club,
  qids,
  slots,
}: {
  club: SeasonClub;
  qids: Map<string, string>;
  slots: number;
}) {
  const strength = club.strength === null ? "no strength" : club.strength;
  return (
    <details className="club" id={club.clubId}>
      <summary>
        {club.name}{" "}
        <span className="dim">
          · strength {strength} · {club.open} of {slots} open
        </span>
      </summary>
      <p>
        <NavLink href={`/admin/settings/ligue1-strength#${club.clubId}`}>
          Strength {strength}
          <span className="visually-hidden"> of {club.name}</span>
        </NavLink>{" "}
        <span className="dim">in ligue1-strength.json</span>
      </p>
      <table className="season">
        <caption className="visually-hidden">
          {club.name}: candidates by decade and line, best rating first
        </caption>
        <thead>
          <tr>
            <th scope="col">Decade</th>
            <th scope="col">Candidates per line</th>
          </tr>
        </thead>
        <tbody>
          {club.decades.map((d) => (
            <tr key={d.decade}>
              <th scope="row">{d.decade}s</th>
              <td>
                <div className="lines">
                  {LINES.map((line, i) => {
                    const list = d.candidates.filter((c) => c.line === line);
                    const count = `${LINE_SHORT[line]} ${d.lines[line]}`;
                    return (
                      <Fragment key={line}>
                        {i > 0 ? (
                          <span className="sep" aria-hidden="true">
                            ·
                          </span>
                        ) : null}
                        {list.length === 0 ? (
                          <span className="line-empty">{count}</span>
                        ) : (
                          <details className="line">
                            <summary>
                              {count}
                              <span className="visually-hidden">
                                , {LINE_LABEL[line]} of the {d.decade}s
                              </span>
                            </summary>
                            <ol className="candidates">
                              {list.map((c) => (
                                <li key={c.footballerId}>
                                  {qids.has(c.footballerId) ? (
                                    <NavLink
                                      href={`/admin/footballers/${qids.get(c.footballerId)}`}
                                    >
                                      {c.name}
                                    </NavLink>
                                  ) : (
                                    c.name
                                  )}{" "}
                                  <span className="rating">{c.rating}</span>
                                </li>
                              ))}
                            </ol>
                          </details>
                        )}
                      </Fragment>
                    );
                  })}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export default async function SeasonViewPage({
  searchParams,
}: PageProps<"/admin/games/season">) {
  const query = parseGameQuery(await searchParams);
  // loadPool checks the admin password again (never the proxy alone); the
  // season data is built once per instance.
  const [pool, data] = await Promise.all([loadPool(), getSeasonData()]);
  const view = seasonView(data);
  const qids = new Map(pool.players.map((p) => [p.id, p.wikidataId]));
  const sort: SeasonSort =
    query.sort === "strength" || query.sort === "open" ? query.sort : "name";
  const clubs = sortClubs(view.clubs, sort);
  const slots = view.total / Math.max(1, view.clubs.length);

  return (
    <main>
      <h1>30–0 view</h1>
      <p className="dim">
        What 30–0 makes of data/pool.json and the curated files as deployed: a
        spin draws a club, a decade and a line, then one of its candidates. Each
        name carries the rating his card shows.
      </p>
      <dl className="facts" aria-label="Counts">
        <div>
          <dt>Ligue 1 clubs</dt>
          <dd>{view.clubs.length}</dd>
        </div>
        <div>
          <dt>Triples that can be spun</dt>
          <dd>
            {view.openTriples} of {view.total}
          </dd>
        </div>
      </dl>

      <h2 id="clubs">Clubs</h2>
      <nav aria-label="Sort" className="filters">
        <p>
          Sort by:{" "}
          {SORTS.map(([key, label], i) => (
            <span key={key}>
              {i > 0 ? " · " : ""}
              <NavLink
                href={`/admin/games/season${key === "name" ? "" : `?sort=${key}`}`}
                {...(sort === key ? { "aria-current": true } : {})}
              >
                {label}
              </NavLink>
            </span>
          ))}
        </p>
      </nav>
      {clubs.map((club) => (
        <Club key={club.clubId} club={club} qids={qids} slots={slots} />
      ))}
    </main>
  );
}
