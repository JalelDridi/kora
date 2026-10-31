import { ExampleRow, type RowStrings } from "./tile-row";
import { Legend } from "./legend";

export type ChkounHelpStrings = {
  goal: string;
  tiles: string;
  example: string;
  daily: string;
  legend: {
    title: string;
    words: Record<"same" | "close" | "different" | "unknown", string>;
  };
};

type Props = {
  strings: ChkounHelpStrings;
  /** The example row: its club and club country's names, and the tiles' words. */
  example: { club: string; country: string; strings: RowStrings };
};

// "How to play" Chkoun? (mobile polish M2), rendered on the server inside the
// help dialog: the goal, the six columns in one sentence, one example row,
// the colours, the daily reset.
export function ChkounHelp({ strings, example }: Props) {
  return (
    <div className="flex flex-col gap-4 text-base">
      <p>{strings.goal}</p>
      <p>{strings.tiles}</p>
      <ExampleRow
        club={example.club}
        country={example.country}
        caption={strings.example}
        strings={example.strings}
      />
      <Legend
        id="chkoun-help-legend"
        title={strings.legend.title}
        words={strings.legend.words}
      />
      <p>{strings.daily}</p>
    </div>
  );
}
