import type { DiffLine } from "./overrides-patch.ts";
import type { CuratedId } from "./curated-patch.ts";

// A dashboard commit (T-AD-3): Jalel's, through his token, so no co-author
// line. A conventional subject, one line per change, the note, and a
// trailer that marks it as made on the dashboard (the changes log reads it).

const SUBJECT_MAX = 72;

export function commitMessage(input: {
  file: "overrides" | CuratedId;
  subject: string;
  lines: DiffLine[];
  note: string;
  /** The sha of the commit an undo reverts. */
  reverts?: string;
}): string {
  const full =
    input.reverts === undefined
      ? `data(${input.file}): ${input.subject}`
      : `revert(data): ${input.subject}`;
  const chars = [...full.replace(/\s+/g, " ").trim()];
  const subject =
    chars.length <= SUBJECT_MAX
      ? chars.join("")
      : `${chars.slice(0, SUBJECT_MAX - 1).join("")}…`;
  const parts = [subject];
  if (input.lines.length > 0)
    parts.push(
      input.lines
        .map((l) => `- ${l.path}: ${l.before} → ${l.after}`)
        .join("\n"),
    );
  if (input.note.trim() !== "") parts.push(input.note.trim());
  parts.push(
    [
      `Admin-Edit: ${input.file}`,
      ...(input.reverts === undefined ? [] : [`Reverts: ${input.reverts}`]),
    ].join("\n"),
  );
  return parts.join("\n\n");
}
