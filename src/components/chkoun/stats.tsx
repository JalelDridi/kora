import { distribution, type Stats as StatsRecord } from "@/engine/chkoun/stats";

export type StatsStrings = {
  title: string;
  streak: string;
  best: string;
  played: string;
  winRate: string;
  onDevice: string;
  onServer: string;
  distribution: string;
  /** One bar for screen readers: "{n}" guesses, "{count}" wins. */
  bar: string;
};

type Props = {
  stats: StatsRecord;
  /** Where the record is kept: on Kora (Redis on) or on this device only. */
  store: "server" | "device";
  /** Today's puzzle number: the bar of today's win is marked. */
  today: number | null;
  strings: StatsStrings;
  /**
   * "result": under the game's result, with its own heading. "dialog":
   * inside the record dialog (stats-dialog.tsx), whose title names it.
   */
  place?: "result" | "dialog";
};

const fill = (template: string, values: Record<string, number>) =>
  template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );

// The visitor's record, by puzzle number (plan Task 13): from the server
// when it kept the game, from this device otherwise, and it says which.
// Under the four numbers, the wins by number of guesses (mobile polish M3).
export function Stats({
  stats,
  store,
  today,
  strings,
  place = "result",
}: Props) {
  const rate =
    stats.played === 0 ? 0 : Math.round((stats.won / stats.played) * 100);
  const items: [string, string][] = [
    [strings.streak, String(stats.streak)],
    [strings.best, String(stats.best)],
    [strings.played, String(stats.played)],
    [strings.winRate, `${rate}%`],
  ];
  const inDialog = place === "dialog";
  const card = inDialog ? "bg-pitch-800" : "bg-pitch-900";
  const id = inDialog ? "chkoun-stats-dialog" : "chkoun-stats";
  const numbers = (
    <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(([label, value]) => (
        <div
          key={label}
          className={`flex flex-col-reverse rounded-xl p-3 ${card}`}
        >
          <dt className="text-sm text-chalk-dim">{label}</dt>
          <dd className="text-3xl font-extrabold tabular-nums">
            <bdi>{value}</bdi>
          </dd>
        </div>
      ))}
    </dl>
  );
  const body = (
    <>
      {numbers}
      <Distribution
        id={`${id}-distribution`}
        heading={inDialog ? "h3" : "h4"}
        stats={stats}
        today={today}
        strings={strings}
      />
      <p data-store={store} className="mt-3 text-sm text-chalk-dim">
        {store === "server" ? strings.onServer : strings.onDevice}
      </p>
    </>
  );
  if (inDialog) return <div>{body}</div>;
  return (
    <section aria-labelledby={id} className="mt-6">
      <h3 id={id} className="text-xl font-semibold text-mint">
        {strings.title}
      </h3>
      {body}
    </section>
  );
}

/**
 * Eight rows, 1 to 8 guesses: the number, then a bar as long as its share of
 * the most frequent, its count inside. Today's win is in mint, bold and
 * outlined, and `aria-current` for screen readers: never by colour alone.
 */
function Distribution({
  id,
  heading: Heading,
  stats,
  today,
  strings,
}: {
  id: string;
  /** One level under its parent: the dialog's h2 or the result's h3. */
  heading: "h3" | "h4";
  stats: StatsRecord;
  today: number | null;
  strings: StatsStrings;
}) {
  return (
    <div className="mt-4">
      <Heading id={id} className="text-base font-semibold">
        {strings.distribution}
      </Heading>
      <ol aria-labelledby={id} className="mt-2 flex flex-col gap-1.5">
        {distribution(stats, today).map((bar) => (
          <li
            key={bar.guesses}
            data-bar={bar.guesses}
            data-today={bar.today ? "" : undefined}
            aria-current={bar.today ? "true" : undefined}
            className="flex items-center gap-2"
          >
            <span
              aria-hidden="true"
              className="inline-4 shrink-0 text-center text-base font-semibold tabular-nums"
            >
              {bar.guesses}
            </span>
            <span aria-hidden="true" className="min-w-0 flex-1">
              <span
                className={`flex h-7 items-center justify-end rounded-md px-2 text-sm tabular-nums ${
                  bar.today
                    ? "bg-mint font-extrabold text-pitch-950 outline-2 outline-offset-2 outline-chalk"
                    : "bg-pitch-700 font-semibold text-chalk"
                }`}
                style={{
                  inlineSize: `max(1.75rem, ${Math.round(bar.share * 100)}%)`,
                }}
              >
                {bar.count}
              </span>
            </span>
            <span className="sr-only">
              {fill(strings.bar, { n: bar.guesses, count: bar.count })}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
