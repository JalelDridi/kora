import type { Stats as StatsRecord } from "@/engine/chkoun/stats";

type Props = {
  stats: StatsRecord;
  /** Where the record is kept: on Kora (Redis on) or on this device only. */
  store: "server" | "device";
  strings: {
    title: string;
    streak: string;
    best: string;
    played: string;
    winRate: string;
    onDevice: string;
    onServer: string;
  };
};

// The visitor's record, by puzzle number (plan Task 13): from the server
// when it kept the game, from this device otherwise, and it says which.
export function Stats({ stats, store, strings }: Props) {
  const rate =
    stats.played === 0 ? 0 : Math.round((stats.won / stats.played) * 100);
  const items: [string, string][] = [
    [strings.streak, String(stats.streak)],
    [strings.best, String(stats.best)],
    [strings.played, String(stats.played)],
    [strings.winRate, `${rate}%`],
  ];
  return (
    <section aria-labelledby="chkoun-stats" className="mt-6">
      <h3 id="chkoun-stats" className="text-xl font-semibold text-mint">
        {strings.title}
      </h3>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map(([label, value]) => (
          <div
            key={label}
            className="flex flex-col-reverse rounded-xl bg-pitch-900 p-3"
          >
            <dt className="text-sm text-chalk-dim">{label}</dt>
            <dd className="text-3xl font-extrabold tabular-nums">
              <bdi>{value}</bdi>
            </dd>
          </div>
        ))}
      </dl>
      <p data-store={store} className="mt-2 text-sm text-chalk-dim">
        {store === "server" ? strings.onServer : strings.onDevice}
      </p>
    </section>
  );
}
