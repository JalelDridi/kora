import type { Metadata } from "next";
import { AdminNav } from "@/admin/admin-nav";
import type { AdminDay } from "@/admin/calendar";
import { getGitHub } from "@/admin/github";
import { homeSummary, type LastRebuild } from "@/admin/home";
import { loadPool } from "@/admin/load-pool";
import { NavLink } from "@/admin/nav-link";
import { openPg } from "@/db/pg";
import { tunisDay } from "@/engine/chkoun/day.ts";

// The dashboard home (Task 9): six cards, each a section with its heading
// and its links: today's and tomorrow's answers, the pool, what to review,
// the last nightly run, GitHub and the quick links. Server-rendered, no
// client script; loadPool checks the password before anything is read.

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Home" };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const when = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Tunis",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function Answer({ label, day }: { label: string; day: AdminDay | null }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {day?.playerId ? (
          <>
            {day.nameLatin ?? day.playerId}{" "}
            <span className="dim">
              #{day.number}, {WEEKDAYS[day.weekday]} {day.day},{" "}
              {day.tier ? `tier ${day.tier}` : "no tier"}, {day.source}
              {day.warnings.length > 0 ? `; ${day.warnings.join("; ")}` : ""}
            </span>
          </>
        ) : (
          "No answer yet."
        )}
      </dd>
    </div>
  );
}

function Rebuild({ rebuild }: { rebuild: LastRebuild | null }) {
  if (rebuild === null)
    return <p>GitHub is not connected here: no run to show.</p>;
  if (rebuild.kind === "none") return <p>No nightly run yet.</p>;
  if (rebuild.kind === "error")
    return rebuild.status === 0 ? (
      <p>GitHub could not be reached.</p>
    ) : (
      <p>GitHub did not answer ({rebuild.status}).</p>
    );
  return (
    <dl className="answers">
      <div>
        <dt>Stage</dt>
        <dd data-testid="rebuild-stage">{rebuild.stage}</dd>
      </div>
      <div>
        <dt>Started</dt>
        <dd>
          <a href={rebuild.url} rel="noreferrer">
            {when.format(new Date(rebuild.date))}
          </a>{" "}
          <span className="dim">
            {rebuild.scheduled ? "the scheduled night" : "Rebuild now"}
          </span>
        </dd>
      </div>
      <div>
        <dt>Pull request</dt>
        <dd>
          {rebuild.pull ? (
            <a href={rebuild.pull.url} rel="noreferrer">
              #{rebuild.pull.number}
            </a>
          ) : (
            "none"
          )}
        </dd>
      </div>
    </dl>
  );
}

export default async function AdminHome() {
  const pool = await loadPool();
  const github = getGitHub();
  // The Tunis day from this server's clock: the calendar query is the
  // page's one database read, and the page still reads without a database.
  const today = tunisDay(new Date());
  const db = await openPg().catch(() => null);
  const unreachable = {
    query: () => Promise.reject(new Error("no database")),
  };
  let summary;
  try {
    summary = await homeSummary({ db: db ?? unreachable, today, pool, github });
  } finally {
    await db?.end().catch(() => {});
  }
  const { around, review } = summary;
  const counts = summary.pool;

  return (
    <>
      <AdminNav current="home" />
      <main className="home">
        <h1>Kora admin</h1>
        <div className="cards">
          <section aria-labelledby="today">
            <h2 id="today">Today</h2>
            {around ? (
              <dl className="answers">
                <Answer label="Today's answer" day={around.today} />
                <Answer label="Tomorrow's answer" day={around.tomorrow} />
              </dl>
            ) : (
              <p>
                The calendar could not be read: the database did not answer.
              </p>
            )}
            <p className="more">
              <NavLink href="/admin/chkoun">The Chkoun? calendar</NavLink>
            </p>
          </section>

          <section aria-labelledby="pool">
            <h2 id="pool">The pool</h2>
            <dl className="facts">
              {(
                [
                  ["Active", counts.active],
                  ["Legends", counts.legend],
                  ["Answer-ready", counts.answerReady],
                  ["In grace", counts.grace],
                  ["Left out", counts.leftOut],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <p className="more">
              <NavLink href="/admin/pool">Pool review</NavLink>
            </p>
          </section>

          <section aria-labelledby="review">
            <h2 id="review">To review</h2>
            {review.length > 0 ? (
              <ul className="review">
                {review.map((item) => (
                  <li key={item.href}>
                    <NavLink href={item.href}>{item.label}</NavLink>{" "}
                    <span className="dim">{item.count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Nothing flagged and no field rated low.</p>
            )}
          </section>

          <section aria-labelledby="rebuild">
            <h2 id="rebuild">Last rebuild</h2>
            <Rebuild rebuild={summary.rebuild} />
            <p className="more">
              <NavLink href="/admin/rebuild">Rebuild</NavLink>
            </p>
          </section>

          <section aria-labelledby="github">
            <h2 id="github">GitHub</h2>
            <p
              data-testid="github-card"
              className={
                summary.github.warn ? "notice notice-error" : undefined
              }
            >
              {summary.github.text}
            </p>
            <p className="more">
              <a
                href="https://github.com/settings/personal-access-tokens"
                rel="noreferrer"
              >
                Tokens on GitHub
              </a>
            </p>
          </section>

          <section aria-labelledby="quick">
            <h2 id="quick">Quick links</h2>
            <form method="get" action="/admin/pool" className="find">
              <label htmlFor="find">Find a footballer</label>
              <input id="find" name="q" type="search" autoComplete="off" />
              <button type="submit">Search</button>
            </form>
            <ul className="quick-links">
              <li>
                <NavLink href="/admin/add">Add a footballer</NavLink>
              </li>
              <li>
                <NavLink href="/admin/games/chkoun">Games</NavLink>
              </li>
              <li>
                <NavLink href="/admin/settings">Settings</NavLink>
              </li>
              <li>
                <NavLink href="/admin/changes">Changes</NavLink>
              </li>
            </ul>
          </section>
        </div>
      </main>
    </>
  );
}
