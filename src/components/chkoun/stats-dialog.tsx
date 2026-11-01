"use client";

import { useEffect, useState } from "react";
import { deviceStorage, loadStats } from "@/chkoun/device";
import type { Stats as StatsRecord } from "@/engine/chkoun/stats";
import { Dialog } from "../dialog";
import { OPEN_EVENT } from "../header-actions";
import { Stats, type StatsStrings } from "./stats";

export const STATS_EVENT = "kora:chkoun-stats";

export type StatsDetail = {
  stats: StatsRecord;
  store: "server" | "device";
  /** Today's puzzle number, when the game knows it. */
  n: number | null;
};

declare global {
  interface WindowEventMap {
    "kora:chkoun-stats": CustomEvent<StatsDetail>;
  }
}

/** Sent by the game (game.tsx) whenever it sets the record. */
export function publishStats(detail: StatsDetail) {
  window.dispatchEvent(new CustomEvent(STATS_EVENT, { detail }));
}

type Props = {
  strings: StatsStrings & { empty: string; dialog: string; close: string };
};

type Shown = StatsDetail | null;

// The record at any time (mobile polish M3): the header's stats button opens
// it before, during and after a game. It shows what the game last published
// or, before the game has said anything, the record kept on this device.
export function StatsDialog({ strings }: Props) {
  const [published, setPublished] = useState<Shown>(null);
  const [device, setDevice] = useState<Shown>(null);

  useEffect(() => {
    const onStats = (event: CustomEvent<StatsDetail>) =>
      setPublished(event.detail);
    // The device's record is read again on each opening, but it is only the
    // fallback until the game first publishes; from then on the dialog shows
    // what the game published, even if another tab has played since.
    const onOpen = (event: CustomEvent<string>) => {
      if (event.detail !== "stats") return;
      const stats = loadStats(deviceStorage());
      setDevice(stats ? { stats, store: "device", n: null } : null);
    };
    window.addEventListener(STATS_EVENT, onStats);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener(STATS_EVENT, onStats);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  const shown = published ?? device;
  return (
    <Dialog
      id="chkoun-stats-dialog"
      name="stats"
      title={strings.dialog}
      close={strings.close}
    >
      {shown ? (
        <Stats
          stats={shown.stats}
          store={shown.store}
          today={shown.n}
          strings={strings}
          place="dialog"
        />
      ) : (
        <p data-stats-empty="" className="text-base">
          {strings.empty}
        </p>
      )}
    </Dialog>
  );
}
