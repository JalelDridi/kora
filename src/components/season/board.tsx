"use client";

import { useEffect, useRef, useState } from "react";
import { format, localName } from "@/chkoun/labels";
import type { Locale } from "@/i18n/locales";
import type { BoardRow } from "@/season/board";
import { startPolling } from "@/season/poll";
import type { SeasonStrings } from "./island";

// Today's top sides (plan Task 12, D-S3-10): GET /api/season/board, polled
// every 30 s while the tab is visible (src/season/poll.ts). The page reads
// the endpoint's JSON only; the row type is imported as a type, so no
// engine code reaches the browser. Redis off: one line. Otherwise an
// ordered list, the rank as text, each side's eleven in a closed
// <details>; the visitor's own side (their last play) is marked in words.

export const BOARD_EVERY = 30_000;

type Board = { status: "on" | "off"; rows: BoardRow[] };

function isBoard(v: unknown): v is Board {
  if (typeof v !== "object" || v === null) return false;
  const b = v as Record<string, unknown>;
  return (
    (b.status === "on" || b.status === "off") &&
    Array.isArray(b.rows) &&
    b.rows.every((r: unknown) => {
      if (typeof r !== "object" || r === null) return false;
      const row = r as Record<string, unknown>;
      return (
        typeof row.code === "string" &&
        Array.isArray(row.squad) &&
        ["rank", "w", "d", "l", "points", "rating"].every(
          (k) => typeof row[k] === "number",
        )
      );
    })
  );
}

type Props = {
  locale: Locale;
  strings: SeasonStrings;
  /** The squad code of the visitor's last play, marked on the board. */
  ownCode: string | null;
  /**
   * board_viewed (Task 14): fired once, the first time the board is on
   * screen. Read on the first render only. No analytics call here.
   */
  onViewed?: () => void;
};

export function Board({ locale, strings: t, ownCode, onViewed }: Props) {
  const [board, setBoard] = useState<Board | null>(null);
  const section = useRef<HTMLElement>(null);
  const viewed = useRef(onViewed);

  useEffect(() => {
    viewed.current = onViewed;
  }, [onViewed]);

  // Re-started when the visitor plays: their new side shows at once.
  useEffect(() => {
    let alive = true;
    const fetchBoard = async () => {
      const response = await fetch("/api/season/board");
      const json: unknown = await response.json().catch(() => null);
      if (alive && response.ok && isBoard(json)) setBoard(json);
    };
    const stop = startPolling({
      fetchBoard,
      doc: document,
      every: BOARD_EVERY,
      timers: { set: setInterval, clear: clearInterval },
    });
    return () => {
      alive = false;
      stop();
    };
  }, [ownCode]);

  // board_viewed, once, through the onViewed prop.
  useEffect(() => {
    const el = section.current;
    if (!el || !viewed.current || typeof IntersectionObserver === "undefined")
      return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      observer.disconnect();
      viewed.current?.();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={section}
      aria-labelledby="season-board"
      data-board={board?.status ?? "loading"}
      className="flex flex-col gap-2"
    >
      <h2 id="season-board" className="text-xl font-bold">
        {t.board.title}
      </h2>
      {board === null ? null : board.status === "off" ? (
        <p className="text-base text-chalk-dim">{t.board.off}</p>
      ) : board.rows.length === 0 ? (
        <p className="text-base text-chalk-dim">{t.board.empty}</p>
      ) : (
        <ol aria-labelledby="season-board" className="flex flex-col gap-1">
          {board.rows.map((row) => {
            const own = row.code === ownCode;
            return (
              <li
                key={row.code}
                data-board-row={row.rank}
                data-own={own ? "" : undefined}
                className="flex flex-col gap-1 rounded-lg bg-pitch-800 px-3 py-2 text-base data-[own]:border-s-4 data-[own]:border-mint"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-extrabold">
                    <bdi>{format(t.board.rank, { rank: row.rank })}</bdi>
                  </span>
                  <bdi dir="ltr" className="font-extrabold text-mint">
                    {format(t.result.record, { w: row.w, d: row.d, l: row.l })}
                  </bdi>
                  <span>
                    {t.result.points} {row.points}
                  </span>
                  <span>
                    {t.rating} {row.rating.toFixed(1)}
                  </span>
                  {own ? (
                    <span data-own-mark="" className="font-bold text-mint">
                      {t.board.you}
                    </span>
                  ) : null}
                </div>
                <details>
                  <summary className="min-h-11 cursor-pointer py-2 text-sm text-chalk-dim">
                    {t.replay.squad}
                  </summary>
                  <ul className="flex flex-col gap-0.5 ps-4 text-sm">
                    {row.squad.map((p) => (
                      <li key={p.id}>
                        <bdi>{localName(p.names, locale)}</bdi>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
