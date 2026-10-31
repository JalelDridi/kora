import type { ReactNode } from "react";
import type { Arrow, TileRow as Row } from "@/engine/chkoun/types";
import {
  COLUMNS,
  tileText,
  type Labels,
  type TileColumn,
  type TileStrings,
} from "@/chkoun/labels";
import { COLOUR_CLASS, COLOUR_MARK, LEGEND_KEY } from "./legend";

export type RowStrings = TileStrings & {
  /** Each column's name, as a screen reader says it with every tile. */
  headers: Record<TileColumn, string>;
  /** Each column's short name, shown once in the header row (D-MP-1). */
  heads: Record<TileColumn, string>;
  words: Record<"same" | "close" | "different" | "unknown", string>;
  arrows: Record<"older" | "younger" | "moreCaps" | "fewerCaps", string>;
};

type Props = {
  /** The guessed footballer's id: the visitor's own guess. */
  id: string;
  name: string;
  /** The Latin name under a name in Arabic script; null when the same. */
  latin: string | null;
  row: Row;
  labels: Labels;
  strings: RowStrings;
  /** True for a row just guessed: its tiles flip in (unless reduced motion). */
  animate: boolean;
};

function arrowLabel(
  column: TileColumn,
  arrow: Arrow,
  arrows: RowStrings["arrows"],
): string | null {
  if (arrow === null) return null;
  if (column === "age") return arrow === "up" ? arrows.older : arrows.younger;
  if (column === "caps")
    return arrow === "up" ? arrows.moreCaps : arrows.fewerCaps;
  return null;
}

// One guess: the footballer's name, then six tiles in the page's direction
// (club first: on the right in /ar, on the left in /tn and /fr). Each tile
// says its column, its value and its colour in words for screen readers,
// and shows a mark beside the colour for everyone.
export function TileRow({
  id,
  name,
  latin,
  row,
  labels,
  strings,
  animate,
}: Props) {
  return (
    <li data-guess={id} className="flex flex-col gap-1.5">
      <p className="flex flex-wrap items-baseline gap-x-2 text-base font-semibold">
        <bdi>{name}</bdi>
        {latin ? (
          <span dir="ltr" className="text-sm font-normal text-chalk-dim">
            {latin}
          </span>
        ) : null}
      </p>
      <Tiles
        name={name}
        row={row}
        labels={labels}
        strings={strings}
        animate={animate}
      />
    </li>
  );
}

/**
 * The grid of the header row and of every guess (D-MP-1, Jalel's approved
 * mock): from 340 px, six narrow columns in one row, sized to what each
 * holds; under 340 px, 3 by 2. Header and rows share the tracks, so the
 * columns line up.
 */
const GRID =
  "grid grid-cols-3 gap-[3px] min-[340px]:grid-cols-[minmax(0,59fr)_minmax(0,62fr)_minmax(0,56fr)_minmax(0,34fr)_minmax(0,48fr)_minmax(0,60fr)]";

/**
 * The six tiles of a row, in the page's direction. Each shows its short
 * value at 14 px or more; the whole value is in its title and its
 * screen-reader text, with the column's name. Under 340 px each tile also
 * shows its column's icon.
 */
function Tiles({
  name,
  row,
  labels,
  strings,
  animate,
  example = false,
}: {
  /** The list's name; none for the example, whose figcaption names it. */
  name?: string;
  row: Row;
  labels: Labels;
  strings: RowStrings;
  animate: boolean;
  example?: boolean;
}) {
  return (
    <ul
      data-example={example ? "" : undefined}
      aria-label={name}
      className={GRID}
    >
      {COLUMNS.map((column, i) => {
        const tile = row[column];
        const { text, short, label } = tileText(column, tile, labels, strings);
        const arrow = arrowLabel(column, tile.arrow, strings.arrows);
        const numeric = column === "age" || column === "caps";
        return (
          <li
            key={column}
            data-column={column}
            data-colour={tile.colour}
            title={text}
            style={animate ? { animationDelay: `${i * 60}ms` } : undefined}
            className={`relative flex min-h-11 min-w-0 flex-col items-center justify-center gap-px rounded-md px-px py-1 text-center leading-tight max-[340px]:min-h-14 ${COLOUR_CLASS[tile.colour]} ${animate ? "tile-flip" : ""}`}
          >
            <ColumnIcon
              column={column}
              className="hidden opacity-85 max-[340px]:block"
            />
            <span data-header className="sr-only">
              {strings.headers[column]}:{" "}
            </span>
            <span
              data-value
              aria-hidden="true"
              dir={numeric ? "ltr" : "auto"}
              className="max-w-full text-sm font-semibold"
            >
              <Words text={short} />
            </span>
            <span className="sr-only">{label ?? text}</span>
            <span className="flex items-center gap-1 text-sm leading-none font-bold">
              {arrow ? (
                <span role="img" aria-label={arrow}>
                  {tile.arrow === "up" ? "↑" : "↓"}
                </span>
              ) : null}
              {tile.colour !== "unknown" ? (
                <span aria-hidden="true">{COLOUR_MARK[tile.colour]}</span>
              ) : null}
            </span>
            <span className="sr-only">
              , {strings.words[LEGEND_KEY[tile.colour]]}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** The help's example: a guess beside an answer of the same club country and line, older. */
const EXAMPLE_ROW: Row = {
  club: { colour: "grey", arrow: null, value: "example-club" },
  country: { colour: "green", arrow: null, value: "TN" },
  position: { colour: "green", arrow: null, value: "midfielder" },
  age: { colour: "amber", arrow: "up", value: 24 },
  caps: { colour: "grey", arrow: "down", value: 2 },
  governorate: { colour: "unknown", arrow: null, value: null },
};

/**
 * One fixed row for the "how to play" dialog (mobile polish M2), read as an
 * example: the club grey, its country and the line green, the age amber with
 * the answer older, the caps grey with fewer, the birthplace unknown.
 */
export function ExampleRow({
  club,
  country,
  caption,
  strings,
}: {
  /** The example club's and the club country's names in the page's locale. */
  club: string;
  country: string;
  caption: string;
  strings: RowStrings;
}) {
  const labels: Labels = {
    clubs: { "example-club": club },
    short: {},
    countries: { TN: country },
    governorates: {},
  };
  return (
    <figure className="flex flex-col gap-1">
      <TileHeaders heads={strings.heads} example />
      <Tiles
        row={EXAMPLE_ROW}
        labels={labels}
        strings={strings}
        animate={false}
        example
      />
      <figcaption className="mt-1 text-base text-chalk-dim">
        {caption}
      </figcaption>
    </figure>
  );
}

/**
 * Text that wraps only between words. Each word is its own box: a word wider
 * than the tile (a long club name) is cut with an ellipsis instead of being
 * broken across lines; the tile's title and its screen-reader text keep the
 * whole value. No automatic hyphenation either.
 */
function Words({ text }: { text: string }) {
  return text.split(/(\s+)/).map((part, i) =>
    /^\s+$/.test(part) || part === "" ? (
      part
    ) : (
      <span
        key={i}
        className="inline-block max-w-full overflow-hidden align-bottom text-ellipsis whitespace-nowrap"
      >
        {part}
      </span>
    ),
  );
}

/** Each column's icon (D-MP-1): shield, flag, pitch, calendar, star, pin. */
const ICON_PATHS: Record<TileColumn, ReactNode> = {
  club: <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z" />,
  country: (
    <>
      <path d="M5 21V4" />
      <path d="M5 4h11l-2 4 2 4H5" />
    </>
  ),
  position: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <path d="M12 5v14" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  age: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </>
  ),
  caps: (
    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
  ),
  governorate: (
    <>
      <path d="M12 21s-6-5.6-6-10.5a6 6 0 0112 0C18 15.4 12 21 12 21z" />
      <circle cx="12" cy="10.5" r="2" />
    </>
  ),
};

function ColumnIcon({
  column,
  className = "",
}: {
  column: TileColumn;
  className?: string;
}) {
  return (
    <svg
      data-icon
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      {ICON_PATHS[column]}
    </svg>
  );
}

/**
 * The header row, once above the rows (D-MP-1): each column's icon and short
 * name at 14 px, on the same tracks as the tiles; 3 by 2 under 340 px.
 * Hidden from screen readers, which hear the column's full name with every
 * tile.
 */
export function TileHeaders({
  heads,
  example = false,
}: {
  heads: Record<TileColumn, string>;
  /** The help's example: not the game's header row. */
  example?: boolean;
}) {
  return (
    <div
      data-tile-headers={example ? undefined : ""}
      aria-hidden="true"
      className={`${GRID} max-[340px]:gap-y-1.5`}
    >
      {COLUMNS.map((column) => (
        <span
          key={column}
          data-head
          className="flex min-w-0 flex-col items-center gap-0.5 text-center text-sm leading-tight text-chalk-dim max-[340px]:flex-row max-[340px]:justify-center max-[340px]:gap-1"
        >
          <ColumnIcon column={column} />
          <span className="max-w-full">
            <Words text={heads[column]} />
          </span>
        </span>
      ))}
    </div>
  );
}
