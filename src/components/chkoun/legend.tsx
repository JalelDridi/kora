import type { Colour } from "@/engine/chkoun/types";

/** Background, text colour and mark of each tile colour (globals.css). */
export const COLOUR_CLASS: Record<Colour, string> = {
  green: "bg-tile-green text-white",
  amber: "bg-tile-amber text-pitch-950",
  grey: "bg-tile-grey text-chalk",
  unknown: "border-2 border-dashed border-chalk-dim bg-pitch-900 text-chalk",
};

/**
 * A mark beside the colour, so a tile never speaks by colour alone (WCAG
 * 1.4.1). "?" tiles already show "?" as their value.
 */
export const COLOUR_MARK: Record<Colour, string> = {
  green: "✓",
  amber: "≈",
  grey: "✕",
  unknown: "?",
};

export const LEGEND_KEY: Record<
  Colour,
  "same" | "close" | "different" | "unknown"
> = {
  green: "same",
  amber: "close",
  grey: "different",
  unknown: "unknown",
};

type Props = {
  title: string;
  words: Record<"same" | "close" | "different" | "unknown", string>;
};

export function Legend({ title, words }: Props) {
  const colours: Colour[] = ["green", "amber", "grey", "unknown"];
  return (
    <section aria-labelledby="chkoun-legend" className="mt-6">
      <h2 id="chkoun-legend" className="text-base font-semibold text-mint">
        {title}
      </h2>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
        {colours.map((colour) => (
          <li key={colour} className="flex items-center gap-2 text-base">
            <span
              aria-hidden="true"
              className={`flex size-7 items-center justify-center rounded-md text-sm font-bold ${COLOUR_CLASS[colour]}`}
            >
              {COLOUR_MARK[colour]}
            </span>
            {words[LEGEND_KEY[colour]]}
          </li>
        ))}
      </ul>
    </section>
  );
}
