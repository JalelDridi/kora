import { format, localName } from "@/chkoun/labels";
import type { Locale } from "@/i18n/locales";
import { capsBandText, ratingBand } from "@/season/labels";
import type { CandidateView } from "@/season/views";
import type { SeasonStrings } from "./island";

type Props = {
  candidate: CandidateView;
  locale: Locale;
  strings: SeasonStrings;
  disabled: boolean;
  onPick: (id: string) => void;
};

// One footballer of a spin (plan Task 10): his name, his rating and the
// inputs behind it, all as text (no colour carries meaning alone), and the
// button that picks him, named after him.
export function CandidateCard({
  candidate,
  locale,
  strings: t,
  disabled,
  onPick,
}: Props) {
  const { names, rating, inputs, doubt } = candidate;
  const name = localName(names, locale);
  const latin = name !== names.nameLatin ? names.nameLatin : null;
  const rows: [string, string][] = [
    [
      t.inputs.caps,
      inputs.capsFromBand
        ? format(t.inputs.band, { band: capsBandText(inputs.caps) })
        : String(inputs.caps),
    ],
    [
      t.inputs.goalsPerCap,
      `${inputs.goalsPerCap.toFixed(2)}${inputs.goalsDoubt ? " ?" : ""}`,
    ],
    [
      t.inputs.apps,
      inputs.apps === null
        ? "?"
        : `${inputs.apps}${inputs.historyDoubt ? " ?" : ""}`,
    ],
    [t.inputs.titles, format(t.inputs.titlesValue, inputs.titles)],
  ];
  return (
    <li
      data-candidate={candidate.id}
      data-band={ratingBand(rating)}
      className="flex flex-col gap-2 rounded-xl border-s-4 border-mint bg-pitch-800 p-3 data-[band=60]:border-tile-grey data-[band=70]:border-chalk-dim data-[band=90]:border-tile-amber"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p data-name className="text-lg font-bold break-words">
            <bdi>{name}</bdi>
          </p>
          {latin ? (
            <p lang="en" dir="ltr" className="text-sm text-chalk-dim">
              <bdi>{latin}</bdi>
            </p>
          ) : null}
        </div>
        <p className="flex shrink-0 flex-col items-center leading-tight">
          <span className="text-sm text-chalk-dim">{t.rating}</span>
          <span data-rating className="text-2xl font-extrabold">
            {rating}
          </span>
        </p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-chalk-dim">{label}</dt>
            <dd className="font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      {inputs.afcon2004 ? (
        <p className="text-sm font-semibold">{t.inputs.afcon}</p>
      ) : null}
      {doubt ? (
        <p className="text-sm text-chalk-dim">{t.inputs.doubt}</p>
      ) : null}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onPick(candidate.id)}
        className="min-h-11 rounded-full bg-mint px-5 font-semibold text-pitch-950 disabled:opacity-60"
      >
        {t.pick}
        <span className="sr-only">
          {" "}
          <bdi>{name}</bdi>
        </span>
      </button>
    </li>
  );
}
