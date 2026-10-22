import { format, localName } from "@/chkoun/labels";
import type { Locale } from "@/i18n/locales";
import { decadeLabel } from "@/season/labels";
import type { SpinView } from "@/season/views";
import { CandidateCard } from "./candidate-card";
import type { SeasonStrings } from "./island";

type Props = {
  spin: SpinView;
  locale: Locale;
  strings: SeasonStrings;
  respinLeft: boolean;
  pending: boolean;
  onPick: (id: string) => void;
  onRespin: () => void;
};

export const SPIN_HEADING = "season-spin";

// The current place (plan Task 10): which place, the spun club and decade,
// a line when the spin had to widen (D-S3-2), the candidates, and the one
// re-spin of the game.
export function SpinPanel({
  spin,
  locale,
  strings: t,
  respinLeft,
  pending,
  onPick,
  onRespin,
}: Props) {
  /** The season strings by key, filled: what decadeLabel expects. */
  const tr = (key: string, values?: Record<string, number>) =>
    format(String((t as Record<string, unknown>)[key] ?? key), values ?? {});
  return (
    <section aria-labelledby={SPIN_HEADING} className="flex flex-col gap-3">
      <h2
        id={SPIN_HEADING}
        tabIndex={-1}
        className="flex flex-wrap gap-x-2 text-2xl font-extrabold"
      >
        <span>{format(t.slot, { n: spin.slot + 1 })}</span>
        <span className="text-mint">{t.lines[spin.line]}</span>
      </h2>
      <p className="text-xl font-semibold">
        <bdi>{localName(spin.club, locale)}</bdi>
        {" · "}
        <span>{decadeLabel(spin.decade, tr)}</span>
      </p>
      {spin.widened ? <p className="text-base">{t.widened}</p> : null}
      <ul className="flex flex-col gap-3">
        {spin.candidates.map((c) => (
          <CandidateCard
            key={c.id}
            candidate={c}
            locale={locale}
            strings={t}
            disabled={pending}
            onPick={onPick}
          />
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!respinLeft || pending}
          onClick={onRespin}
          className="min-h-11 rounded-full border border-mint px-5 font-semibold text-mint disabled:border-tile-grey disabled:text-chalk-dim"
        >
          {t.respin}
        </button>
        {respinLeft ? null : (
          <p className="text-base text-chalk-dim">{t.respinUsed}</p>
        )}
      </div>
    </section>
  );
}
