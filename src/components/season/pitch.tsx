import type { Line } from "@/engine/chkoun/types";
import { localName } from "@/chkoun/labels";
import type { Locale } from "@/i18n/locales";
import { SLOT_LINES } from "@/season/labels";
import type { CandidateView } from "@/season/views";
import type { SeasonStrings } from "./island";

type Props = {
  squad: CandidateView[];
  /** The place being drafted, or null once the eleven are in. */
  current: number | null;
  locale: Locale;
  strings: SeasonStrings;
};

/** Forwards first: the pitch as seen from the stands, attack at the top. */
const ROWS: readonly Line[] = [
  "forward",
  "midfielder",
  "defender",
  "goalkeeper",
];

export const SQUAD_HEADING = "season-squad";

// The visitor's eleven (plan Task 10): four rows, each a list of its places
// in the page's direction, with the line, the name (the Latin name under
// it on /ar) and the rating. Logical properties only.
export function Pitch({ squad, current, locale, strings: t }: Props) {
  const slots = SLOT_LINES.map((line, slot) => ({ line, slot }));
  return (
    <section
      aria-labelledby={SQUAD_HEADING}
      className="flex flex-col gap-3 rounded-2xl bg-pitch-800 p-2 sm:p-3"
    >
      <h2 id={SQUAD_HEADING} className="text-xl font-bold">
        {t.squad}
      </h2>
      {ROWS.map((row) => (
        <ol key={row} className="flex justify-center gap-1">
          {slots
            .filter((s) => s.line === row)
            .map(({ slot }) => {
              const picked = squad[slot];
              const name = picked ? localName(picked.names, locale) : null;
              const latin =
                picked && name !== picked.names.nameLatin
                  ? picked.names.nameLatin
                  : null;
              return (
                <li
                  key={slot}
                  data-line={row}
                  data-picked={picked ? "" : undefined}
                  aria-current={slot === current ? "step" : undefined}
                  className="flex min-w-0 max-w-40 flex-1 basis-0 flex-col items-center gap-0.5 rounded-lg bg-pitch-900 px-0.5 py-2 sm:px-1 text-center aria-[current=step]:outline-2 aria-[current=step]:outline-mint"
                >
                  <span className="text-xs text-chalk-dim">{t.lines[row]}</span>
                  {picked ? (
                    <>
                      <span className="text-xs font-semibold break-words sm:text-sm">
                        <bdi>{name}</bdi>
                      </span>
                      {latin ? (
                        <span
                          lang="en"
                          dir="ltr"
                          className="text-[0.6875rem] text-chalk-dim break-words sm:text-xs"
                        >
                          <bdi>{latin}</bdi>
                        </span>
                      ) : null}
                      <span className="text-base font-extrabold">
                        <span className="sr-only">{t.rating} </span>
                        {picked.rating}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-chalk-dim sm:text-sm">
                      {t.empty}
                    </span>
                  )}
                </li>
              );
            })}
        </ol>
      ))}
    </section>
  );
}
