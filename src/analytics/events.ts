import type { Line } from "@/engine/chkoun/types";

// The games' few analytics events (design §12, plan Task 15; 30–0: Sprint 3
// Task 14). Cookieless PostHog sends them only when a key is configured:
// the instance is registered by src/instrumentation-client.ts after it
// loads, and until then (or forever, without a key) track() does nothing.
// An event carries only the day's number, the number of guesses, solved or
// not, the share channel and the locale: never a visitor id, a footballer
// or a typed query. A game of yesterday's footballer adds past: true.
// A 30–0 event adds only a slot's line, its rating band, the season's W-D-L
// and its rounded rating (D-S3-13): never a name, an id, a code or a squad.

export const EVENT_NAMES = [
  "chkoun_opened",
  "chkoun_guessed",
  "chkoun_finished",
  "chkoun_shared",
  "chkoun_no_match",
  "season_opened",
  "slot_drafted",
  "respin_used",
  "season_simulated",
  "season_shared",
  "board_viewed",
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

export type EventProps = {
  n?: number;
  guesses?: number;
  solved?: boolean;
  channel?: "system" | "copy" | "whatsapp" | "box";
  locale?: "ar-TN" | "ar-Latn-TN" | "fr";
  line?: Line;
  band?: "60" | "70" | "80" | "90";
  w?: number;
  d?: number;
  l?: number;
  /** Rounded to an integer, 60 to 99. */
  rating?: number;
  /** A game of yesterday's Chkoun? (mobile polish M7). */
  past?: boolean;
};

type Capturer = {
  capture: (name: string, properties: Record<string, unknown>) => unknown;
};

let instance: Capturer | null = null;

export function registerAnalytics(capturer: Capturer | null): void {
  instance = capturer;
}

const CHANNELS = new Set(["system", "copy", "whatsapp", "box"]);
const LOCALES = new Set(["ar-TN", "ar-Latn-TN", "fr"]);
const LINES = new Set(["goalkeeper", "defender", "midfielder", "forward"]);
const BANDS = new Set(["60", "70", "80", "90"]);

/** A season's wins, draws or losses: an integer from 0 to 30. */
function isRecordCount(v: unknown): v is number {
  return Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 30;
}

/** The allowed properties only, each of its own type; anything else is dropped. */
export function cleanProps(props: Record<string, unknown>): EventProps {
  const out: EventProps = {};
  if (Number.isInteger(props.n)) out.n = props.n as number;
  if (Number.isInteger(props.guesses)) out.guesses = props.guesses as number;
  if (typeof props.solved === "boolean") out.solved = props.solved;
  if (typeof props.past === "boolean") out.past = props.past;
  if (typeof props.channel === "string" && CHANNELS.has(props.channel))
    out.channel = props.channel as EventProps["channel"];
  if (typeof props.locale === "string" && LOCALES.has(props.locale))
    out.locale = props.locale as EventProps["locale"];
  if (typeof props.line === "string" && LINES.has(props.line))
    out.line = props.line as Line;
  if (typeof props.band === "string" && BANDS.has(props.band))
    out.band = props.band as EventProps["band"];
  if (isRecordCount(props.w)) out.w = props.w;
  if (isRecordCount(props.d)) out.d = props.d;
  if (isRecordCount(props.l)) out.l = props.l;
  if (typeof props.rating === "number" && Number.isFinite(props.rating)) {
    const rating = Math.round(props.rating);
    if (rating >= 60 && rating <= 99) out.rating = rating;
  }
  return out;
}

/** Sends one event when analytics is on; returns whether it was sent. */
export function track(name: EventName, props: EventProps): boolean {
  if (!instance || !(EVENT_NAMES as readonly string[]).includes(name))
    return false;
  try {
    instance.capture(name, { ...cleanProps(props) });
    return true;
  } catch {
    return false;
  }
}
