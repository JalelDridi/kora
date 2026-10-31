type Props = { strings: Record<"draft" | "respin" | "play", string> };

// "How to play" 30–0 (mobile polish M2), rendered on the server inside the
// help dialog: three short lines.
export function SeasonHelp({ strings }: Props) {
  return (
    <ul className="flex list-disc flex-col gap-3 ps-5 text-base">
      <li>{strings.draft}</li>
      <li>{strings.respin}</li>
      <li>{strings.play}</li>
    </ul>
  );
}
