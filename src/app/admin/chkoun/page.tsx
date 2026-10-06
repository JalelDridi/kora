import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { adminAccess } from "@/admin/access";
import { calendarErrorMessage, loadAdminCalendar } from "@/admin/calendar";
import type { AdminCalendar, Pickable } from "@/admin/calendar";
import { loadPool } from "@/admin/load-pool";
import { NavLink } from "@/admin/nav-link";
import { getKv, kvEnv } from "@/chkoun/kv";
import { readNightly } from "@/chkoun/nightly";
import type { NightlyJob } from "@/chkoun/nightly";
import { withPg } from "@/db/pg";
import { tunisToday } from "@/pipeline/calendar.ts";
import { oneFieldAway } from "@/pipeline/report.ts";
import { pinDay, redrawDay, swapDay } from "./actions";

// Jalel's Chkoun? calendar (D-S2-2): the last 7 and the next 30 days, who is
// on each, how the day was chosen, and the changes he can make to a day that
// is not frozen. Server-rendered, plain forms and server actions, no client
// script. English on purpose, like /admin/pool: nothing here goes in
// messages/. The calendar is the game's answers: this page exists only
// behind the admin password and is never cached or indexed.

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Chkoun? calendar" };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Job({ job, redis }: { job: NightlyJob | null; redis: boolean }) {
  if (!redis) return <>Redis off: no nightly job is kept.</>;
  if (!job) return <>No nightly job kept yet.</>;
  return (
    <>
      {job.at.slice(0, 16).replace("T", " ")} UTC: {job.ok ? "ok" : "failed"};
      copied {job.copied ?? "none"}, skipped {job.skipped ?? "none"}, days
      written {job.written ?? "none"}, filled {job.filled ?? "none"}
      {job.notes.length > 0 ? `; ${job.notes.join("; ")}` : ""}
    </>
  );
}

function Change({ day }: { day: string }) {
  return (
    <form className="change">
      <input type="hidden" name="day" value={day} />
      <label>
        <span className="visually-hidden">Footballer for {day}</span>
        <input
          name="player"
          list="pickable"
          placeholder="footballer id"
          autoComplete="off"
          size={16}
        />
      </label>
      <label>
        <span className="visually-hidden">Note for {day}</span>
        <input name="note" placeholder="note (pin)" maxLength={200} size={10} />
      </label>
      <button formAction={swapDay}>Swap</button>
      <button formAction={pinDay}>Pin</button>
      <button formAction={redrawDay}>Redraw</button>
    </form>
  );
}

function Pickables({ list }: { list: Pickable[] }) {
  return (
    <datalist id="pickable">
      {list.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nameLatin} ({p.tier ?? "no tier"})
        </option>
      ))}
    </datalist>
  );
}

export default async function ChkounCalendarPage({
  searchParams,
}: PageProps<"/admin/chkoun">) {
  // The password again, as the pool review does: never the proxy alone.
  const authorization = (await headers()).get("authorization");
  if (adminAccess(authorization, process.env.ADMIN_PASSWORD) !== "allow")
    notFound();
  const params = await searchParams;
  const pool = await loadPool();
  const calendar: AdminCalendar = await withPg(async (db) =>
    loadAdminCalendar(db, await tunisToday(db)),
  );
  const kv = getKv();
  const job = kv ? await readNightly(kv, kvEnv()).catch(() => null) : null;
  const names = new Map(pool.players.map((p) => [p.id, p.nameLatin]));
  const nearly = oneFieldAway(pool.players);
  const error = calendarErrorMessage(params.error);
  const done =
    typeof params.done === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.done)
      ? params.done
      : null;

  return (
    <main>
      <h1>Chkoun? calendar</h1>
      <p className="dim">
        Today in Tunis is {calendar.today}. A day freezes 48 hours before it
        starts: today and the next two days cannot change. Swap puts another
        answer-ready footballer of tier A to C on a day the generator keeps; pin
        fixes any answer-ready footballer of tier A to D, and every top-up keeps
        it; redraw asks the seed for another footballer.
      </p>
      {error ? (
        <p role="alert" className="notice notice-error">
          {error}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="notice">
          Saved: {done}.
        </p>
      ) : null}

      <dl className="facts" aria-label="Summary">
        {(
          [
            ["Eligible, tier A", calendar.counts.A],
            ["Eligible, tier B", calendar.counts.B],
            ["Eligible, tier C", calendar.counts.C],
            ["Repeat window", `${calendar.window} days`],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p>
        Last nightly job: <Job job={job} redis={kv !== null} />
      </p>

      <Pickables list={calendar.pinnable} />
      <div className="scroll">
        <table className="calendar">
          <caption>The last 7 and the next 30 days</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col" className="num">
                #
              </th>
              <th scope="col">Footballer</th>
              <th scope="col">Tier</th>
              <th scope="col">Source</th>
              <th scope="col">Frozen</th>
              <th scope="col">Note</th>
              <th scope="col">Warnings</th>
              <th scope="col">Change</th>
            </tr>
          </thead>
          <tbody>
            {calendar.days.map((d) => (
              <tr
                key={d.day}
                id={`d-${d.day}`}
                className={d.frozen ? "frozen" : undefined}
                aria-current={d.day === calendar.today ? "date" : undefined}
              >
                <th scope="row">
                  {WEEKDAYS[d.weekday]} {d.day}
                </th>
                <td className="num">{d.number > 0 ? d.number : "before #1"}</td>
                <td>
                  {d.playerId ? (
                    <>
                      <NavLink href={`/admin/pool/${d.playerId}`}>
                        {d.nameLatin ?? d.playerId}
                      </NavLink>
                      {d.nameArabic ? (
                        <>
                          {" "}
                          <span lang="ar" dir="rtl">
                            {d.nameArabic}
                          </span>
                        </>
                      ) : null}
                    </>
                  ) : (
                    "empty"
                  )}
                </td>
                <td>{d.tier ?? "none"}</td>
                <td>{d.source ?? "none"}</td>
                <td>{d.frozen ? "frozen" : "open"}</td>
                <td>{d.note ?? ""}</td>
                <td className={d.warnings.length > 0 ? "warn" : undefined}>
                  {d.warnings.join("; ")}
                </td>
                <td>{d.frozen ? "" : <Change day={d.day} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>One field away</h2>
      <p className="dim">
        Active footballers who fail exactly one answer-ready field: confirm the
        field in the overrides and they can be drawn.
      </p>
      {nearly.length === 0 ? (
        <p>None.</p>
      ) : (
        <ul className="plain">
          {nearly.map((n) => (
            <li key={n.id}>
              <NavLink href={`/admin/pool/${n.id}`}>
                {names.get(n.id) ?? n.id}
              </NavLink>
              : {n.field} ({n.why})
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
