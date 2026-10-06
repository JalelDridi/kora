// The game's few analytics events (design §12, plan Task 15). Cookieless
// PostHog sends them only when a key is configured: the instance is
// registered by src/instrumentation-client.ts after it loads, and until
// then (or forever, without a key) track() does nothing. An event carries
// only the day's number, the number of guesses, solved or not, the share
// channel and the locale: never a visitor id, a footballer or a typed query.

export const EVENT_NAMES = [
  "chkoun_opened",
  "chkoun_guessed",
  "chkoun_finished",
  "chkoun_shared",
  "chkoun_no_match",
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

export type EventProps = {
  n?: number;
  guesses?: number;
  solved?: boolean;
  channel?: "system" | "copy" | "whatsapp" | "box";
  locale?: "ar-TN" | "ar-Latn-TN" | "fr";
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

/** The allowed properties only, each of its own type; anything else is dropped. */
export function cleanProps(props: Record<string, unknown>): EventProps {
  const out: EventProps = {};
  if (Number.isInteger(props.n)) out.n = props.n as number;
  if (Number.isInteger(props.guesses)) out.guesses = props.guesses as number;
  if (typeof props.solved === "boolean") out.solved = props.solved;
  if (typeof props.channel === "string" && CHANNELS.has(props.channel))
    out.channel = props.channel as EventProps["channel"];
  if (typeof props.locale === "string" && LOCALES.has(props.locale))
    out.locale = props.locale as EventProps["locale"];
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
