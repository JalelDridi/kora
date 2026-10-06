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
  headers: Record<TileColumn, string>;
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
      {/* Six columns from 400 px; below, 3 by 2 so every word fits (about
          90 px a tile), each tile showing its own column name. */}
      <ul
        aria-label={name}
        className="grid grid-cols-3 gap-1 min-[400px]:grid-cols-6"
      >
        {COLUMNS.map((column, i) => {
          const tile = row[column];
          const { text, label } = tileText(column, tile, labels, strings);
          const arrow = arrowLabel(column, tile.arrow, strings.arrows);
          const numeric = column === "age" || column === "caps";
          return (
            <li
              key={column}
              data-column={column}
              data-colour={tile.colour}
              style={animate ? { animationDelay: `${i * 120}ms` } : undefined}
              className={`relative flex min-h-16 min-w-0 flex-col items-center justify-center rounded-md px-0.5 py-1 text-center text-xs leading-tight ${COLOUR_CLASS[tile.colour]} ${animate ? "tile-flip" : ""}`}
            >
              <span
                data-header
                className="text-[0.7rem] leading-tight min-[400px]:sr-only"
              >
                {strings.headers[column]}
                <span className="sr-only">: </span>
              </span>
              <span
                data-value
                dir={numeric ? "ltr" : undefined}
                className="font-semibold [overflow-wrap:break-word] hyphens-auto"
              >
                {text}
              </span>
              {arrow ? (
                <span
                  role="img"
                  aria-label={arrow}
                  className="text-sm font-bold"
                >
                  {tile.arrow === "up" ? "↑" : "↓"}
                </span>
              ) : null}
              {tile.colour !== "unknown" ? (
                <span aria-hidden="true" className="text-[0.7rem] font-bold">
                  {COLOUR_MARK[tile.colour]}
                </span>
              ) : null}
              <span className="sr-only">
                {label ? `, ${label}` : ""},{" "}
                {strings.words[LEGEND_KEY[tile.colour]]}
              </span>
            </li>
          );
        })}
      </ul>
    </li>
  );
}

/** The six column headers, once above the rows (screen readers get them per tile). */
export function TileHeaders({
  headers,
}: {
  headers: Record<TileColumn, string>;
}) {
  return (
    <div
      aria-hidden="true"
      className="hidden gap-1 min-[400px]:grid min-[400px]:grid-cols-6"
    >
      {COLUMNS.map((column) => (
        <span
          key={column}
          className="min-w-0 text-center text-[0.7rem] leading-tight text-chalk-dim [overflow-wrap:break-word] hyphens-auto"
        >
          {headers[column]}
        </span>
      ))}
    </div>
  );
}
