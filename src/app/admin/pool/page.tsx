import type { Metadata } from "next";
import { loadPool } from "@/admin/load-pool";
import { NavLink } from "@/admin/nav-link";
import {
  CROSS_CHECKED,
  type Filters,
  flagKinds,
  flagsBySubject,
  matches,
  paginate,
  parseFilters,
  poolsLabel,
  SHORT,
  summarize,
  toQuery,
} from "@/admin/pool";
import { computeConfidence, computeCoverage } from "@/pipeline/report.ts";
import { confidences } from "@/pipeline/types.ts";
import type { Confidence, PoolPlayer } from "@/pipeline/types.ts";

// Jalel's review of the pool: what it holds, how sure each field is, and
// every footballer, filtered by query parameters. Server-rendered with plain
// links and a GET form: no client component. English on purpose: a tool,
// not part of the game, so nothing here goes in messages/.

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Pool review" };

const LETTER: Record<Confidence, string> = { high: "H", medium: "M", low: "L" };

function Levels({ player }: { player: PoolPlayer }) {
  return (
    <ul className="levels">
      {CROSS_CHECKED.map((field) => {
        const level = player.provenance[field]?.confidence;
        return (
          <li
            key={field}
            className={`level${level ? ` level-${level}` : ""}`}
            title={`${field}: ${level ?? "no entry"}`}
          >
            {SHORT[field]} {level ? LETTER[level] : "no entry"}
          </li>
        );
      })}
    </ul>
  );
}

export default async function PoolReviewPage({
  searchParams,
}: PageProps<"/admin/pool">) {
  const filters = parseFilters(await searchParams);
  const pool = await loadPool();
  const summary = summarize(pool);
  const flags = flagsBySubject(pool.flags);
  const clubs = new Map(pool.clubs.map((c) => [c.id, c.nameLatin]));
  const shown = pool.players.filter((p) =>
    matches(p, filters, flags.get(p.wikidataId) ?? []),
  );
  const { items, page, pages } = paginate(shown, filters.page);
  const href = (change: Partial<Filters>) =>
    `/admin/pool${toQuery({ ...filters, page: 1, ...change })}`;
  const current = (on: boolean) => (on ? { "aria-current": true } : {});

  return (
    <main>
      <h1>Pool review</h1>
      <p className="dim">
        data/pool.json as committed with this deployment, the file the build
        synced into the database. Newest value read on{" "}
        {summary.newestRead ?? "no date"}. Each source&apos;s status is in
        data/report.md; the pool file does not carry it.
      </p>

      <dl className="facts" aria-label="Summary">
        {(
          [
            ["Footballers", summary.players],
            ["Active", summary.active],
            ["Legends", summary.legend],
            ["In both pools", summary.both],
            ["Clubs", summary.clubs],
            ["Honours", summary.honours],
            ["Flags", summary.flags],
            ...summary.dropped.map(
              ([reason, count]) => [`Left out: ${reason}`, count] as const,
            ),
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <div className="scroll">
        <table>
          <caption>Confidence by field</caption>
          <thead>
            <tr>
              <th scope="col">Field</th>
              {confidences.map((level) => (
                <th key={level} scope="col" className="num">
                  {level}
                </th>
              ))}
              <th scope="col" className="num">
                no entry
              </th>
            </tr>
          </thead>
          <tbody>
            {computeConfidence(pool.players).map((row) => (
              <tr key={row.field}>
                <th scope="row">{row.field}</th>
                {confidences.map((level) => (
                  <td key={level} className="num">
                    <NavLink
                      href={href({ confidence: level, field: row.field })}
                    >
                      {row[level]}
                    </NavLink>
                  </td>
                ))}
                <td className="num">{row.none}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="scroll">
        <table>
          <caption>What the pool has</caption>
          <thead>
            <tr>
              <th scope="col">Value</th>
              <th scope="col" className="num">
                Footballers
              </th>
            </tr>
          </thead>
          <tbody>
            {computeCoverage(pool.players).map((row) => (
              <tr key={row.field}>
                <th scope="row">{row.field}</th>
                <td className="num">
                  {row.count} of {row.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 id="footballers">Footballers</h2>
      <nav aria-label="Filters" className="filters">
        <p>
          Confidence:{" "}
          <NavLink
            href={href({ confidence: null, field: null })}
            {...current(!filters.confidence)}
          >
            any
          </NavLink>
          {confidences.map((level) => (
            <span key={level}>
              {" · "}
              <NavLink
                href={href({ confidence: level })}
                {...current(filters.confidence === level)}
              >
                {level}
              </NavLink>
            </span>
          ))}{" "}
          <span className="dim">
            in{" "}
            {filters.field ?? `any checked field (${CROSS_CHECKED.join(", ")})`}
          </span>
          {filters.field && (
            <>
              {" "}
              <NavLink href={href({ field: null })}>any checked field</NavLink>
            </>
          )}
        </p>
        <p>
          Pool:{" "}
          <NavLink href={href({ pool: null })} {...current(!filters.pool)}>
            both
          </NavLink>
          {" · "}
          <NavLink
            href={href({ pool: "active" })}
            {...current(filters.pool === "active")}
          >
            active
          </NavLink>
          {" · "}
          <NavLink
            href={href({ pool: "legend" })}
            {...current(filters.pool === "legend")}
          >
            legend
          </NavLink>
        </p>
        <p>
          Flag:{" "}
          <NavLink href={href({ flag: null })} {...current(!filters.flag)}>
            any
          </NavLink>
          {flagKinds(pool).map(([kind, count]) => (
            <span key={kind}>
              {" · "}
              <NavLink
                href={href({ flag: kind })}
                {...current(filters.flag === kind)}
              >
                {kind}
              </NavLink>{" "}
              ({count})
            </span>
          ))}
        </p>
        <form method="get" action="/admin/pool" role="search">
          {(["confidence", "field", "pool", "flag"] as const).map((key) =>
            filters[key] ? (
              <input
                key={key}
                type="hidden"
                name={key}
                value={filters[key] ?? ""}
              />
            ) : null,
          )}
          <label htmlFor="q">Name, Latin or Arabic</label>
          <input id="q" name="q" type="search" defaultValue={filters.q} />
          <button type="submit">Search</button>
        </form>
      </nav>

      <p role="status">
        Showing {shown.length} of {pool.players.length} footballers
        {pages > 1 ? `, page ${page} of ${pages}` : ""}. Levels: H high, M
        medium, L low.
      </p>

      {items.length === 0 ? (
        <p>No footballer matches these filters.</p>
      ) : (
        <div className="scroll">
          <table aria-labelledby="footballers">
            <thead>
              <tr>
                <th scope="col">Footballer</th>
                <th scope="col">Pools</th>
                <th scope="col">Position</th>
                <th scope="col">Club</th>
                <th scope="col">Caps / goals</th>
                <th scope="col">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td>
                    <NavLink href={`/admin/pool/${p.id}`}>
                      {p.nameLatin}
                    </NavLink>
                    {p.nameArabic && (
                      <>
                        <br />
                        <bdi lang="ar" dir="rtl">
                          {p.nameArabic}
                        </bdi>
                      </>
                    )}
                  </td>
                  <td>
                    {poolsLabel(p)}
                    {p.provenance.pools ? " (placed by an override)" : ""}
                  </td>
                  <td>
                    {p.position}
                    {p.positionDetail ? ` (${p.positionDetail})` : ""}
                  </td>
                  <td>
                    {p.clubId ? (clubs.get(p.clubId) ?? p.clubId) : "none"}
                  </td>
                  <td>
                    {p.caps} / {p.goals}
                    {p.capsAsOf ? (
                      <>
                        <br />
                        <span className="dim">as of {p.capsAsOf}</span>
                      </>
                    ) : null}
                  </td>
                  <td>
                    <Levels player={p} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="pages">
          {page > 1 && (
            <NavLink
              href={`/admin/pool${toQuery({ ...filters, page: page - 1 })}`}
            >
              Previous page
            </NavLink>
          )}
          {page < pages && (
            <NavLink
              href={`/admin/pool${toQuery({ ...filters, page: page + 1 })}`}
            >
              Next page
            </NavLink>
          )}
        </nav>
      )}
    </main>
  );
}
