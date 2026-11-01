import type { ReactNode } from "react";
import { format, localName, shortName } from "@/chkoun/labels";
import type { Locale } from "@/i18n/locales";
import type { SeasonView } from "@/season/replay";
import clubShort from "../../../data/curated/club-short.json";
import type { SeasonStrings } from "./island";

type Props = {
  view: Pick<SeasonView, "season" | "clubs">;
  locale: Locale;
  strings: SeasonStrings;
  /** Under the record: the board line, sharing and play again, or the replay note. */
  children?: ReactNode;
};

export const RESULT_HEADING = "season-result";
/** The matches shown before the "all 30" button (mobile polish §2.12). */
const FIRST = 5;

// A played season (plan Task 11): the record, points, goals, the team
// rating and the club the squad replaced, then the 30 matches in order: the
// first five, the other 25 behind one button.
// Every outcome is a word, never only a colour. No hooks: the island shows
// it after a play, and the replay page renders it on the server.
export function Result({ view, locale, strings: t, children }: Props) {
  const { season, clubs } = view;
  const club = (id: string) => {
    const names = clubs[id];
    return names ? localName(names, locale) : id;
  };
  /**
   * An opponent in a match row. Under 400 px the club's short label
   * (club-short.json, else the automatic one, as on the Chkoun? tiles) when
   * the name does not fit as it is; screen readers always hear the whole name.
   */
  const opponent = (id: string) => {
    const full = club(id);
    const short = shortName(clubShort.clubs, id, locale, full);
    if (short === full) return <bdi>{full}</bdi>;
    return (
      <>
        <bdi aria-hidden="true" className="min-[400px]:hidden">
          {short}
        </bdi>
        <bdi className="max-[400px]:sr-only">{full}</bdi>
      </>
    );
  };
  const outcome = (f: number, a: number) =>
    f > a ? t.result.win : f === a ? t.result.draw : t.result.loss;
  const match = (m: SeasonView["season"]["matches"][number]) => (
    <li
      key={m.round}
      data-outcome={m.for > m.against ? "w" : m.for === m.against ? "d" : "l"}
      className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-center gap-x-2 rounded-lg bg-pitch-800 px-3 py-2 text-base data-[outcome=l]:bg-pitch-900"
    >
      {/* Every cell wraps between words only; the score column keeps its
          width (fixed in mobile polish Task 5: at 360 px the club names
          broke letter by letter). */}
      <span className="min-w-0 text-sm text-chalk-dim">
        {format(t.result.round, { n: m.round })}
        {" · "}
        {m.home ? t.result.home : t.result.away}
      </span>
      <span
        data-opponent=""
        className="min-w-0 font-semibold [overflow-wrap:normal]"
      >
        {opponent(m.opponent)}
      </span>
      <span className="flex items-center gap-2 whitespace-nowrap">
        <bdi data-score="" dir="ltr" className="font-extrabold">
          {m.for}-{m.against}
        </bdi>
        <span className="text-sm">{outcome(m.for, m.against)}</span>
      </span>
    </li>
  );
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
        {season.matches.slice(0, FIRST).map(match)}
      </ol>
      {season.matches.length > FIRST ? (
        // The rest of the season behind one button, open without script (the
        // replay page renders on the server). Its list carries the same name,
        // so a screen reader hears one list of matches in two parts.
        <details className="group">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-full border-2 border-pitch-700 px-5 font-semibold group-open:mb-1 [&::-webkit-details-marker]:hidden">
            {t.result.allMatches}
          </summary>
          <ol
            aria-labelledby="season-matches"
            start={FIRST + 1}
            className="flex flex-col gap-1"
          >
            {season.matches.slice(FIRST).map(match)}
          </ol>
        </details>
      ) : null}
    </section>
  );
}
