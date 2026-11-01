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
      <p
        className={`flex flex-wrap items-baseline gap-x-2 text-base font-semibold ${NAME_INSET}`}
      >
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
 * mock): from 375 px, six narrow columns in one row; under 375 px, 3 by 2,
 * with the column's icon in each tile. Header and rows share the tracks, so
 * the columns line up. Each track holds the widest word its column can show
 * at 14 px with slack for other renderers (fix round 2: GitHub's Chromium
 * draws text 1 to 3 px wider than ours). Measured here on the pool of
 * 1 November 2026, widest word (track at 375 px): club "Yarmouk" 60.1 px
 * (66), country "Danemark" 69.4 (75), line "Mhajem" 54.1 (59), age the
 * header "3omr" 34.6 (39), caps "30-59" 42.2 (47), birthplace "Danemark" /
 * "Zaghouan" 69.4 (75): at least 4 px of slack at 375 px, 10 at 412.
 * Between 375 and 440 px the board takes the side gutter down to 4 px and
 * the gaps to 1 px so the six fit. The browser tests measure every value the
 * pool can show against these tracks. The help's example stays 3 by 2.
 */
const LAYOUT = {
  game: {
    grid: "grid grid-cols-3 gap-[2px] min-[375px]:max-[440px]:gap-[1px] min-[375px]:grid-cols-[minmax(0,66fr)_minmax(0,75fr)_minmax(0,59fr)_minmax(0,39fr)_minmax(0,47fr)_minmax(0,75fr)]",
    tile: "min-h-11 max-[375px]:min-h-14",
    icon: "hidden max-[375px]:block",
    headers: "max-[375px]:gap-y-1.5",
    head: "flex-col gap-0.5 max-[375px]:flex-row max-[375px]:justify-center max-[375px]:gap-1",
  },
  example: {
    grid: "grid grid-cols-3 gap-[2px]",
    tile: "min-h-14",
    icon: "block",
    headers: "gap-y-1.5",
    head: "flex-row justify-center gap-1",
  },
} as const;

/** Between 375 and 440 px the board takes the 17 px side gutter down to 4 px (see LAYOUT). */
export const BOARD_BLEED = "min-[375px]:max-[440px]:-mx-[13px]";
const NAME_INSET = "min-[375px]:max-[440px]:px-[13px]";

/**
 * The six tiles of a row, in the page's direction. Each shows its short
 * value at 14 px, never cut; the whole value is in its title and its
 * screen-reader text, with the column's name. In 3 by 2 each tile also shows
 * its column's icon.
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
  const layout = LAYOUT[example ? "example" : "game"];
  return (
    <ul
      data-example={example ? "" : undefined}
      aria-label={name}
      className={layout.grid}
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
            className={`relative flex min-w-0 flex-col items-center justify-center gap-px rounded-md py-1 text-center leading-tight ${layout.tile} ${COLOUR_CLASS[tile.colour]} ${animate ? "tile-flip" : ""}`}
          >
            <ColumnIcon
              column={column}
              className={`opacity-85 ${layout.icon}`}
            />
            <span data-header className="sr-only">
              {strings.headers[column]}:{" "}
            </span>
            <span
              data-value
              aria-hidden="true"
              dir={numeric ? "ltr" : "auto"}
              className="max-w-full text-[14px] font-semibold"
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
 * Text that wraps only between words. Each word is its own box, never broken
 * and never cut: the columns are sized so every word the pool can show fits
 * (LAYOUT), and a word that did not would overflow its box, where the
 * browser tests see it. No automatic hyphenation either.
 */
function Words({ text }: { text: string }) {
  return text.split(/(\s+)/).map((part, i) =>
    /^\s+$/.test(part) || part === "" ? (
      part
    ) : (
      <span
        key={i}
        data-word=""
        className="inline-block max-w-full align-bottom whitespace-nowrap"
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
 * name at 14 px, on the same tracks as the tiles; 3 by 2 under 375 px.
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
  const layout = LAYOUT[example ? "example" : "game"];
  return (
    <div
      data-tile-headers={example ? undefined : ""}
      aria-hidden="true"
      className={`${layout.grid} ${layout.headers}`}
    >
      {COLUMNS.map((column) => (
        <span
          key={column}
          data-head
          className={`flex min-w-0 items-center text-center text-[14px] leading-tight text-chalk-dim ${layout.head}`}
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
