import type { Line } from "./types.ts";

/** "Centre-back / Defensive midfielder" → "Centre-back". */
export function firstPosition(text: string): string {
  return text.split(/,|\/|;| or | and | et | ou /i)[0].trim();
}

// Order matters: "half-back" is a midfielder, "wing-back" a defender.
export function lineFromLabel(label: string): Line | null {
  const l = label.toLowerCase();
  if (/goalkeeper|gardien/.test(l)) return "goalkeeper";
  if (/midfield|milieu|wing half|half-back|playmaker|demi/.test(l))
    return "midfielder";
  if (
    /back|defender|sweeper|libero|libéro|stopper|défenseur|latéral|arrière/.test(
      l,
    )
  )
    return "defender";
  if (
    /forward|striker|winger|attacker|attaquant|ailier|avant-centre|buteur/.test(
      l,
    )
  )
    return "forward";
  return null;
}
