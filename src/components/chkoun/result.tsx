import type { ReactNode } from "react";
import type { Card as CardData } from "@/chkoun/attributes";
import { format, localName, type Labels } from "@/chkoun/labels";
import type { Locale } from "@/i18n/locales";
import { Card } from "./card";
import { Countdown } from "./countdown";
import type { GameStrings } from "./game";

type Props = {
  solved: boolean;
  guesses: number;
  card: CardData | null;
  locale: Locale;
  labels: Labels;
  strings: GameStrings;
  sourcesHref: string;
  endsAt: string;
  onNextDay: () => void;
  /** The time to the next footballer; off for yesterday's game. */
  countdown?: boolean;
  /** A link under the record: yesterday's footballer, from today's result. */
  link?: { href: string; text: string } | null;
  /** The share button and the record, under the card. */
  children?: ReactNode;
};

// The end of today's game: the result line, the footballer's card, then
// sharing, the record, yesterday's footballer and the time to the next one.
export function Result({
  solved,
  guesses,
  card,
  locale,
  labels,
  strings,
  sourcesHref,
  endsAt,
  onNextDay,
  countdown = true,
  link = null,
  children,
}: Props) {
  const t = strings.chkoun;
  const heading = solved
    ? format(t.result.won, { n: guesses })
    : format(t.result.lost, { name: card ? localName(card, locale) : "?" });
  return (
    <section aria-labelledby="chkoun-result" className="mt-8">
      {/* Focused when the game ends: the search that held focus is gone. */}
      <h2 id="chkoun-result" tabIndex={-1} className="text-3xl font-extrabold">
        <bdi>{heading}</bdi>
      </h2>
      {card ? (
        <Card
          card={card}
          locale={locale}
          labels={labels}
          strings={{
            card: t.card,
            positions: strings.positions,
            credit: strings.credit,
            abroad: t.tiles.abroad,
            position: t.tiles.position,
          }}
          sourcesHref={sourcesHref}
        />
      ) : null}
      {children}
      {link ? (
        <p className="mt-6">
          <a
            href={link.href}
            data-yesterday-link=""
            className="inline-flex min-h-11 items-center rounded-full border-2 border-mint px-5 text-base font-semibold text-mint hover:bg-pitch-800"
          >
            {link.text}
          </a>
        </p>
      ) : null}
      {countdown ? (
        <Countdown
          endsAt={endsAt}
          template={t.next}
          onZero={onNextDay}
          className="mt-6 text-lg"
        />
      ) : null}
    </section>
  );
}
