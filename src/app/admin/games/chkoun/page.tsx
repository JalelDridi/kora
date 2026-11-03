import type { Metadata } from "next";
import type { AdminDay } from "@/admin/calendar";
import {
  chkounView,
  parseGameQuery,
  showRows,
  sortRows,
  TIERS,
} from "@/admin/games";
import type { ChkounRow, ChkounSort, GameQuery, Show } from "@/admin/games";
import { answersAround } from "@/admin/home";
import { loadPool } from "@/admin/load-pool";
import { NavLink } from "@/admin/nav-link";
import { FIELD_LABEL, paginate, summarize } from "@/admin/pool";
import type { ProvenancedField } from "@/pipeline/types.ts";
import { withPg } from "@/db/pg";
import { tunisToday } from "@/pipeline/calendar.ts";

// What Chkoun? makes of the pool (Task 5): how many footballers can be an
// answer, who is one field away, who is in grace, the fame tiers, and
// today's and tomorrow's answers. Read only: every footballer links to his
// editor; a footballer whose missing field is fame gets the local-star
// form, a GET to the editor's own preview. Filters and sorting are query
// parameters: no client script.

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Chkoun? view" };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** The field's name as the pool review prints it; fame is the calendar's own. */
const awayLabel = (field: string) =>
  field === "fame" ? "Fame" : (FIELD_LABEL[field as ProvenancedField] ?? field);

const TIER_LABEL = (tier: string) =>
  tier === "unmeasured" ? "not measured" : `tier ${tier}`;

type Around = { today: AdminDay | null; tomorrow: AdminDay | null } | null;

async function readAround(): Promise<Around> {
  try {
    return await withPg(async (db) => answersAround(db, await tunisToday(db)));
  } catch {
    // The view still reads without its database; the line says so.
    return null;
  }
}

function Answer({
  label,
  day,
  qids,
}: {
  label: string;
  day: AdminDay | null;
  qids: Map<string, string>;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {day?.playerId ? (
          <>
            {qids.has(day.playerId) ? (
              <NavLink href={`/admin/footballers/${qids.get(day.playerId)}`}>
                {day.nameLatin ?? day.playerId}
              </NavLink>
            ) : (
              (day.nameLatin ?? day.playerId)
            )}{" "}
            <span className="dim">
              #{day.number}, {WEEKDAYS[day.weekday]} {day.day},{" "}
              {day.tier ? `tier ${day.tier}` : "no tier"}, {day.source}
              {day.warnings.length > 0 ? `; ${day.warnings.join("; ")}` : ""}
            </span>{" "}
            <NavLink href={`/admin/chkoun#d-${day.day}`}>
              In the calendar
            </NavLink>
          </>
        ) : (
          <>
            No answer yet. <NavLink href="/admin/chkoun">The calendar</NavLink>
          </>
        )}
      </dd>
    </div>
  );
}

function LocalStar({ row }: { row: ChkounRow }) {
  const id = `star-${row.qid}`;
  return (
    <form
      method="get"
      action={`/admin/footballers/${row.qid}`}
      className="quick"
    >
      <input type="hidden" name="preview" value="1" />
      <input type="hidden" name="qid" value={row.qid} />
      <label className="check" htmlFor={`${id}-on`}>
        <input id={`${id}-on`} type="checkbox" name="localStar" />
        Local star
        <span className="visually-hidden"> ({row.name})</span>
      </label>
      <label htmlFor={`${id}-note`} className="visually-hidden">
        Note for {row.name}
      </label>
      <input
        id={`${id}-note`}
        name="note"
        type="text"
        placeholder="Note"
        maxLength={500}
      />
      <button type="submit">
        Preview<span className="visually-hidden"> {row.name}</span>
      </button>
    </form>
  );
}

const COLUMNS: { sort: ChkounSort | null; label: string; num?: boolean }[] = [
  { sort: "name", label: "Footballer" },
  { sort: "club", label: "Club" },
  { sort: "tier", label: "Tier" },
  { sort: "fame", label: "Fame", num: true },
  { sort: null, label: "Answer-ready" },
  { sort: null, label: "One field away" },
  { sort: null, label: "Grace until" },
];

export default async function ChkounViewPage({
  searchParams,
}: PageProps<"/admin/games/chkoun">) {
  const query = parseGameQuery(await searchParams);
  // loadPool checks the admin password again (never the proxy alone).
  const [pool, around] = await Promise.all([loadPool(), readAround()]);
  const buildDay = summarize(pool).newestRead ?? "";
  const view = chkounView(pool, buildDay);
  const qids = new Map(pool.players.map((p) => [p.id, p.wikidataId]));
  const sort = (query.sort ?? "name") as ChkounSort;
  const shown = sortRows(showRows(view.rows, query.show), sort);
  const { items, page, pages } = paginate(shown, query.page);
  const href = (change: Partial<GameQuery>) => {
    const next = { ...query, page: 1, ...change };
    const params = new URLSearchParams();
    if (next.show) params.set("show", next.show);
    if (next.sort && next.sort !== "name") params.set("sort", next.sort);
    if (next.page > 1) params.set("page", String(next.page));
    const text = params.toString();
    return `/admin/games/chkoun${text ? `?${text}` : ""}`;
  };
  const current = (on: boolean) => (on ? { "aria-current": true } : {});
  const shows: [Show | null, string][] = [
    [null, "all"],
    ["ready", "answer-ready"],
    ["away", "one field away"],
    ["grace", "in grace"],
    ...TIERS.map((t) => [`tier-${t}` as Show, TIER_LABEL(t)] as [Show, string]),
  ];
  const facts: [string, number, Show | null][] = [
    ["Active", view.counts.active, null],
    ["Answer-ready", view.counts.answerReady, "ready"],
    ["One field away", view.counts.oneFieldAway, "away"],
    ["In grace", view.counts.grace, "grace"],
    ...TIERS.map(
      (t) =>
        [
          `Active, ${TIER_LABEL(t)}`,
          view.counts.tiers[t],
          `tier-${t}` as Show,
        ] as [string, number, Show],
    ),
  ];

  return (
    <main>
      <h1>Chkoun? view</h1>
      <p className="dim">
        What Chkoun? makes of data/pool.json as committed with this deployment.
        An answer is an active footballer who is answer-ready and of tier A to
        C. One field away: a field short of answer-ready, or answer-ready with
        tier D or no fame measured yet (the field is then fame). Grace dates are
        read against {buildDay || "no date"}, the pool&apos;s newest value.
      </p>

      <dl className="facts" aria-label="Counts">
        {facts.map(([label, value, show]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              <NavLink
                href={href({ show })}
                aria-label={`${label}: ${value}, list them`}
              >
                {value}
              </NavLink>
            </dd>
          </div>
        ))}
      </dl>

      <h2 id="answers">Today and tomorrow</h2>
      {around === null ? (
        <p className="notice">
          The calendar could not be read.{" "}
          <NavLink href="/admin/chkoun">The calendar</NavLink>
        </p>
      ) : (
        <dl className="answers" aria-labelledby="answers">
          <Answer label="Today" day={around.today} qids={qids} />
          <Answer label="Tomorrow" day={around.tomorrow} qids={qids} />
        </dl>
      )}

      <h2 id="footballers">Footballers</h2>
      <nav aria-label="Filters" className="filters">
        <p>
          Show:{" "}
          {shows.map(([show, label], i) => (
            <span key={label}>
              {i > 0 ? " · " : ""}
              <NavLink href={href({ show })} {...current(query.show === show)}>
                {label}
              </NavLink>
            </span>
          ))}
        </p>
      </nav>
      <p role="status">
        Showing {shown.length} of {view.rows.length} footballers
        {pages > 1 ? `, page ${page} of ${pages}` : ""}, sorted by {sort}.
      </p>

      {items.length === 0 ? (
        <p>No footballer matches this filter.</p>
      ) : (
        <div
          className="scroll"
          tabIndex={0}
          role="region"
          aria-label="Footballers, scrolls sideways"
        >
          <table aria-labelledby="footballers" className="game">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th
                    key={c.label}
                    scope="col"
                    className={c.num ? "num" : undefined}
                    aria-sort={
                      c.sort === sort
                        ? c.sort === "fame"
                          ? "descending"
                          : "ascending"
                        : undefined
                    }
                  >
                    {c.sort && c.sort !== sort ? (
                      <NavLink href={href({ sort: c.sort })}>
                        {c.label}
                        <span className="visually-hidden">, sort</span>
                      </NavLink>
                    ) : (
                      c.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((r) => [
                <tr key={r.id}>
                  <th scope="row">
                    <NavLink href={`/admin/footballers/${r.qid}`}>
                      {r.name}
                    </NavLink>
                    {r.localStar ? (
                      <>
                        <br />
                        <span className="dim">local star</span>
                      </>
                    ) : null}
                  </th>
                  <td>{r.club ?? "none"}</td>
                  <td>{r.tier === "unmeasured" ? "not measured" : r.tier}</td>
                  <td className="num">{r.fame ?? "none"}</td>
                  <td>{r.ready ? "yes" : "no"}</td>
                  <td>{r.away ? awayLabel(r.away) : ""}</td>
                  <td>{r.graceUntil ?? ""}</td>
                </tr>,
                // Under his row, at the start of the scroll box, so a phone
                // reaches it without scrolling sideways.
                r.away === "fame" && !r.localStar ? (
                  <tr key={`${r.id}-star`} className="quick-row">
                    <td colSpan={COLUMNS.length}>
                      <LocalStar row={r} />
                    </td>
                  </tr>
                ) : null,
              ])}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="pages">
          {page > 1 && (
            <NavLink href={href({ page: page - 1 })}>Previous page</NavLink>
          )}
          {page < pages && (
            <NavLink href={href({ page: page + 1 })}>Next page</NavLink>
          )}
        </nav>
      )}
    </main>
  );
}
