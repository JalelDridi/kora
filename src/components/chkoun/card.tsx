import type { ReactNode } from "react";
import type { Card as CardData } from "@/chkoun/attributes";
import { birthText, localName, type Labels } from "@/chkoun/labels";
import type { Locale } from "@/i18n/locales";
import type fr from "../../../messages/fr.json";

type Props = {
  card: CardData;
  locale: Locale;
  labels: Labels;
  strings: {
    card: (typeof fr)["chkoun"]["card"];
    positions: (typeof fr)["positions"];
    credit: (typeof fr)["credit"];
    abroad: string;
    /** The position column's header, reused as the card's label. */
    position: string;
  };
  sourcesHref: string;
};

/** A template with {placeholders} filled by elements (links). */
export function fillNodes(
  template: string,
  values: Record<string, ReactNode>,
): ReactNode[] {
  return template
    .split(/(\{\w+\})/)
    .map((part, i) =>
      /^\{\w+\}$/.test(part) ? (
        <span key={i}>{values[part.slice(1, -1)] ?? part}</span>
      ) : (
        part
      ),
    );
}

function wikiUrl(lang: "en" | "fr", title: string): string {
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`;
}

function Silhouette({ label }: { label: string }) {
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 110 146"
      className="h-[146px] w-[110px] shrink-0 rounded-xl bg-pitch-800"
    >
      <circle cx="55" cy="50" r="24" fill="#3d4a43" />
      <path d="M13 146c2-36 20-56 42-56s40 20 42 56z" fill="#3d4a43" />
    </svg>
  );
}

// The day's footballer once a game has ended (D-S2-9): names, club, birth,
// exact caps and goals, and the photo with its credit, or a silhouette.
// The photo is a plain img of the copied Commons file: it is requested only
// now, after the end, so its path never travels before.
export function Card({ card, locale, labels, strings, sourcesHref }: Props) {
  const name = localName(card, locale);
  const club = card.clubId ? labels.clubs[card.clubId] : undefined;
  const link = "text-mint underline underline-offset-2";
  const photo = card.photo;
  return (
    <article
      aria-label={name}
      className="mt-4 flex flex-col gap-4 rounded-2xl border border-pitch-700 bg-pitch-900 p-4 sm:flex-row"
    >
      <figure className="flex shrink-0 flex-col gap-2">
        {photo ? (
          // A copied, credited Commons thumbnail, served as it is (P30): no
          // image optimization, no crop.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo.path}
            alt={name}
            width={110}
            height={146}
            loading="lazy"
            className="h-[146px] w-[110px] rounded-xl object-cover"
          />
        ) : (
          <Silhouette label={strings.card.noPhoto} />
        )}
        {photo ? (
          <figcaption className="max-w-[16rem] text-sm text-chalk-dim">
            {fillNodes(
              photo.author
                ? strings.credit.photo
                : strings.credit.photoNoAuthor,
              {
                author: (
                  <a href={photo.sourceUrl} className={link}>
                    <bdi>{photo.author}</bdi>
                  </a>
                ),
                licence: photo.licenceUrl ? (
                  <a href={photo.licenceUrl} className={link}>
                    <bdi>{photo.licence}</bdi>
                  </a>
                ) : (
                  <a href={photo.sourceUrl} className={link}>
                    <bdi>{photo.licence}</bdi>
                  </a>
                ),
              },
            )}
          </figcaption>
        ) : null}
      </figure>
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-2xl font-extrabold">
          <bdi>{name}</bdi>
        </p>
        {name !== card.nameLatin ? (
          <p dir="ltr" className="text-base text-chalk-dim">
            {card.nameLatin}
          </p>
        ) : null}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-base">
          {club ? (
            <>
              <dt className="text-chalk-dim">{strings.card.club}</dt>
              <dd>
                <bdi>{club}</bdi>
              </dd>
            </>
          ) : null}
          <dt className="text-chalk-dim">{strings.position}</dt>
          <dd>{strings.positions[card.line]}</dd>
          {card.birth ? (
            <>
              <dt className="text-chalk-dim">{strings.card.born}</dt>
              <dd>
                <bdi>{birthText(card.birth, labels, strings)}</bdi>
              </dd>
            </>
          ) : null}
          <dt className="text-chalk-dim">{strings.card.caps}</dt>
          <dd className="tabular-nums">{card.caps}</dd>
          <dt className="text-chalk-dim">{strings.card.goals}</dt>
          <dd className="tabular-nums">{card.goals}</dd>
        </dl>
        <p className="text-sm text-chalk-dim">
          {strings.credit.facts}
          {card.wiki.en ? (
            <>
              {" "}
              <a
                href={wikiUrl("en", card.wiki.en)}
                hrefLang="en"
                className={link}
              >
                en
              </a>
            </>
          ) : null}
          {card.wiki.fr ? (
            <>
              {" "}
              <a
                href={wikiUrl("fr", card.wiki.fr)}
                hrefLang="fr"
                className={link}
              >
                fr
              </a>
            </>
          ) : null}
          {" · "}
          <a href={sourcesHref} className={link}>
            {strings.credit.sources}
          </a>
        </p>
      </div>
    </article>
  );
}
