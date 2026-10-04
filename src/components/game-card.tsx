type Props = Record<"name" | "pitch" | "badge" | "soon", string>;

export function GameCard({ name, pitch, badge, soon }: Props) {
  return (
    <article className="flex h-full flex-col gap-3 rounded-2xl border border-pitch-700 bg-pitch-900 p-6">
      <p className="self-start rounded-md bg-pitch-800 px-2.5 py-1 text-sm font-semibold text-mint">
        {badge}
      </p>
      {/* bdi isolates the name's direction: "30–0" has no strong character,
          so it stays left to right inside an Arabic layout (decision P7). */}
      <h3 className="text-3xl font-extrabold">
        <bdi>{name}</bdi>
      </h3>
      <p className="text-lg text-chalk-dim">{pitch}</p>
      <p className="mt-auto flex items-center gap-2 pt-4 text-base font-semibold">
        <span aria-hidden="true" className="size-2 rounded-full bg-shirt" />
        {soon}
      </p>
    </article>
  );
}
