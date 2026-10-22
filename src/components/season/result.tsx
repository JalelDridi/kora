import type { ReactNode } from "react";
import { format, localName } from "@/chkoun/labels";
import type { Locale } from "@/i18n/locales";
import type { SeasonView } from "@/season/replay";
import type { SeasonStrings } from "./island";

type Props = {
  view: Pick<SeasonView, "season" | "clubs">;
  locale: Locale;
  strings: SeasonStrings;
  /** Under the record: the board line, sharing and play again, or the replay note. */
  children?: ReactNode;
};

export const RESULT_HEADING = "season-result";

// A played season (plan Task 11): the record, points, goals, the team
// rating and the club the squad replaced, then the 30 matches in order.
// Every outcome is a word, never only a colour. No hooks: the island shows
// it after a play, and the replay page renders it on the server.
export function Result({ view, locale, strings: t, children }: Props) {
  const { season, clubs } = view;
  const club = (id: string) => {
    const names = clubs[id];
    return names ? localName(names, locale) : id;
  };
  const outcome = (f: number, a: number) =>
    f > a ? t.result.win : f === a ? t.result.draw : t.result.loss;
  const record = format(t.result.record, {
    w: season.w,
    d: season.d,
    l: season.l,
  });
  return (
    <section aria-labelledby={RESULT_HEADING} className="flex flex-col gap-4">
      <h2
        id={RESULT_HEADING}
        tabIndex={-1}
        className="flex flex-wrap items-baseline gap-x-3 text-2xl font-extrabold"
      >
        <span>{t.result.title}</span>
        <bdi dir="ltr" data-record="" className="text-5xl text-mint">
          {record}
        </bdi>
      </h2>
      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-pitch-800 p-2">
          <dt className="text-sm text-chalk-dim">{t.result.points}</dt>
          <dd data-points="" className="text-2xl font-extrabold">
            {season.points}
          </dd>
        </div>
        <div className="rounded-xl bg-pitch-800 p-2">
          <dt className="text-sm text-chalk-dim">{t.result.goals}</dt>
          <dd className="text-2xl font-extrabold">
            <bdi dir="ltr">
              {season.gf}-{season.ga}
            </bdi>
          </dd>
        </div>
        <div className="rounded-xl bg-pitch-800 p-2">
          <dt className="text-sm text-chalk-dim">{t.result.teamRating}</dt>
          <dd data-team-rating="" className="text-2xl font-extrabold">
            {season.rating.toFixed(1)}
          </dd>
        </div>
      </dl>
      <p className="text-lg">
        <bdi>{format(t.result.replaces, { club: club(season.replaces) })}</bdi>
      </p>
      {children}
      <h3 id="season-matches" className="mt-2 text-xl font-bold">
        {t.result.matches}
      </h3>
      <ol aria-labelledby="season-matches" className="flex flex-col gap-1">
        {season.matches.map((m) => (
          <li
            key={m.round}
            data-outcome={
              m.for > m.against ? "w" : m.for === m.against ? "d" : "l"
            }
            className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 rounded-lg bg-pitch-800 px-3 py-2 text-base data-[outcome=l]:bg-pitch-900"
          >
            <span className="text-sm text-chalk-dim">
              {format(t.result.round, { n: m.round })}
              {" · "}
              {m.home ? t.result.home : t.result.away}
            </span>
            <span className="min-w-0 font-semibold break-words">
              <bdi>{club(m.opponent)}</bdi>
            </span>
            <span className="flex items-center gap-2">
              <bdi dir="ltr" className="font-extrabold">
                {m.for}-{m.against}
              </bdi>
              <span className="text-sm">{outcome(m.for, m.against)}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
