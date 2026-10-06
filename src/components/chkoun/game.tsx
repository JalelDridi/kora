"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { track } from "@/analytics/events";
import type { Card } from "@/chkoun/attributes";
import {
  deviceStorage,
  loadGame,
  loadStats,
  recordFinish,
  saveGame,
  saveStats,
  type SavedGame,
} from "@/chkoun/device";
import {
  COLUMNS,
  format,
  localName,
  tileText,
  type Labels,
} from "@/chkoun/labels";
import { unpackNames, type PackedName } from "@/chkoun/search-index";
import { shareText } from "@/engine/chkoun/share";
import type { Stats } from "@/engine/chkoun/stats";
import { colourKey } from "@/engine/chkoun/tiles";
import type { TileRow as Row } from "@/engine/chkoun/types";
import { buildEntries } from "@/engine/names";
import type { Locale } from "@/i18n/locales";
import type fr from "../../../messages/fr.json";
import { Countdown } from "./countdown";
import { LEGEND_KEY } from "./legend";
import { Result } from "./result";
import { ShareButton } from "./share-button";
import { Stats as StatsPanel } from "./stats";
import { SearchBox } from "./search-box";
import { TileHeaders, TileRow, type RowStrings } from "./tile-row";

export type GameStrings = {
  chkoun: (typeof fr)["chkoun"];
  positions: (typeof fr)["positions"];
  credit: (typeof fr)["credit"];
};

type Props = {
  locale: Locale;
  /** The name list and label tables (/chkoun-data/<locale>.json), loaded after the first paint. */
  dataUrl: string;
  strings: GameStrings;
  /** The game in the sharer's language, absolute (Q4.1). */
  shareUrl: string;
  sourcesHref: string;
};

type Store = "server" | "device";
type GameData = { names: PackedName[]; labels: Labels };
const NO_LABELS: Labels = { clubs: {}, governorates: {}, countries: {} };
type Today = { number: number; day: string; endsAt: string; store: Store };
type Phase =
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "soon"; startsAt: string }
  | { kind: "closed" }
  | { kind: "open"; today: Today };
type Notice = "network" | "newDay" | "tooMany" | "closed" | null;

const MAX_GUESSES = 8;
/** After a zero that the server does not confirm yet (a fast phone clock). */
const RETRY_AFTER_ZERO_MS = 30_000;

function fresh(n: number): SavedGame {
  return { n, token: null, rows: [], status: "playing", card: null };
}

type TodayBody = {
  status?: "soon" | "open" | "closed";
  number?: number;
  day?: string;
  endsAt?: string;
  startsAt?: string;
  store?: Store;
  finished?: {
    grid: string[];
    solved: boolean;
    guesses: number;
    card: Card | null;
  };
  stats?: Stats;
};

// The Chkoun? game in the browser (plan Task 12). It asks the server for
// today's number, restores today's game from the device, sends each guess
// with the signed state the server gave last, and keeps the result on the
// device. It never knows the answer before the server ends the game.
export function Game({
  locale,
  dataUrl,
  strings,
  shareUrl,
  sourcesHref,
}: Props) {
  const t = strings.chkoun;
  // The names and labels come after the first paint (a static JSON file):
  // on an idle moment, when the visitor reaches the search, or at once when
  // today's game has rows to show. The search keys are built on first use.
  const [data, setData] = useState<GameData | null>(null);
  const [wanted, setWanted] = useState(false);
  const fetching = useRef<Promise<void> | null>(null);
  const loadData = useCallback(() => {
    fetching.current ??= fetch(dataUrl)
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<GameData>;
      })
      .then(setData)
      .catch(() => {
        fetching.current = null;
      });
  }, [dataUrl]);
  const labels = data?.labels ?? NO_LABELS;
  const sources = useMemo(() => (data ? unpackNames(data.names) : []), [data]);
  const entries = useMemo(
    () => (wanted ? buildEntries(sources) : []),
    [sources, wanted],
  );
  const byId = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);

  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [game, setGame] = useState<SavedGame | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  /** Where the record comes from: the server when it kept the game. */
  const [statsStore, setStatsStore] = useState<Store>("device");
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState(false);
  /** Rows from this index on were guessed in this page view: they flip in. */
  const [animateFrom, setAnimateFrom] = useState(Infinity);
  const current = useRef<number | null>(null);
  /** Set by the guess that ends the game: the result heading takes focus. */
  const finishedNow = useRef(false);
  /** What a screen reader hears after each guess: the row's words. */
  const [announcement, setAnnouncement] = useState("");
  const retry = useRef<number | undefined>(undefined);
  /** loadToday itself, for the timer that asks again after a zero. */
  const again = useRef<() => void>(() => {});

  const update = useCallback((next: SavedGame) => {
    setGame(next);
    saveGame(deviceStorage(), next);
  }, []);

  const loadToday = useCallback(async () => {
    window.clearTimeout(retry.current);
    let body: TodayBody;
    try {
      const response = await fetch("/api/chkoun/today", { cache: "no-store" });
      if (response.status === 429) {
        setNotice("tooMany");
        return;
      }
      body = (await response.json()) as TodayBody;
    } catch {
      setPhase({ kind: "failed" });
      return;
    }
    if (body.status === "soon" && body.startsAt) {
      setPhase({ kind: "soon", startsAt: body.startsAt });
      return;
    }
    if (
      body.status !== "open" ||
      body.number === undefined ||
      !body.day ||
      !body.endsAt
    ) {
      setPhase({ kind: "closed" });
      return;
    }
    const today: Today = {
      number: body.number,
      day: body.day,
      endsAt: body.endsAt,
      store: body.store === "server" ? "server" : "device",
    };
    const previous = current.current;
    if (previous !== null && previous === today.number) {
      // The phone's clock reached zero first: ask again a little later.
      if (Date.parse(today.endsAt) <= Date.now() + 1000)
        retry.current = window.setTimeout(
          () => again.current(),
          RETRY_AFTER_ZERO_MS,
        );
    }
    if (previous !== null && previous !== today.number) setNotice("newDay");
    current.current = today.number;

    const storage = deviceStorage();
    let saved = loadGame(storage, today.number);
    if (!saved && body.finished) {
      saved = {
        n: today.number,
        token: null,
        rows: [],
        status: body.finished.solved ? "won" : "lost",
        card: body.finished.card,
        grid: body.finished.grid,
      };
      saveGame(storage, saved);
    }
    if (body.stats) saveStats(storage, body.stats);
    setStats(body.stats ?? loadStats(storage));
    setStatsStore(body.stats ? "server" : "device");
    setGame(saved ?? fresh(today.number));
    if (saved && (saved.rows.length > 0 || saved.status !== "playing"))
      loadData();
    setAnimateFrom(Infinity);
    setPhase({ kind: "open", today });
    if (previous !== today.number)
      track("chkoun_opened", { n: today.number, locale });
  }, [locale, loadData]);

  useEffect(() => {
    again.current = () => void loadToday();
  }, [loadToday]);

  useEffect(() => {
    // The first request once the page runs; state is set when it answers.
    const start = window.setTimeout(() => void loadToday(), 0);
    const timer = retry;
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(timer.current);
    };
  }, [loadToday]);

  useEffect(() => {
    // Fetch the names once the page is idle, so the first keystroke finds them.
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(loadData, { timeout: 4000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(loadData, 2000);
    return () => window.clearTimeout(id);
  }, [loadData]);

  useEffect(() => {
    if (game?.status === "playing" || !finishedNow.current) return;
    finishedNow.current = false;
    document.getElementById("chkoun-result")?.focus();
  }, [game?.status]);

  async function guess(id: string) {
    if (phase.kind !== "open" || !game || game.status !== "playing") return;
    if (pending) return;
    setPending(true);
    setNotice(null);
    try {
      const response = await fetch("/api/chkoun/guess", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ n: game.n, token: game.token, guess: id }),
        cache: "no-store",
      });
      const body = (await response.json().catch(() => ({}))) as {
        token?: string;
        row?: Row;
        status?: "playing" | "won" | "lost";
        card?: Card | null;
        stats?: Stats;
        store?: Store;
        error?: string;
      };
      if (response.status === 409) {
        await loadToday();
        setNotice("newDay");
        return;
      }
      if (response.status === 429) return setNotice("tooMany");
      if (response.status === 503) return setNotice("closed");
      if (!response.ok || !body.token || !body.row || !body.status)
        return setNotice("network");
      const rows = [...game.rows, { guess: id, row: body.row }];
      setAnimateFrom((from) => Math.min(from, game.rows.length));
      const next: SavedGame = {
        n: game.n,
        token: body.token,
        rows,
        status: body.status,
        card: body.status === "playing" ? null : (body.card ?? null),
      };
      update(next);
      setAnnouncement(describeRow(id, body.row));
      if (body.status !== "playing") finishedNow.current = true;
      track("chkoun_guessed", { n: game.n, guesses: rows.length, locale });
      if (body.status !== "playing") {
        track("chkoun_finished", {
          n: game.n,
          guesses: rows.length,
          solved: body.status === "won",
          locale,
        });
        setStats(
          recordFinish(
            deviceStorage(),
            { n: game.n, solved: body.status === "won", guesses: rows.length },
            body.stats ?? null,
          ),
        );
        setStatsStore(
          body.stats && body.store === "server" ? "server" : "device",
        );
      }
    } catch {
      setNotice("network");
    } finally {
      setPending(false);
    }
  }

  const rowStrings: RowStrings = {
    positions: strings.positions,
    caps: t.caps,
    abroad: t.tiles.abroad,
    noClub: t.tiles.noClub,
    headers: {
      club: t.tiles.club,
      country: t.tiles.country,
      position: t.tiles.position,
      age: t.tiles.age,
      caps: t.tiles.caps,
      governorate: t.tiles.governorate,
    },
    words: t.legend,
    arrows: {
      older: t.tiles.older,
      younger: t.tiles.younger,
      moreCaps: t.tiles.moreCaps,
      fewerCaps: t.tiles.fewerCaps,
    },
  };

  /** One guess in words: "Name. Club: X, same; Age: 25, the answer is older, close; …". */
  function describeRow(id: string, row: Row): string {
    const n = byId.get(id);
    const name = n ? localName(n, locale) : id;
    const arrows: Record<string, string> = {
      "age:up": t.tiles.older,
      "age:down": t.tiles.younger,
      "caps:up": t.tiles.moreCaps,
      "caps:down": t.tiles.fewerCaps,
    };
    const parts = COLUMNS.map((column) => {
      const tile = row[column];
      const { text, label } = tileText(column, tile, labels, rowStrings);
      const arrow = arrows[`${column}:${tile.arrow}`];
      return [
        `${rowStrings.headers[column]}: ${label ?? text}`,
        ...(arrow ? [arrow] : []),
        rowStrings.words[LEGEND_KEY[tile.colour]],
      ].join(", ");
    });
    return `${name}. ${parts.join("; ")}.`;
  }

  const guessed = useMemo(
    () => new Set(game?.rows.map((r) => r.guess) ?? []),
    [game],
  );
  const playing = phase.kind === "open" && game?.status === "playing";
  const noticeText =
    notice === null
      ? null
      : notice === "network"
        ? t.error.network
        : t.error[notice];

  return (
    <div className="chkoun-live mt-8 max-w-2xl">
      {/* One slot for the day's state, sized for its tallest content, so a
          closed day or a failed request moves nothing below it (CLS). */}
      <div className="mb-3 min-h-12">
        {phase.kind === "failed" ? (
          <div role="alert" className="flex flex-wrap items-center gap-3">
            <p className="text-lg">{t.error.network}</p>
            <button
              type="button"
              onClick={() => {
                setPhase({ kind: "loading" });
                void loadToday();
              }}
              className="min-h-11 rounded-full bg-mint px-5 font-semibold text-pitch-950"
            >
              {t.error.retry}
            </button>
          </div>
        ) : null}
        {phase.kind === "closed" ? (
          <p role="status" className="text-lg">
            {t.error.closed}
          </p>
        ) : null}
        {phase.kind === "soon" ? (
          <Countdown
            endsAt={phase.startsAt}
            template={t.soon}
            onZero={() => void loadToday()}
            className="text-lg"
          />
        ) : null}
      </div>

      {/* The search stays in place, disabled, while the day loads, is closed
          or failed, so nothing below it jumps. */}
      {phase.kind === "loading" ||
      phase.kind === "closed" ||
      phase.kind === "failed" ||
      playing ? (
        <div>
          <SearchBox
            locale={locale}
            entries={entries}
            names={byId}
            ready={entries.length > 0}
            onWant={() => {
              loadData();
              setWanted(true);
            }}
            guessed={guessed}
            disabled={!playing}
            onGuess={(id) => void guess(id)}
            onNoMatch={() =>
              track("chkoun_no_match", {
                n: phase.kind === "open" ? phase.today.number : undefined,
                locale,
              })
            }
            strings={t.search}
          />
          <p className="text-base text-chalk-dim">
            {format(t.guessCount, {
              n: Math.min((game?.rows.length ?? 0) + 1, MAX_GUESSES),
            })}
          </p>
        </div>
      ) : null}

      <p
        role="status"
        aria-live="polite"
        className="mt-2 min-h-6 text-base font-semibold"
      >
        {noticeText}
      </p>

      {data && game && game.rows.length > 0 ? (
        <section aria-label={t.guesses} className="mt-4 flex flex-col gap-3">
          <TileHeaders headers={rowStrings.headers} />
          <ol className="flex flex-col gap-4">
            {game.rows.map((r, i) => {
              const n = byId.get(r.guess);
              const shown = n ? localName(n, locale) : r.guess;
              return (
                <TileRow
                  key={r.guess}
                  id={r.guess}
                  name={shown}
                  latin={n && shown !== n.nameLatin ? n.nameLatin : null}
                  row={r.row}
                  labels={labels}
                  strings={rowStrings}
                  animate={i >= animateFrom}
                />
              );
            })}
          </ol>
        </section>
      ) : null}

      {phase.kind === "open" && data && game && game.status !== "playing" ? (
        <Result
          solved={game.status === "won"}
          guesses={game.rows.length || (game.grid?.length ?? 0)}
          card={game.card}
          locale={locale}
          labels={labels}
          strings={strings}
          sourcesHref={sourcesHref}
          endsAt={phase.today.endsAt}
          onNextDay={() => void loadToday()}
        >
          <ShareButton
            text={shareText({
              locale,
              header: t.share.header,
              number: game.n,
              guesses: game.rows.length || (game.grid?.length ?? 0),
              solved: game.status === "won",
              grid:
                game.rows.length > 0
                  ? game.rows.map((r) => colourKey(r.row))
                  : (game.grid ?? []),
              streak: stats && stats.last === game.n ? stats.streak : null,
              streakLabel: t.stats.streak,
              url: shareUrl,
            })}
            strings={t.share}
            onShared={(channel) =>
              track("chkoun_shared", { n: game.n, channel, locale })
            }
          />
          {stats ? (
            <StatsPanel stats={stats} store={statsStore} strings={t.stats} />
          ) : null}
        </Result>
      ) : null}

      {phase.kind === "open" && playing ? (
        <Countdown
          endsAt={phase.today.endsAt}
          template={t.next}
          onZero={() => void loadToday()}
          className="mt-6 min-h-7 text-base text-chalk-dim"
        />
      ) : phase.kind === "loading" ||
        phase.kind === "closed" ||
        phase.kind === "failed" ? (
        // The countdown's line, kept so nothing below moves (CLS).
        <p aria-hidden="true" className="mt-6 min-h-7" />
      ) : null}

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
