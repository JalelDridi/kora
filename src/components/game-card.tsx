import Link from "next/link";

type Props = Record<"name" | "pitch" | "badge" | "soon", string> & {
  /** The game's page once it is live; the card then opens it. */
  href?: string | null;
  play?: string;
};

export function GameCard({ name, pitch, badge, soon, href, play }: Props) {
  return (
    <article
      className={`relative flex h-full flex-col gap-3 rounded-2xl border bg-pitch-900 p-6 ${href ? "border-mint" : "border-pitch-700"}`}
    >
      <p className="self-start rounded-md bg-pitch-800 px-2.5 py-1 text-sm font-semibold text-mint">
        {badge}
      </p>
      {/* bdi isolates the name's direction: "30–0" has no strong character,
          so it stays left to right inside an Arabic layout (decision P7). */}
      <h3 className="text-3xl font-extrabold">
        {href ? (
          // The whole card is the link's target area (its ::after covers
          // the card); the link's name stays the game's name.
          <Link
            href={href}
            prefetch={false}
            className="after:absolute after:inset-0 after:rounded-2xl"
          >
            <bdi>{name}</bdi>
          </Link>
        ) : (
          <bdi>{name}</bdi>
        )}
      </h3>
      <p className="text-lg text-chalk-dim">{pitch}</p>
      {href ? (
        <p
          aria-hidden="true"
          className="mt-auto flex min-h-11 items-center self-start rounded-full bg-mint px-5 text-base font-semibold text-pitch-950"
        >
          {play}
        </p>
      ) : (
        <p className="mt-auto flex items-center gap-2 pt-4 text-base font-semibold">
          <span aria-hidden="true" className="size-2 rounded-full bg-shirt" />
          {soon}
        </p>
      )}
    </article>
  );
}
