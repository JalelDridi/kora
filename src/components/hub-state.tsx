"use client";

import { Fragment, useSyncExternalStore, type ReactNode } from "react";
import { deviceStorage } from "@/chkoun/device";
import { chkounState, seasonState } from "@/chkoun/hub-state";
import type fr from "../../messages/fr.json";

type Strings = (typeof fr)["hub"]["state"];

type Props = {
  game: "chkoun" | "season";
  strings: Strings;
};

// A hub card's line about today (mobile polish M6), read from the device
// only. The server and the first client render print nothing (the same
// HTML, so hydration matches); the line comes right after, inside the box
// the card reserves for it, so nothing moves. Numbers, scores and records
// are isolated left to right inside an Arabic line ("#27", "3/8", "21-5-4").

// The snapshot is a string, so React compares it by value.
function snapshot(game: Props["game"]): string {
  const storage = deviceStorage();
  const now = new Date();
  return JSON.stringify(
    game === "chkoun" ? chkounState(storage, now) : seasonState(storage, now),
  );
}

function subscribe(changed: () => void) {
  // Another tab finishing a game, or the page coming back from the cache.
  window.addEventListener("storage", changed);
  window.addEventListener("pageshow", changed);
  return () => {
    window.removeEventListener("storage", changed);
    window.removeEventListener("pageshow", changed);
  };
}

/** "{n}" filled in (the same rule as src/chkoun/labels.ts, without its data imports). */
const format = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );

const TOKEN = /#\{n\}|\{score\}|\{guesses\}\/8|X\/8|\{w\}-\{d\}-\{l\}|\{n\}/g;

/** The template filled in, each number in its own left-to-right island. */
function line(template: string, values: Record<string, string | number>) {
  const parts: ReactNode[] = [];
  let at = 0;
  for (const m of template.matchAll(TOKEN)) {
    parts.push(template.slice(at, m.index));
    parts.push(
      <bdi key={m.index} dir="ltr">
        {format(m[0], values)}
      </bdi>,
    );
    at = m.index + m[0].length;
  }
  parts.push(template.slice(at));
  return parts.map((p, i) => <Fragment key={i}>{p}</Fragment>);
}

export function HubState({ game, strings }: Props) {
  const json = useSyncExternalStore(
    subscribe,
    () => snapshot(game),
    () => null,
  );
  if (json === null) return null;

  if (game === "season") {
    const s = JSON.parse(json) as ReturnType<typeof seasonState>;
    return (
      <p data-hub-state={s.kind} className="text-base text-chalk-dim">
        {s.kind === "played"
          ? line(strings.seasonPlayed, s)
          : strings.seasonNotYet}
      </p>
    );
  }

  const c = JSON.parse(json) as ReturnType<typeof chkounState>;
  const values = { n: c.n, guesses: c.guesses, score: `${c.guesses}/8` };
  return (
    <p data-hub-state={c.kind} className="flex flex-col text-base">
      <span className={c.kind === "notYet" ? "text-chalk-dim" : ""}>
        {line(strings[c.kind], values)}
      </span>
      {c.streak > 0 ? (
        <span className="text-chalk-dim">
          {line(strings.streak, { n: c.streak })}
        </span>
      ) : null}
    </p>
  );
}
